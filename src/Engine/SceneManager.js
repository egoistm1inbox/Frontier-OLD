//============================================================================================================================================
//                                                            SCENEMANAGER.JS
//============================================================================================================================================
// Manages scene geometries, material parameters, showcase props, and render buffers.

import { Mat4, Vec3 } from "./MathUtils.js";
import { BuildVehicleBuffers } from "../Vehicle/VehicleMeshLoader.js";

// Helper to create sphere mesh buffers
function createSphereGeometry(radius, latSegments, lonSegments, matId) {
  const positions = [];
  const normals = [];
  const matIds = [];

  for (let lat = 0; lat < latSegments; lat++) {
    const theta1 = (lat / latSegments) * Math.PI;
    const theta2 = ((lat + 1) / latSegments) * Math.PI;

    for (let lon = 0; lon < lonSegments; lon++) {
      const phi1 = (lon / lonSegments) * 2 * Math.PI;
      const phi2 = ((lon + 1) / lonSegments) * 2 * Math.PI;

      // 4 corners of quad
      const v0 = [radius * Math.sin(theta1) * Math.cos(phi1), radius * Math.sin(theta1) * Math.sin(phi1), radius * Math.cos(theta1)];
      const v1 = [radius * Math.sin(theta2) * Math.cos(phi1), radius * Math.sin(theta2) * Math.sin(phi1), radius * Math.cos(theta2)];
      const v2 = [radius * Math.sin(theta2) * Math.cos(phi2), radius * Math.sin(theta2) * Math.sin(phi2), radius * Math.cos(theta2)];
      const v3 = [radius * Math.sin(theta1) * Math.cos(phi2), radius * Math.sin(theta1) * Math.sin(phi2), radius * Math.cos(theta1)];

      const addVert = (v) => {
        positions.push(...v);
        const len = Math.hypot(...v) || 1.0;
        normals.push(v[0] / len, v[1] / len, v[2] / len);
        matIds.push(matId);
      };

      // Tri 1: v0, v1, v2
      addVert(v0); addVert(v1); addVert(v2);
      // Tri 2: v0, v2, v3
      addVert(v0); addVert(v2); addVert(v3);
    }
  }

  const vertCount = positions.length / 3;
  const interleaved = new Float32Array(vertCount * 8);
  for (let i = 0; i < vertCount; i++) {
    interleaved[i * 8]     = positions[i * 3];
    interleaved[i * 8 + 1] = positions[i * 3 + 1];
    interleaved[i * 8 + 2] = positions[i * 3 + 2];

    interleaved[i * 8 + 3] = normals[i * 3];
    interleaved[i * 8 + 4] = normals[i * 3 + 1];
    interleaved[i * 8 + 5] = normals[i * 3 + 2];

    interleaved[i * 8 + 6] = matIds[i];
    interleaved[i * 8 + 7] = 0.0;
  }

  return { interleaved, vertCount };
}

// Helper to create planar quad buffer (for standing mirror and ground floor)
function createQuadGeometry(p0, p1, p2, p3, normal, matId) {
  const positions = [
    ...p0, ...p1, ...p2,
    ...p0, ...p2, ...p3
  ];
  const vertCount = 6;
  const interleaved = new Float32Array(vertCount * 8);
  for (let i = 0; i < vertCount; i++) {
    interleaved[i * 8]     = positions[i * 3];
    interleaved[i * 8 + 1] = positions[i * 3 + 1];
    interleaved[i * 8 + 2] = positions[i * 3 + 2];

    interleaved[i * 8 + 3] = normal[0];
    interleaved[i * 8 + 4] = normal[1];
    interleaved[i * 8 + 5] = normal[2];

    interleaved[i * 8 + 6] = matId;
    interleaved[i * 8 + 7] = 0.0;
  }
  return { interleaved, vertCount };
}

function uploadVao(gl, interleaved) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);

  // Attrib 0: position (3 floats)
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  // Attrib 1: normal (3 floats)
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  // Attrib 2: matId (1 float)
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 24);

  gl.bindVertexArray(null);
  return { vao, vbo, vertexCount: interleaved.length / 8 };
}

