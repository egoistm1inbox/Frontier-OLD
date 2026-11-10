//============================================================================================================================================
//                                                        RESTIRPATHTRACER.JS
//============================================================================================================================================
// WebGL2 ReSTIR PT Enhanced Render Engine with CandidateEvidenceFit, Reconnection Shift Jacobians, and Multi-Bounce Reflections.

import { Mat4 } from "./MathUtils.js";
import {
  GBufferVertexShader,
  GBufferFragmentShader,
  ScreenQuadVertexShader,
  ReSTIRCandidateShader,
  ReSTIRTemporalShader,
  ReSTIRSpatialShader,
  SpecularReflectionShader,
  ToneMappingShader
} from "./ShaderSources.js";

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}\nSource:\n${source}`);
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${info}`);
  }
  return prog;
}

export class ReSTIRPathTracer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false, depth: true, alpha: false });
    if (!gl) {
      throw new Error("WebGL 2.0 is not supported on this platform.");
    }
    this.gl = gl;

    // Check extensions
    this.extColorBufferFloat = gl.getExtension("EXT_color_buffer_float");
    this.extFloatLinear = gl.getExtension("OES_texture_float_linear");

    // Quad geometry for fullscreen post passes
    this.initScreenQuad();

    // Compile shader programs
    this.progGBuffer = createProgram(gl, GBufferVertexShader, GBufferFragmentShader);
    this.progCandidate = createProgram(gl, ScreenQuadVertexShader, ReSTIRCandidateShader);
    this.progTemporal = createProgram(gl, ScreenQuadVertexShader, ReSTIRTemporalShader);
    this.progSpatial = createProgram(gl, ScreenQuadVertexShader, ReSTIRSpatialShader);
    this.progReflect = createProgram(gl, ScreenQuadVertexShader, SpecularReflectionShader);
    this.progToneMap = createProgram(gl, ScreenQuadVertexShader, ToneMappingShader);

    // Engine settings (controllable via Inspector)
    this.settings = {
      renderMode: 0, // 0: ReSTIR PT Enhanced (CandidateEvidenceFit), 1: Classic PT, 2: Direct Only, 3: ReSTIR GI
      candidateCount: 4, // Initial RIS candidate paths M
      maxBounces: 3,
      enableTemporal: true,
      maxHistoryM: 32,
      enableSpatial: true,
      spatialRadius: 16,
      spatialNeighbors: 4,
      enableReflections: true,
      reflectionBounces: 3,
      reflectionScale: 1.0,
      exposure: 1.25,
      toneMapOp: 0, // 0: ACES Filmic, 1: Reinhard, 2: Linear
      viewMode: 0, // 0: Final ReSTIR, 1: Direct, 2: Indirect, 3: Reflections, 4: Refraction, 5: Normals, 6: Albedo, 7: Reservoir M
      accumWeight: 0.15
    };

    this.frameIndex = 0;
    this.width = 0;
    this.height = 0;

    // Previous frame matrices for motion vector and temporal reprojection
    this.prevView = Mat4.create();
    this.prevProj = Mat4.create();
    this.prevVehicleTransform = Mat4.create();

    // Telemetry
    this.fps = 60;
    this.sampleCount = 0;
    this.lastTime = performance.now();
    this.frameCount = 0;

    this.resize(canvas.clientWidth || 960, canvas.clientHeight || 640);
  }

  initScreenQuad() {
    const gl = this.gl;
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]);
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  createTexture(w, h, internalFormat, format, type) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  resize(width, height) {
    width = Math.max(128, width);
    height = Math.max(128, height);
    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    const gl = this.gl;
    const fType = this.extColorBufferFloat ? gl.FLOAT : gl.HALF_FLOAT;
    const rgbaFormat = this.extColorBufferFloat ? gl.RGBA32F : gl.RGBA16F;

    // 1. G-Buffer FBO (Positions, Normals, Albedo, MaterialParams, Motion)
    this.gPosDepth = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);
    this.gNormalRough = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);
    this.gAlbedoMetal = this.createTexture(width, height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.gMaterialParam = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);
    this.gMotion = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);

    this.prevGPosDepth = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);
    this.prevGNormalRough = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);

    this.gDepthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.gDepthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);

    this.fboGBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gPosDepth, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.gNormalRough, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this.gAlbedoMetal, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, this.gMaterialParam, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT4, gl.TEXTURE_2D, this.gMotion, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.gDepthBuffer);

    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0,
      gl.COLOR_ATTACHMENT1,
      gl.COLOR_ATTACHMENT2,
      gl.COLOR_ATTACHMENT3,
      gl.COLOR_ATTACHMENT4
    ]);

    // 2. Candidate Reservoir FBO
    this.candidateData = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);
    this.candidateRadiance = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);
    this.candidateStats = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);

    this.fboCandidate = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboCandidate);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.candidateData, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.candidateRadiance, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this.candidateStats, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);

    // 3. Temporal Reservoir Ping-Pong FBOs
    this.temporalData = [
      this.createTexture(width, height, rgbaFormat, gl.RGBA, fType),
      this.createTexture(width, height, rgbaFormat, gl.RGBA, fType)
    ];
    this.temporalRadiance = [
      this.createTexture(width, height, rgbaFormat, gl.RGBA, fType),
      this.createTexture(width, height, rgbaFormat, gl.RGBA, fType)
    ];
    this.temporalStats = [
      this.createTexture(width, height, rgbaFormat, gl.RGBA, fType),
      this.createTexture(width, height, rgbaFormat, gl.RGBA, fType)
    ];

    this.fboTemporal = [gl.createFramebuffer(), gl.createFramebuffer()];
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboTemporal[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.temporalData[i], 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.temporalRadiance[i], 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this.temporalStats[i], 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    }
    this.temporalPingPong = 0;

    // 4. Spatial Resampling FBO
    this.spatialIndirect = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);
    this.spatialDebug = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);

    this.fboSpatial = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboSpatial);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.spatialIndirect, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.spatialDebug, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    // 5. Specular Reflections & Refractions FBO
    this.reflectionsTex = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);
    this.refractionsTex = this.createTexture(width, height, rgbaFormat, gl.RGBA, fType);

    this.fboReflect = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboReflect);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.reflectionsTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.refractionsTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    // 6. Temporal Accumulation Buffer Ping-Pong
    this.accumTex = [
      this.createTexture(width, height, rgbaFormat, gl.RGBA, fType),
      this.createTexture(width, height, rgbaFormat, gl.RGBA, fType)
    ];
    this.fboAccum = [gl.createFramebuffer(), gl.createFramebuffer()];
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboAccum[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accumTex[i], 0);
    }
    this.accumPingPong = 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(scene, camera, vehicle) {
    const gl = this.gl;
    this.frameIndex++;
    this.sampleCount += this.settings.candidateCount;

    // Update FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastTime >= 1000.0) {
      this.fps = Math.round((this.frameCount * 1000.0) / (now - this.lastTime));
      this.frameCount = 0;
      this.lastTime = now;
    }

    gl.viewport(0, 0, this.width, this.height);

    // ==========================================
    // PASS 1: G-BUFFER GENERATION
    // ==========================================
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGBuffer);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    gl.useProgram(this.progGBuffer);

    // View & Projection Uniforms
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_view"), false, camera.viewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_projection"), false, camera.projMatrix);

    // Material Uniforms
    const m = scene.materials;
    gl.uniform3fv(gl.getUniformLocation(this.progGBuffer, "u_carPaintColor"), m.carPaintColor);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_carClearcoatWeight"), m.carClearcoatWeight);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_carClearcoatRoughness"), m.carClearcoatRoughness);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_carFlakeHeadroom"), m.carFlakeHeadroom);

    gl.uniform3fv(gl.getUniformLocation(this.progGBuffer, "u_glassColor"), m.glassColor);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_glassIor"), m.glassIor);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_glassRoughness"), m.glassRoughness);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_glassTransmission"), m.glassTransmission);

    gl.uniform3fv(gl.getUniformLocation(this.progGBuffer, "u_plasticColor"), m.plasticColor);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_plasticRoughness"), m.plasticRoughness);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_plasticSpecular"), m.plasticSpecular);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_plasticClearcoat"), m.plasticClearcoat);

    gl.uniform3fv(gl.getUniformLocation(this.progGBuffer, "u_metalColor"), m.metalColor);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_metalRoughness"), m.metalRoughness);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_metalness"), m.metalness);

    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_tyreRoughness"), m.tyreRoughness);
    gl.uniform3fv(gl.getUniformLocation(this.progGBuffer, "u_rimColor"), m.rimColor);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_rimMetallic"), m.rimMetallic);

    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_floorRoughness"), m.floorRoughness);
    gl.uniform1f(gl.getUniformLocation(this.progGBuffer, "u_floorReflectivity"), m.floorReflectivity);

    // Render Vehicle Body
    const prevMvp = Mat4.create();
    Mat4.multiply(prevMvp, this.prevProj, this.prevView);
    Mat4.multiply(prevMvp, prevMvp, this.prevVehicleTransform);

    gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_model"), false, vehicle.transformMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_prevModelViewProj"), false, prevMvp);

    gl.bindVertexArray(scene.vehicleBuffers.body.vao);
    gl.drawArrays(gl.TRIANGLES, 0, scene.vehicleBuffers.body.vertexCount);

    // Render 4 Wheels
    gl.bindVertexArray(scene.vehicleBuffers.wheel.vao);
    for (let w = 0; w < 4; w++) {
      gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_model"), false, vehicle.wheelTransforms[w]);
      gl.drawArrays(gl.TRIANGLES, 0, scene.vehicleBuffers.wheel.vertexCount);
    }

    // Render Showcase Props (Glass Sphere, Plastic Sphere, Gold Sphere, Mirror, Floor)
    const identityPrev = Mat4.create();
    Mat4.multiply(identityPrev, this.prevProj, this.prevView);

    // 1. Glass Sphere
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_model"), false, scene.glassSphereTransform);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_prevModelViewProj"), false, identityPrev);
    gl.bindVertexArray(scene.glassSphereMesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, scene.glassSphereMesh.vertexCount);

    // 2. Plastic Sphere
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_model"), false, scene.plasticSphereTransform);
    gl.bindVertexArray(scene.plasticSphereMesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, scene.plasticSphereMesh.vertexCount);

    // 3. Gold Sphere
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_model"), false, scene.goldSphereTransform);
    gl.bindVertexArray(scene.goldSphereMesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, scene.goldSphereMesh.vertexCount);

    // 4. Standing Chrome Mirror
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_model"), false, scene.mirrorTransform);
    gl.bindVertexArray(scene.mirrorMesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, scene.mirrorMesh.vertexCount);

    // 5. Floor Runway
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progGBuffer, "u_model"), false, scene.floorTransform);
    gl.bindVertexArray(scene.floorMesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, scene.floorMesh.vertexCount);

    gl.disable(gl.DEPTH_TEST);

    // ==========================================
    // PASS 2: ReSTIR PT CANDIDATE GENERATION
    // ==========================================
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboCandidate);
    gl.useProgram(this.progCandidate);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gPosDepth);
    gl.uniform1i(gl.getUniformLocation(this.progCandidate, "u_gPosDepth"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.gNormalRough);
    gl.uniform1i(gl.getUniformLocation(this.progCandidate, "u_gNormalRough"), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.gAlbedoMetal);
    gl.uniform1i(gl.getUniformLocation(this.progCandidate, "u_gAlbedoMetal"), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.gMaterialParam);
    gl.uniform1i(gl.getUniformLocation(this.progCandidate, "u_gMaterialParam"), 3);

    // Camera & PRNG uniforms
    gl.uniform3fv(gl.getUniformLocation(this.progCandidate, "u_cameraPos"), camera.position);
    const invView = Mat4.create();
    Mat4.invert(invView, camera.viewMatrix);
    const invProj = Mat4.create();
    Mat4.invert(invProj, camera.projMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progCandidate, "u_invView"), false, invView);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progCandidate, "u_invProjection"), false, invProj);
    gl.uniform1ui(gl.getUniformLocation(this.progCandidate, "u_frameIndex"), this.frameIndex);
    gl.uniform1i(gl.getUniformLocation(this.progCandidate, "u_candidateCount"), this.settings.candidateCount);
    gl.uniform1i(gl.getUniformLocation(this.progCandidate, "u_maxBounces"), this.settings.maxBounces);

    // Scene Lighting
    const l = scene.lighting;
    gl.uniform3fv(gl.getUniformLocation(this.progCandidate, "u_sunDirection"), l.sunDirection);
    gl.uniform3fv(gl.getUniformLocation(this.progCandidate, "u_sunColor"), l.sunColor);
    gl.uniform1f(gl.getUniformLocation(this.progCandidate, "u_sunIntensity"), l.sunIntensity);
    gl.uniform3fv(gl.getUniformLocation(this.progCandidate, "u_skyZenith"), l.skyZenith);
    gl.uniform3fv(gl.getUniformLocation(this.progCandidate, "u_skyHorizon"), l.skyHorizon);

    gl.uniform3fv(gl.getUniformLocation(this.progCandidate, "u_softboxPos"), l.softboxPos);
    gl.uniform3fv(gl.getUniformLocation(this.progCandidate, "u_softboxSize"), l.softboxSize);
    gl.uniform3fv(gl.getUniformLocation(this.progCandidate, "u_softboxColor"), l.softboxColor);
    gl.uniform1f(gl.getUniformLocation(this.progCandidate, "u_softboxIntensity"), l.softboxIntensity);

    gl.uniform3fv(gl.getUniformLocation(this.progCandidate, "u_neonRingPos"), l.neonRingPos);
    gl.uniform1f(gl.getUniformLocation(this.progCandidate, "u_neonRingRadius"), l.neonRingRadius);
    gl.uniform3fv(gl.getUniformLocation(this.progCandidate, "u_neonRingColor"), l.neonRingColor);
    gl.uniform1f(gl.getUniformLocation(this.progCandidate, "u_neonRingIntensity"), l.neonRingIntensity);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ==========================================
    // PASS 3: ReSTIR TEMPORAL RESAMPLING
    // ==========================================
    const writeIdx = this.temporalPingPong;
    const readIdx = 1 - writeIdx;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboTemporal[writeIdx]);
    gl.useProgram(this.progTemporal);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.candidateData);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_currData"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.candidateRadiance);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_currRadiance"), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.candidateStats);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_currStats"), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.temporalData[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_prevData"), 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.temporalRadiance[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_prevRadiance"), 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.temporalStats[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_prevStats"), 5);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.gPosDepth);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_gPosDepth"), 6);

    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.gNormalRough);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_gNormalRough"), 7);

    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.prevGPosDepth);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_prevGPosDepth"), 8);

    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, this.prevGNormalRough);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_prevGNormalRough"), 9);

    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, this.gMotion);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_gMotion"), 10);

    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_enableTemporal"), this.settings.enableTemporal ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.progTemporal, "u_maxHistoryM"), this.settings.maxHistoryM);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ==========================================
    // PASS 4: ReSTIR SPATIAL RESAMPLING
    // ==========================================
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboSpatial);
    gl.useProgram(this.progSpatial);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.temporalData[writeIdx]);
    gl.uniform1i(gl.getUniformLocation(this.progSpatial, "u_reservoirData"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.temporalRadiance[writeIdx]);
    gl.uniform1i(gl.getUniformLocation(this.progSpatial, "u_reservoirRadiance"), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.temporalStats[writeIdx]);
    gl.uniform1i(gl.getUniformLocation(this.progSpatial, "u_reservoirStats"), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.gPosDepth);
    gl.uniform1i(gl.getUniformLocation(this.progSpatial, "u_gPosDepth"), 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.gNormalRough);
    gl.uniform1i(gl.getUniformLocation(this.progSpatial, "u_gNormalRough"), 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.gAlbedoMetal);
    gl.uniform1i(gl.getUniformLocation(this.progSpatial, "u_gAlbedoMetal"), 5);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.gMaterialParam);
    gl.uniform1i(gl.getUniformLocation(this.progSpatial, "u_gMaterialParam"), 6);

    gl.uniform1i(gl.getUniformLocation(this.progSpatial, "u_enableSpatial"), this.settings.enableSpatial ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.progSpatial, "u_spatialRadius"), this.settings.spatialRadius);
    gl.uniform1i(gl.getUniformLocation(this.progSpatial, "u_spatialNeighbors"), this.settings.spatialNeighbors);
    gl.uniform2f(gl.getUniformLocation(this.progSpatial, "u_screenSize"), this.width, this.height);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Advance temporal ping-pong
    this.temporalPingPong = 1 - this.temporalPingPong;

    // ==========================================
    // PASS 5: SPECULAR REFLECTIONS & REFRACTIONS
    // ==========================================
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboReflect);
    gl.useProgram(this.progReflect);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gPosDepth);
    gl.uniform1i(gl.getUniformLocation(this.progReflect, "u_gPosDepth"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.gNormalRough);
    gl.uniform1i(gl.getUniformLocation(this.progReflect, "u_gNormalRough"), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.gAlbedoMetal);
    gl.uniform1i(gl.getUniformLocation(this.progReflect, "u_gAlbedoMetal"), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.gMaterialParam);
    gl.uniform1i(gl.getUniformLocation(this.progReflect, "u_gMaterialParam"), 3);

    gl.uniform3fv(gl.getUniformLocation(this.progReflect, "u_cameraPos"), camera.position);
    gl.uniform1i(gl.getUniformLocation(this.progReflect, "u_reflectionBounces"), this.settings.reflectionBounces);
    gl.uniform1f(gl.getUniformLocation(this.progReflect, "u_reflectionScale"), this.settings.reflectionScale);
    gl.uniform1f(gl.getUniformLocation(this.progReflect, "u_glassIor"), m.glassIor);

    gl.uniform3fv(gl.getUniformLocation(this.progReflect, "u_sunDirection"), l.sunDirection);
    gl.uniform3fv(gl.getUniformLocation(this.progReflect, "u_sunColor"), l.sunColor);
    gl.uniform1f(gl.getUniformLocation(this.progReflect, "u_sunIntensity"), l.sunIntensity);
    gl.uniform3fv(gl.getUniformLocation(this.progReflect, "u_skyZenith"), l.skyZenith);
    gl.uniform3fv(gl.getUniformLocation(this.progReflect, "u_skyHorizon"), l.skyHorizon);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ==========================================
    // PASS 6: RECOMBINATION & TONE MAPPING
    // ==========================================
    const writeAccum = this.accumPingPong;
    const readAccum = 1 - writeAccum;

    // Output to screen / canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.progToneMap);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gPosDepth);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_gPosDepth"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.gNormalRough);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_gNormalRough"), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.gAlbedoMetal);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_gAlbedoMetal"), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.gMaterialParam);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_gMaterialParam"), 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.candidateRadiance);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_directLight"), 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.spatialIndirect);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_indirectRadiance"), 5);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.reflectionsTex);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_reflections"), 6);

    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.refractionsTex);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_refractions"), 7);

    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex[readAccum]);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_prevAccum"), 8);

    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, this.spatialDebug);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_reservoirDebug"), 9);

    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_viewMode"), this.settings.viewMode);
    gl.uniform1f(gl.getUniformLocation(this.progToneMap, "u_exposure"), this.settings.exposure);
    gl.uniform1i(gl.getUniformLocation(this.progToneMap, "u_toneMapOp"), this.settings.toneMapOp);
    gl.uniform1f(gl.getUniformLocation(this.progToneMap, "u_accumWeight"), this.settings.accumWeight);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Save previous frame matrices and textures for temporal reprojection
    Mat4.copy(this.prevView, camera.viewMatrix);
    Mat4.copy(this.prevProj, camera.projMatrix);
    Mat4.copy(this.prevVehicleTransform, vehicle.transformMatrix);

    this.accumPingPong = 1 - this.accumPingPong;
  }
}
