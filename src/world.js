import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TrackDirector } from './track.js';
import { STEP, surfaceLift, clamp, lerp } from './path.js';

const CYAN = 0x31f7ff;
const MAGENTA = 0xff2fd0;
const VIOLET = 0x8b5cff;
const AMBER = 0xffd166;

const CROSS = [-1, -0.86, -0.66, -0.46, -0.26, -0.09, 0.09, 0.26, 0.46, 0.66, 0.86, 1];
const CHUNK = 56;

/* ------------------------------------------------------------------ textures */
function makeGridTextures() {
  const S = 256;
  const base = document.createElement('canvas');
  base.width = base.height = S;
  const g = base.getContext('2d');
  g.fillStyle = '#0d1226';
  g.fillRect(0, 0, S, S);
  // subtle panel noise
  for (let i = 0; i < 240; i++) {
    g.fillStyle = `rgba(120,150,255,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * S, Math.random() * S, 3 + Math.random() * 8, 2);
  }
  // longitudinal edge rails
  g.fillStyle = 'rgba(49,247,255,0.62)';
  g.fillRect(0, 0, 6, S);
  g.fillRect(S - 6, 0, 6, S);
  // side accents
  g.fillStyle = 'rgba(255,47,208,0.22)';
  g.fillRect(S * 0.13, 0, 2, S);
  g.fillRect(S * 0.87 - 2, 0, 2, S);
  // cross seams
  g.strokeStyle = 'rgba(49,247,255,0.30)';
  g.lineWidth = 2;
  for (let i = 0; i <= 2; i++) {
    const y = (i / 2) * S;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(S, y);
    g.stroke();
  }
  // dashed centre line
  g.fillStyle = 'rgba(255,47,208,0.55)';
  g.fillRect(S / 2 - 1.5, S * 0.1, 3, S * 0.32);
  g.fillStyle = 'rgba(49,247,255,0.5)';
  g.fillRect(S / 2 - 1.5, S * 0.6, 3, S * 0.3);

  const glow = document.createElement('canvas');
  glow.width = glow.height = S;
  const e = glow.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  e.fillStyle = '#9df9ff';
  e.fillRect(0, 0, 5, S);
  e.fillRect(S - 5, 0, 5, S);
  e.fillStyle = '#ff8be6';
  e.fillRect(S * 0.13, 0, 2, S);
  e.fillRect(S * 0.87 - 2, 0, 2, S);
  e.strokeStyle = '#2b8cff';
  e.lineWidth = 2;
  for (let i = 0; i <= 2; i++) {
    const y = (i / 2) * S;
    e.beginPath();
    e.moveTo(0, y);
    e.lineTo(S, y);
    e.stroke();
  }
  e.fillStyle = '#ff5fd8';
  e.fillRect(S / 2 - 1.5, S * 0.1, 3, S * 0.32);
  e.fillStyle = '#6ff4ff';
  e.fillRect(S / 2 - 1.5, S * 0.6, 3, S * 0.3);

  const t = new THREE.CanvasTexture(base);
  const em = new THREE.CanvasTexture(glow);
  for (const tx of [t, em]) {
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.anisotropy = 8;
    tx.colorSpace = THREE.SRGBColorSpace;
  }
  return { map: t, emissiveMap: em };
}

/* ------------------------------------------------------------------ helpers */
const V = new THREE.Vector3();
const V2 = new THREE.Vector3();

function frameBasis(f, outR, outF) {
  outR.set(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
  outF.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
}

function wallLift(f, side, w) {
  const base = surfaceLift(f, side);
  return base + (f.curve * 0.16 + 2.1) * w * w + 0.35 * w;
}

function crossPoint(f, u, extra = 0) {
  const lat = u * f.halfW;
  const rx = Math.cos(f.yaw);
  const rz = -Math.sin(f.yaw);
  return [f.x + rx * lat, f.y + surfaceLift(f, u) + extra, f.z + rz * lat];
}

/* ------------------------------------------------------------------ World */
export class World {
  constructor(canvas, seed = 2027) {
    this.canvas = canvas;
    this.director = new TrackDirector(seed);
    this.builtUpTo = 0;
    this.chunks = [];
    this.propMeshes = new Map();
    this.propCursor = 0;
    this.time = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0418, 0.0038);

    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.35, 2600);
    this.camera.position.set(0, 8, -14);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.95, 0.72, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.composer.setSize(innerWidth, innerHeight);

    this.scene.environment = this._buildEnvironmentMap();
    this._initMaterials();
    this._initLights();
    this._initEnvironment();
    this._initPlayer();
    this._initTrail();

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  /* ---------------------------------------------------------------- setup */
  _initMaterials() {
    const g = makeGridTextures();
    this.tex = g;
    this.matRoad = new THREE.MeshStandardMaterial({
      map: g.map,
      emissiveMap: g.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 1.15,
      color: 0xc3cff2,
      metalness: 0.55,
      roughness: 0.42,
      side: THREE.DoubleSide,
    });
    this.matWall = new THREE.MeshStandardMaterial({
      color: 0x151233,
      metalness: 0.75,
      roughness: 0.35,
      emissive: 0x2a0f4a,
      emissiveIntensity: 0.8,
      side: THREE.DoubleSide,
    });
    this.matRail = new THREE.MeshBasicMaterial({ color: 0x9df9ff, side: THREE.DoubleSide, toneMapped: false });
    this.matRailPink = new THREE.MeshBasicMaterial({ color: 0xff8be6, side: THREE.DoubleSide, toneMapped: false });
    this.matTunnel = new THREE.MeshStandardMaterial({
      color: 0x0b0a1c,
      metalness: 0.85,
      roughness: 0.3,
      emissive: 0x120a2e,
      emissiveIntensity: 0.6,
      side: THREE.DoubleSide,
    });
    this.matNeonCyan = new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false });
    this.matNeonPink = new THREE.MeshBasicMaterial({ color: MAGENTA, toneMapped: false });
    this.matNeonAmber = new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false });
    this.matNeonViolet = new THREE.MeshBasicMaterial({ color: VIOLET, toneMapped: false });
    this.matDark = new THREE.MeshStandardMaterial({ color: 0x0d0a20, metalness: 0.8, roughness: 0.35 });
  }

  /** Cheap procedural studio environment so metal/glass have something to reflect. */
  _buildEnvironmentMap() {
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          vec3 top = vec3(0.16, 0.10, 0.42);
          vec3 hor = vec3(0.55, 0.16, 0.55);
          vec3 bot = vec3(0.03, 0.02, 0.07);
          vec3 c = mix(bot, hor, smoothstep(-0.7, 0.0, d.y));
          c = mix(c, top, smoothstep(0.0, 0.9, d.y));
          // two soft light cards for specular highlights
          float a = pow(max(0.0, dot(d, normalize(vec3(0.6, 0.5, -0.6)))), 24.0);
          float b = pow(max(0.0, dot(d, normalize(vec3(-0.7, 0.35, 0.5)))), 24.0);
          c += vec3(0.25, 0.85, 1.0) * a * 2.2;
          c += vec3(1.0, 0.3, 0.85) * b * 1.8;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    envScene.add(new THREE.Mesh(geo, mat));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    geo.dispose();
    mat.dispose();
    return rt.texture;
  }

  _initLights() {
    const hemi = new THREE.HemisphereLight(0x6f7bff, 0x1a0030, 0.85);
    this.scene.add(hemi);
    this.moon = new THREE.DirectionalLight(0xbfd4ff, 1.15);
    this.moon.position.set(-60, 90, -40);
    this.scene.add(this.moon);
    this.rimA = new THREE.PointLight(CYAN, 40, 90, 2);
    this.rimB = new THREE.PointLight(MAGENTA, 40, 90, 2);
    this.scene.add(this.rimA, this.rimB);
  }

  _initEnvironment() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1900, 32, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color(0x04010c) }, mid: { value: new THREE.Color(0x160a3a) }, bot: { value: new THREE.Color(0x2a0436) } },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
          void main(){
            float h = normalize(vP).y;
            vec3 c = mix(bot, mid, smoothstep(-0.55, 0.06, h));
            c = mix(c, top, smoothstep(0.02, 0.85, h));
            float glow = pow(max(0.0, 1.0 - abs(h - 0.03) * 3.2), 7.0);
            c += vec3(0.35, 0.06, 0.34) * glow;
            gl_FragColor = vec4(c, 1.0);
          }`,
      })
    );
    this.scene.add(sky);

    // starfield
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const r = 900 + Math.random() * 700;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 1.5 - 0.5);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r * 0.6;
      pos[i * 3 + 1] = Math.cos(ph) * r * 0.55 + 120;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r * 0.6;
      c.setHSL(0.52 + Math.random() * 0.25, 0.9, 0.6 + Math.random() * 0.35);
      col.set([c.r, c.g, c.b]);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 3.2, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.stars);

    // giant planet
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(330, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec3 vN; varying vec3 vW; varying vec2 vUv;
          void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vW = (modelMatrix * vec4(position,1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          void main(){
            vec3 L = normalize(vec3(-0.6, 0.4, -0.7));
            float d = max(dot(normalize(vN), L), 0.0);
            float bands = sin(vUv.y * 42.0 + sin(vUv.x * 14.0 + uTime * 0.08) * 1.6) * 0.5 + 0.5;
            vec3 deep = vec3(0.05, 0.02, 0.13);
            vec3 lit = mix(vec3(0.45, 0.16, 0.72), vec3(0.13, 0.85, 0.95), bands);
            vec3 c = mix(deep, lit, pow(d, 1.3));
            c += vec3(0.9, 0.25, 0.7) * pow(1.0 - d, 6.0) * 0.55;
            gl_FragColor = vec4(c, 1.0);
          }`,
      })
    );
    planet.position.set(-420, 210, 980);
    this.planet = planet;
    this.scene.add(planet);

    // planet ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(430, 620, 96),
      new THREE.MeshBasicMaterial({ color: 0xb46bff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.position.copy(planet.position);
    ring.rotation.set(-1.15, 0.3, 0.2);
    this.planetRing = ring;
    this.scene.add(ring);

    // void grid far below
    const gtex = makeGridTextures().map;
    gtex.repeat.set(60, 60);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000, 1, 1),
      new THREE.MeshBasicMaterial({ map: gtex, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x5a4bff })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -140;
    this.scene.add(floor);
    this.voidFloor = floor;

    // distant floating monoliths
    this.monoliths = new THREE.Group();
    const geoB = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 44; i++) {
      const w = 6 + Math.random() * 26;
      const h = 12 + Math.random() * 90;
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() < 0.5 ? CYAN : MAGENTA,
        wireframe: true,
        transparent: true,
        opacity: 0.1 + Math.random() * 0.16,
        depthWrite: false,
      });
      const m = new THREE.Mesh(geoB, mat);
      m.scale.set(w, h, w);
      const ang = Math.random() * Math.PI * 2;
      const rad = 180 + Math.random() * 520;
      m.position.set(Math.cos(ang) * rad, -60 + Math.random() * 210, Math.sin(ang) * rad);
      m.userData.spin = (Math.random() - 0.5) * 0.22;
      m.userData.baseY = m.position.y;
      m.userData.ph = Math.random() * 6.28;
      this.monoliths.add(m);
    }
    this.scene.add(this.monoliths);
  }

  _initPlayer() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1b1a3d, metalness: 0.95, roughness: 0.22, emissive: 0x0a0820, emissiveIntensity: 1 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a2a55, metalness: 0.9, roughness: 0.3 });
    const glowMat = new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false });

    // hull
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.3, 6, 14), bodyMat);
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1, 1, 0.62);
    hull.position.y = 0.72;
    g.add(hull);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 10), trimMat);
    nose.rotation.x = Math.PI / 2;
    nose.scale.set(1, 1, 0.6);
    nose.position.set(0, 0.72, 2.15);
    g.add(nose);

    // canopy
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x081c33, metalness: 1, roughness: 0.08, transparent: true, opacity: 0.85, emissive: 0x113a55, emissiveIntensity: 0.6 })
    );
    canopy.scale.set(0.86, 0.72, 1.5);
    canopy.position.set(0, 0.95, 0.32);
    g.add(canopy);

    // side pods with emissive intakes
    this.pods = [];
    for (const sx of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.7, 4, 10), trimMat);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(sx * 0.78, 0.52, -0.15);
      g.add(pod);
      const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), glowMat);
      ember.rotation.x = Math.PI / 2;
      ember.position.set(sx * 0.78, 0.52, -1.08);
      g.add(ember);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.9), glowMat);
      strip.position.set(sx * 0.55, 0.92, -0.1);
      g.add(strip);
      this.pods.push(ember);
    }

    // rear thruster flare
    this.thruster = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 1.7, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    this.thruster.rotation.x = -Math.PI / 2;
    this.thruster.position.set(0, 0.7, -1.9);
    g.add(this.thruster);

    // hover glow under the bike
    this.hover = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 24),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    this.hover.rotation.x = -Math.PI / 2;
    this.hover.position.y = 0.06;
    g.add(this.hover);

    // rider
    const rider = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 4, 10), new THREE.MeshStandardMaterial({ color: 0x120f28, roughness: 0.6, metalness: 0.4, emissive: 0x3a1470, emissiveIntensity: 0.5 }));
    torso.position.set(0, 1.28, -0.1);
    torso.rotation.x = 0.55;
    rider.add(torso);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 12), new THREE.MeshStandardMaterial({ color: 0x0b0a1a, metalness: 0.7, roughness: 0.25 }));
    helmet.position.set(0, 1.62, 0.2);
    rider.add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, -0.9, 1.8, 0.7, 0.9), new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false }));
    visor.position.copy(helmet.position);
    visor.rotation.y = Math.PI;
    rider.add(visor);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 3, 8), trimMat);
      arm.position.set(sx * 0.26, 1.24, 0.24);
      arm.rotation.set(1.05, 0, sx * -0.18);
      rider.add(arm);
    }
    g.add(rider);
    this.rider = rider;

    this.bike = g;
    g.rotation.order = 'YXZ';
    this.scene.add(g);

    this.bikeLight = new THREE.PointLight(CYAN, 26, 26, 2);
    this.bikeLight.position.set(0, 1.4, 0.4);
    g.add(this.bikeLight);

    // shield bubble
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(2.3, 20, 14),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true, toneMapped: false })
    );
    this.bubble.position.y = 0.9;
    g.add(this.bubble);
  }

  _initTrail() {
    const N = 26;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3);
    const col = new Float32Array(N * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    this.trail = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    this.trail.frustumCulled = false;
    this.trailHistory = [];
    this.trailN = N;
    this.scene.add(this.trail);
  }

  /* -------------------------------------------------------------- geometry */
  _buildChunk(s0, s1) {
    const p = this.director.path;
    const group = new THREE.Group();
    group.userData = { s0, s1 };

    const frames = p.framesBetween(s0, s1);
    if (frames.length < 2) return null;

    const nc = CROSS.length;

    // ---- road: split into strips wherever the surface is missing (gaps)
    const strips = [];
    let cur = [];
    for (const f of frames) {
      if (f.road > 0) cur.push(f);
      else if (cur.length) { strips.push(cur); cur = []; }
    }
    if (cur.length) strips.push(cur);

    for (const strip of strips) {
      if (strip.length < 2) continue;
      const rows = strip.length;
      const pos = new Float32Array(rows * nc * 3);
      const uv = new Float32Array(rows * nc * 2);
      const idx = [];
      for (let r = 0; r < rows; r++) {
        const f = strip[r];
        for (let c = 0; c < nc; c++) {
          const u = CROSS[c];
          const [x, y, z] = crossPoint(f, u);
          const o = (r * nc + c) * 3;
          pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
          const o2 = (r * nc + c) * 2;
          uv[o2] = (u + 1) / 2;
          uv[o2 + 1] = f.s / 12;
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < nc - 1; c++) {
          const a = r * nc + c, b = a + 1, d = a + nc, e = d + 1;
          idx.push(a, d, b, b, d, e);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      group.add(new THREE.Mesh(geo, this.matRoad));
    }

    // ---- skatepark side walls (quarter-pipes) + rails
    for (const side of [-1, 1]) {
      const WF = [0, 0.34, 0.68, 1];
      const rows = frames.length;
      const pos = new Float32Array(rows * WF.length * 3);
      const idx = [];
      for (let r = 0; r < rows; r++) {
        const f = frames[r];
        for (let c = 0; c < WF.length; c++) {
          const w = WF[c];
          const u = side * (1 + 0.3 * w);
          const lat = u * f.halfW;
          const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
          const o = (r * WF.length + c) * 3;
          pos[o] = f.x + rx * lat;
          pos[o + 1] = f.y + wallLift(f, side, w);
          pos[o + 2] = f.z + rz * lat;
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < WF.length - 1; c++) {
          const a = r * WF.length + c, b = a + 1, d = a + WF.length, e = d + 1;
          idx.push(a, b, d, b, e, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      if (rows > 1) group.add(new THREE.Mesh(geo, this.matWall));

      // glowing top rail
      const rp = new Float32Array(rows * 2 * 3);
      const ridx = [];
      for (let r = 0; r < rows; r++) {
        const f = frames[r];
        const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
        for (let k = 0; k < 2; k++) {
          const w = 0.9 + k * 0.1;
          const u = side * (1 + 0.3 * w);
          const lat = u * f.halfW;
          const o = (r * 2 + k) * 3;
          rp[o] = f.x + rx * lat;
          rp[o + 1] = f.y + wallLift(f, side, w) + 0.05;
          rp[o + 2] = f.z + rz * lat;
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        const a = r * 2, b = a + 1, c = a + 2, d = a + 3;
        ridx.push(a, b, c, b, d, c);
      }
      const rgeo = new THREE.BufferGeometry();
      rgeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
      rgeo.setIndex(ridx);
      group.add(new THREE.Mesh(rgeo, side > 0 ? this.matRailPink : this.matRail));
    }

    // ---- tunnel shell
    const tun = frames.filter((f) => f.type === 'tunnel');
    if (tun.length > 2) {
      const RING = 15;
      const pos = new Float32Array(tun.length * RING * 3);
      const idx = [];
      for (let r = 0; r < tun.length; r++) {
        const f = tun[r];
        const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
        const R = f.halfW * 1.34;
        const H = 7.6;
        for (let c = 0; c < RING; c++) {
          const th = Math.PI * (c / (RING - 1)); // 0..PI
          const lat = Math.cos(th) * R;
          const y = Math.sin(th) * H;
          const o = (r * RING + c) * 3;
          pos[o] = f.x + rx * lat;
          pos[o + 1] = f.y + y + 0.2;
          pos[o + 2] = f.z + rz * lat;
        }
      }
      for (let r = 0; r < tun.length - 1; r++) {
        for (let c = 0; c < RING - 1; c++) {
          const a = r * RING + c, b = a + 1, d = a + RING, e = d + 1;
          idx.push(a, b, d, b, e, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      group.add(new THREE.Mesh(geo, this.matTunnel));

      // glowing ribs
      const ribGeoPool = [];
      for (let r = 2; r < tun.length - 2; r += 4) {
        const f = tun[r];
        const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
        const R = f.halfW * 1.32;
        const H = 7.45;
        const pts = [];
        for (let c = 0; c < 17; c++) {
          const th = Math.PI * (c / 16);
          pts.push(new THREE.Vector3(f.x + rx * Math.cos(th) * R, f.y + Math.sin(th) * H + 0.2, f.z + rz * Math.cos(th) * R));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const rg = new THREE.TubeGeometry(curve, 20, 0.16, 5, false);
        const rib = new THREE.Mesh(rg, r % 8 < 4 ? this.matNeonCyan : this.matNeonPink);
        group.add(rib);
        ribGeoPool.push(rg);
      }
    }

    this.scene.add(group);
    return group;
  }

  /** Throw away everything and rebuild against a fresh TrackDirector. */
  resetTrack(director) {
    this.director = director;
    for (const c of this.chunks) this._disposeChunk(c);
    this.chunks = [];
    for (const [, m] of this.propMeshes) {
      this.scene.remove(m);
      m.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    }
    this.propMeshes.clear();
    this.builtUpTo = 0;
    this.trailHistory = [];
    if (this.trail) {
      const pa = this.trail.geometry.attributes.position;
      for (let i = 0; i < pa.count; i++) pa.setXYZ(i, 0, -999, 0);
      pa.needsUpdate = true;
    }
    this.director.ensure(620);
  }

  _disposeChunk(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        // shared materials are reused, never disposed here
      }
    });
    this.scene.remove(group);
  }

  /* ----------------------------------------------------------------- props */
  _propMesh(p) {
    const p3 = this.director.path;
    const f = p3.sample(p.s, {});
    const lat = (p.u || 0) * f.halfW;
    const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
    const x = f.x + rx * lat;
    const z = f.z + rz * lat;
    const y = f.y + surfaceLift(f, p.u || 0) + (p.h || 0);

    let mesh;
    switch (p.kind) {
      case 'ring': {
        const r = p.big ? 2.4 : 1.5;
        mesh = new THREE.Group();
        const torus = new THREE.Mesh(new THREE.TorusGeometry(r, 0.13, 8, 26), this.matNeonAmber);
        mesh.add(torus);
        const inner = new THREE.Mesh(
          new THREE.CircleGeometry(r * 0.92, 26),
          new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
        );
        mesh.add(inner);
        mesh.userData.spin = 1.6;
        mesh.userData.hover = Math.random() * 6.28;
        mesh.userData.kind = 'ring';
        mesh.position.set(x, y + 0.02, z);
        mesh.rotation.y = f.yaw;
        break;
      }
      case 'pylon': {
        mesh = new THREE.Group();
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 2.6, 8), this.matDark);
        core.position.y = 1.3;
        mesh.add(core);
        const band1 = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.16, 10), this.matNeonPink);
        band1.position.y = 1.1;
        mesh.add(band1);
        const band2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 10), this.matNeonPink);
        band2.position.y = 2.1;
        mesh.add(band2);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), this.matNeonCyan);
        cap.position.y = 2.68;
        mesh.add(cap);
        mesh.userData.kind = 'pylon';
        mesh.position.set(x, y, z);
        break;
      }
      case 'barrier': {
        mesh = new THREE.Group();
        const w = (p.w || 0.42) * 2 * f.halfW * 0.5;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5 + 1.6, 1.3, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1030, metalness: 0.8, roughness: 0.4 }));
        body.position.y = 0.65;
        mesh.add(body);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5 + 1.62, 0.22, 0.53), this.matNeonPink);
        stripe.position.y = 0.95;
        mesh.add(stripe);
        mesh.userData.kind = 'barrier';
        mesh.position.set(x, y, z);
        mesh.rotation.y = f.yaw;
        mesh.userData.halfLen = 0.85;
        break;
      }
      case 'gate': {
        // arch across the track — must be jumped or threaded
        mesh = new THREE.Group();
        const span = f.halfW * 2 * 0.42;
        const postMat = this.matDark;
        for (const sx of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 4.2, 8), postMat);
          post.position.set(sx * span, 2.1, 0);
          mesh.add(post);
          const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.12), this.matNeonCyan);
          led.position.set(sx * span, 2.2, 0.18);
          mesh.add(led);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x160f2c, metalness: 0.85, roughness: 0.3 }));
        beam.position.y = 4.1;
        mesh.add(beam);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(span * 2 - 0.4, 0.14, 0.66), this.matNeonAmber);
        bar.position.y = 3.82;
        mesh.add(bar);
        mesh.userData.kind = 'gate';
        mesh.position.set(x, y, z);
        mesh.rotation.y = f.yaw;
        break;
      }
      case 'cone': {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 8), this.matNeonAmber);
        mesh.position.set(x, y + 0.55, z);
        mesh.userData.kind = 'cone';
        break;
      }
      case 'pad': {
        mesh = new THREE.Group();
        const geo = new THREE.PlaneGeometry(f.halfW * 1.5, 7);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.04;
        mesh.add(m);
        const chev = new THREE.Mesh(new THREE.PlaneGeometry(f.halfW * 1.1, 5.4), new THREE.MeshBasicMaterial({ color: 0xbdfaff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        chev.rotation.x = -Math.PI / 2;
        chev.position.y = 0.06;
        mesh.add(chev);
        mesh.userData.kind = 'pad';
        mesh.position.set(x - Math.sin(f.yaw) * 0, y, z);
        mesh.rotation.y = f.yaw;
        break;
      }
      case 'chevron': {
        mesh = new THREE.Group();
        const shape = new THREE.Shape();
        shape.moveTo(-1.2, -0.8); shape.lineTo(0, 0.5); shape.lineTo(1.2, -0.8);
        shape.lineTo(1.2, -0.2); shape.lineTo(0, 1.1); shape.lineTo(-1.2, -0.2);
        shape.closePath();
        const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false }));
        mesh.add(m);
        mesh.position.set(x, y + 1.2, z);
        mesh.rotation.y = f.yaw + (p.dir || 1) * 0.5;
        mesh.userData.kind = 'chevron';
        break;
      }
      case 'bridge': {
        mesh = new THREE.Group();
        const span = f.halfW * 2 * 1.7;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x0f0c22, metalness: 0.9, roughness: 0.3 }));
        deck.position.y = 9.5;
        mesh.add(deck);
        const under = new THREE.Mesh(new THREE.BoxGeometry(span, 0.16, 8.1), this.matNeonViolet);
        under.position.y = 8.72;
        mesh.add(under);
        const top = new THREE.Mesh(new THREE.BoxGeometry(span, 0.12, 8.1), this.matNeonCyan);
        top.position.y = 10.3;
        mesh.add(top);
        for (const sx of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 10, 1.1), this.matDark);
          leg.position.set(sx * span * 0.46, 4.6, 0);
          mesh.add(leg);
          const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 9.4, 0.12), this.matNeonPink);
          led.position.set(sx * span * 0.46, 4.6, 0.6);
          mesh.add(led);
        }
        mesh.userData.kind = 'bridge';
        mesh.position.set(x, y, z);
        mesh.rotation.y = f.yaw;
        break;
      }
      case 'launch': {
        mesh = new THREE.Group();
        for (let i = 0; i < 5; i++) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(f.halfW * 1.5, 1.2), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
          m.rotation.x = -Math.PI / 2;
          m.position.set(0, 0.07, i * 1.5 - 3);
          mesh.add(m);
        }
        mesh.position.set(x, y, z);
        mesh.rotation.y = f.yaw;
        break;
      }
      case 'landMark': {
        mesh = new THREE.Mesh(
          new THREE.RingGeometry(2.4, 3.1, 28),
          new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, y + 0.08, z);
        break;
      }
      default:
        return null;
    }
    mesh.userData.prop = p;
    return mesh;
  }

  hideProp(id) {
    const m = this.propMeshes.get(id);
    if (m) m.visible = false;
  }

  /* ----------------------------------------------------------------- update */
  updateWorld(playerS, dt, opts = {}) {
    this.time += dt;
    const dir = this.director;
    dir.ensure(playerS + 520);

    // build new track chunks
    while (this.builtUpTo < dir.path.s) {
      const s0 = this.builtUpTo;
      const s1 = Math.min(dir.path.s, s0 + CHUNK);
      const g = this._buildChunk(s0, s1);
      if (g) this.chunks.push(g);
      this.builtUpTo = s1;
    }
    // cull chunks behind
    while (this.chunks.length && this.chunks[0].userData.s1 < playerS - 90) {
      this._disposeChunk(this.chunks.shift());
    }
    dir.path.trim(playerS - 120);

    // props
    for (const p of dir.props) {
      if (this.propMeshes.has(p.id)) continue;
      if (p.s > playerS + 560 || p.s < playerS - 130) continue;
      const m = this._propMesh(p);
      if (m) {
        m.userData.baseY = m.position.y;
        this.scene.add(m);
        this.propMeshes.set(p.id, m);
      }
    }
    for (const [id, m] of this.propMeshes) {
      const pr = m.userData.prop;
      if (pr && pr.s < playerS - 70) {
        this.scene.remove(m);
        m.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); } });
        this.propMeshes.delete(id);
      } else if (m.userData.spin && m.visible !== false) {
        m.rotation.z += dt * m.userData.spin;
      }
    }

    // environment motion
    this.stars.rotation.y += dt * 0.004;
    this.planet.material.uniforms.uTime.value += dt;
    this.planetRing.rotation.z += dt * 0.01;
    for (const m of this.monoliths.children) {
      m.rotation.y += dt * m.userData.spin;
      m.position.y = m.userData.baseY + Math.sin(this.time * 0.3 + m.userData.ph) * 8;
    }

    // lights that follow the player
    this.rimA.position.set(this.bike.position.x - 16, this.bike.position.y + 10, this.bike.position.z - 10);
    this.rimB.position.set(this.bike.position.x + 18, this.bike.position.y + 6, this.bike.position.z + 4);
  }

  /* ------------------------------------------------------------------ draw */
  render() {
    this.composer.render();
  }
}

export { CYAN, MAGENTA, VIOLET, AMBER, STEP, clamp, lerp };