export class SceneManager {
  constructor(gl) {
    this.gl = gl;

    // Load authentic vehicle mesh
    this.vehicleBuffers = BuildVehicleBuffers(gl);

    // Build Material Showcase Props
    // 1. Optical Glass Sphere (matId: 85.0)
    const glassSphere = createSphereGeometry(0.8, 32, 48, 85.0);
    this.glassSphereMesh = uploadVao(gl, glassSphere.interleaved);
    this.glassSphereTransform = Mat4.create();
    this.glassSpherePos = [6.0, -3.0, 1.2];
    Mat4.fromRotationTranslation(this.glassSphereTransform, [0, 0, 0, 1], this.glassSpherePos);

    // 2. High-Gloss Plastic Sphere (matId: 54.0)
    const plasticSphere = createSphereGeometry(0.8, 32, 48, 54.0);
    this.plasticSphereMesh = uploadVao(gl, plasticSphere.interleaved);
    this.plasticSphereTransform = Mat4.create();
    this.plasticSpherePos = [6.0, -1.0, 1.2];
    Mat4.fromRotationTranslation(this.plasticSphereTransform, [0, 0, 0, 1], this.plasticSpherePos);

    // 3. Gold Conductor Sphere (matId: 84.0)
    const goldSphere = createSphereGeometry(0.8, 32, 48, 84.0);
    this.goldSphereMesh = uploadVao(gl, goldSphere.interleaved);
    this.goldSphereTransform = Mat4.create();
    this.goldSpherePos = [6.0, 3.0, 1.2];
    Mat4.fromRotationTranslation(this.goldSphereTransform, [0, 0, 0, 1], this.goldSpherePos);

    // 4. Polished Standing Chrome Mirror Panel (matId: 82.0)
    // Vertical panel at x = 8.5, y: -4.5..4.5, z: 0..3.2
    const mirrorQuad = createQuadGeometry(
      [8.5, -4.5, 0.0],
      [8.5, 4.5, 0.0],
      [8.5, 4.5, 3.2],
      [8.5, -4.5, 3.2],
      [-1.0, 0.0, 0.0],
      82.0
    );
    this.mirrorMesh = uploadVao(gl, mirrorQuad.interleaved);
    this.mirrorTransform = Mat4.create();

    // 5. Proving Grounds Ground Floor (matId: 26.0)
    // Large checkered asphalt runway at z = 0
    const floorQuad = createQuadGeometry(
      [-80.0, -50.0, 0.0],
      [120.0, -50.0, 0.0],
      [120.0, 50.0, 0.0],
      [-80.0, 50.0, 0.0],
      [0.0, 0.0, 1.0],
      26.0
    );
    this.floorMesh = uploadVao(gl, floorQuad.interleaved);
    this.floorTransform = Mat4.create();

    // Showcase Pedestals
    const ped1 = createSphereGeometry(0.9, 16, 24, 8.0); // pedestal for glass
    this.pedestalMesh = uploadVao(gl, ped1.interleaved);

    // Comprehensive Materials Parameters (Live customizable via Inspector)
    this.materials = {
      // Car Paint
      carPaintColor: [0.105, 0.302, 0.243], // British Racing Green
      carClearcoatWeight: 1.0,
      carClearcoatRoughness: 0.04,
      carFlakeHeadroom: 0.78,

      // Glass (Dielectric)
      glassColor: [0.96, 0.98, 1.0],
      glassIor: 1.52,
      glassRoughness: 0.01,
      glassTransmission: 1.0,

      // Plastic
      plasticColor: [0.85, 0.08, 0.04], // Vibrant cherry red
      plasticRoughness: 0.06,
      plasticSpecular: 0.05,
      plasticClearcoat: 1.0,

      // Metals / Conductors
      metalColor: [1.00, 0.71, 0.29], // Gold F0
      metalRoughness: 0.08,
      metalness: 1.0,

      // Tyre & Rims
      tyreRoughness: 0.76,
      rimColor: [0.06, 0.22, 0.62], // Blue Mag rim finish
      rimMetallic: 1.0,

      // Floor
      floorRoughness: 0.28,
      floorReflectivity: 0.85,
    };

    // Lighting & Environment Parameters
    this.lighting = {
      sunDirection: [0.6, 0.4, 0.8],
      sunColor: [1.0, 0.96, 0.88],
      sunIntensity: 3.5,
      sunElevation: 48.0, // degrees
      sunAzimuth: 140.0,  // degrees

      skyZenith: [0.08, 0.16, 0.35],
      skyHorizon: [0.55, 0.65, 0.78],

      softboxPos: [0.0, 0.0, 7.5],
      softboxSize: [7.0, 5.0, 0.1],
      softboxColor: [1.0, 0.98, 0.92],
      softboxIntensity: 12.0,

      neonRingPos: [7.0, 0.0, 2.2],
      neonRingRadius: 2.2,
      neonRingColor: [0.1, 0.85, 1.0], // Neon Cyan
      neonRingIntensity: 25.0
    };

    this.updateSunDirection();
  }

  updateSunDirection() {
    const el = (this.lighting.sunElevation * Math.PI) / 180.0;
    const az = (this.lighting.sunAzimuth * Math.PI) / 180.0;
    this.lighting.sunDirection = [
      Math.cos(el) * Math.sin(az),
      Math.cos(el) * Math.cos(az),
      Math.sin(el)
    ];
  }
}
