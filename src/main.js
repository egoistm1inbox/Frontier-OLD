import * as THREE from 'three';
import { World, CYAN } from './world.js';
import { createState, step, endDrift, useBoost } from './game.js';
import { clamp, lerp, surfaceLift } from './path.js';

const canvas = document.getElementById('scene');
const $ = (id) => document.getElementById(id);

/* ================================================================= audio */
class Synth {
  constructor() { this.ctx = null; this.engine = null; this.enabled = true; }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);

    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 800; filt.Q.value = 6;
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 80;
    const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 40;
    const o3 = this.ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 160;
    const g3 = this.ctx.createGain(); g3.gain.value = 0.22;
    o1.connect(filt); o2.connect(filt); o3.connect(g3); g3.connect(filt);
    filt.connect(g); g.connect(this.master);
    o1.start(); o2.start(); o3.start();
    this.engine = { g, filt, o1, o2, o3 };

    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1700; nf.Q.value = 0.6;
    this.wind = this.ctx.createGain(); this.wind.gain.value = 0;
    src.connect(nf); nf.connect(this.wind); this.wind.connect(this.master);
    src.start();
  }
  engine_(pct, on) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const f = 60 + pct * 140;
    this.engine.o1.frequency.setTargetAtTime(f, t, 0.08);
    this.engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engine.o3.frequency.setTargetAtTime(f * 2.01, t, 0.08);
    this.engine.filt.frequency.setTargetAtTime(500 + pct * 2400, t, 0.1);
    this.engine.g.gain.setTargetAtTime(on ? 0.13 : 0, t, 0.12);
    this.wind.gain.setTargetAtTime(on ? 0.015 + pct * 0.06 : 0, t, 0.15);
  }
  blip(freq = 660, dur = 0.12, type = 'sine', vol = 0.16, slide = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(t + dur + 0.03);
  }
  noise(dur = 0.3, vol = 0.3, lp = 1400) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }
  crash() { this.noise(0.55, 0.45); this.blip(150, 0.45, 'sawtooth', 0.28, 40); }
  ring() { this.blip(900, 0.08, 'triangle', 0.13, 1400); }
  boost() { this.blip(210, 0.45, 'sawtooth', 0.19, 950); }
}
const sfx = new Synth();

/* ================================================================= world */
const world = new World(canvas, 2027);
const S = createState();
let state = 'title'; // title | countdown | play | paused | dead
let best = +(localStorage.getItem('no_best') || 0);
let camShake = 0;
let flashT = 0;
let driftPopT = 0;
let runTime = 0;

const ctx = {
  path: world.director.path,
  props: world.director.props,
  collected: new Set(),
};

const camPos = new THREE.Vector3(0, 10, -22);
const camLook = new THREE.Vector3();
const shakeOff = new THREE.Vector3();
const bikeRot = { yaw: 0, roll: 0, pitch: 0 };

/* ================================================================= ui */
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);

function flash(a = 0.4) {
  const f = $('flash');
  f.style.transition = 'none';
  f.style.opacity = a;
  requestAnimationFrame(() => {
    f.style.transition = 'opacity .45s ease';
    f.style.opacity = 0;
  });
}

function showPop(html, ms = 1.1) {
  const el = $('driftpop');
  el.innerHTML = html;
  el.classList.remove('hidden');
  driftPopT = ms;
}

function renderShields() {
  const c = $('shields');
  if (c.children.length !== S.maxShields) {
    c.innerHTML = '';
    for (let i = 0; i < S.maxShields; i++) {
      const d = document.createElement('div');
      d.className = 'shield';
      c.appendChild(d);
    }
  }
  [...c.children].forEach((d, i) => d.classList.toggle('on', i < S.shields));
}

function updateHUD() {
  $('score').textContent = Math.floor(S.score).toLocaleString();
  $('dist').innerHTML = Math.floor(S.dist) + '<em>m</em>';
  $('speed').textContent = Math.round(S.sVel * 3.6);
  const fill = $('boostfill');
  fill.style.width = ((S.boost > 0 ? 1 : S.charge) * 100).toFixed(1) + '%';
  fill.style.background = S.boost > 0
    ? 'linear-gradient(90deg,#ffd166,#ff2fd0 60%,#fff)'
    : 'linear-gradient(90deg,#8b5cff,#31f7ff 60%,#fff)';
  const combo = $('combo');
  combo.textContent = 'x' + S.combo.toFixed(1);
  combo.style.opacity = S.combo > 1.01 ? 1 : 0.28;
}

/* ================================================================= input */
const keys = Object.create(null);
const touch = { left: false, right: false, drift: false };

addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyA', 'KeyD', 'Escape'].includes(e.code)) e.preventDefault();
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (e.code === 'Space' && state === 'play') { S.drifting = true; sfx.blip(320, 0.1, 'square', 0.08); }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && state === 'play') doBoost();
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyR' && state === 'play') startRun();
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space' && state === 'play') releaseDrift();
});

document.querySelectorAll('.tbtn').forEach((btn) => {
  const act = btn.dataset.act;
  const down = (ev) => {
    ev.preventDefault();
    btn.classList.add('active');
    if (act === 'left') touch.left = true;
    if (act === 'right') touch.right = true;
    if (act === 'drift' && state === 'play') { S.drifting = true; }
  };
  const up = (ev) => {
    ev.preventDefault();
    btn.classList.remove('active');
    if (act === 'left') touch.left = false;
    if (act === 'right') touch.right = false;
    if (act === 'drift' && state === 'play') releaseDrift();
  };
  btn.addEventListener('touchstart', down, { passive: false });
  btn.addEventListener('touchend', up, { passive: false });
  btn.addEventListener('touchcancel', up, { passive: false });
  btn.addEventListener('mousedown', down);
  btn.addEventListener('mouseup', up);
  btn.addEventListener('mouseleave', up);
});

function releaseDrift() {
  const ev = [];
  endDrift(S, ev);
  for (const e of ev) if (e.type === 'driftEnd') { showPop(`DRIFT <b>+${e.amount}</b>`); sfx.blip(700, 0.16, 'triangle', 0.1, 1100); }
}

function doBoost() {
  const ev = [];
  if (useBoost(S, ev)) { sfx.boost(); flash(0.3); camShake = Math.max(camShake, 0.35); }
  else sfx.blip(170, 0.09, 'square', 0.06);
}

$('startBtn').addEventListener('click', () => startRun());
$('retryBtn').addEventListener('click', () => startRun());
$('resumeBtn').addEventListener('click', togglePause);
$('restartBtn2').addEventListener('click', () => { show('paused', false); startRun(); });
$('pauseBtn').addEventListener('click', togglePause);
addEventListener('blur', () => { if (state === 'play') togglePause(); });

/* ================================================================= flow */
function resetRun() {
  const seed = (Math.random() * 1e6) | 0;
  const TrackDirector = world.director.constructor;
  const d = new TrackDirector(seed);
  world.resetTrack(d);
  Object.assign(S, createState());
  ctx.path = d.path;
  ctx.props = d.props;
  ctx.collected = new Set();
  runTime = 0;
  camShake = 0;
  trailPos.length = 0;
  resetTrail();
  renderShields();
  updateHUD();
}

function startRun() {
  sfx.init();
  resetRun();
  show('title', false);
  show('gameover', false);
  show('paused', false);
  show('hud', true);
  $('speedlines').style.opacity = 0;
  renderShields();
  state = 'countdown';
  let n = 3;
  const el = $('countdown');
  show('countdown', true);
  const tick = () => {
    el.textContent = n > 0 ? String(n) : 'GO!';
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
    sfx.blip(n > 0 ? 460 : 920, 0.15, 'square', 0.14);
    if (n > 0) { n--; setTimeout(tick, 600); }
    else {
      setTimeout(() => {
        show('countdown', false);
        state = 'play';
        sfx.engine_(0.35, true);
      }, 480);
    }
  };
  tick();
}

function togglePause() {
  if (state === 'play') { state = 'paused'; show('paused', true); sfx.engine_(0, false); }
  else if (state === 'paused') { state = 'play'; show('paused', false); sfx.engine_(0.5, true); }
}

function die(cause) {
  state = 'dead';
  S.dead = true;
  S.spinning = 0.8;
  camShake = 1;
  sfx.crash();
  sfx.engine_(0, false);
  flash(0.65);
  $('speedlines').style.opacity = 0;
  if (S.score > best) { best = Math.floor(S.score); localStorage.setItem('no_best', String(best)); }
  $('finalScore').textContent = Math.floor(S.score).toLocaleString();
  $('finalDist').textContent = Math.floor(S.dist) + 'm';
  $('bestScore').textContent = best.toLocaleString();
  $('finalDrift').textContent = Math.floor(S.driftScoreTotal).toLocaleString();
  $('gameover').querySelector('.go-kicker').textContent = cause === 'void' ? 'LOST TO THE VOID' : 'RUN TERMINATED';
  setTimeout(() => { if (state === 'dead') show('gameover', true); }, 750);
}

/* ================================================================= frame */
const input = { left: false, right: false, drift: false };
const events = [];
let last = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === 'paused') { world.render(); return; }

  // ---- title flythrough
  if (state === 'title') {
    titleUpdate(dt);
    world.updateWorld(S.s, dt);
    world.render();
    return;
  }

  // ---- ensure world ahead of the player
  world.director.ensure(S.s + 620);
  ctx.path = world.director.path;
  ctx.props = world.director.props;

  if (state === 'play' || state === 'dead') {
    const controlling = state === 'play';
    input.left = controlling && !!(keys.ArrowLeft || keys.KeyA || touch.left);
    input.right = controlling && !!(keys.ArrowRight || keys.KeyD || touch.right);
    input.drift = S.drifting;

    events.length = 0;
    const alive = step(S, ctx, input, dt, events);
    handleEvents(events);
    if (!alive && state === 'play') die((events.find((e) => e.type === 'die') || {}).cause);
    if (state !== 'dead') runTime += dt;
  }

  updateBike(dt);
  updateBursts(dt);
  updateCamera(dt);
  world.updateWorld(S.s, dt);
  world.render();

  if (driftPopT > 0) {
    driftPopT -= dt;
    if (driftPopT <= 0) $('driftpop').classList.add('hidden');
  }

  if (state === 'play') {
    updateHUD();
    updateTurnHint();
    updateSpeedFx();
    sfx.engine_(clamp((S.sVel - 22) / 55, 0, 1), true);
  }
}

function handleEvents(evts) {
  for (const e of evts) {
    switch (e.type) {
      case 'ring':
        sfx.ring();
        burst(e.prop, 0xffd166);
        world.hideProp(e.prop.id);
        break;
      case 'gate':
        world.hideProp(e.prop.id);
        sfx.blip(620, 0.18, 'triangle', 0.12, 1240);
        showPop(`ARCH <b>+${Math.round(180)}</b>`, 0.7);
        break;
      case 'pad':
        world.hideProp(e.prop.id);
        sfx.boost();
        flash(0.22);
        camShake = Math.max(camShake, 0.3);
        showPop('BOOST PAD', 0.7);
        break;
      case 'launch':
        sfx.blip(520, 0.22, 'triangle', 0.13, 980);
        showPop('AIRBORNE', 0.8);
        break;
      case 'land':
        sfx.noise(0.25, e.hard ? 0.3 : 0.16, 900);
        sfx.blip(300, 0.16, 'sine', 0.11, 150);
        camShake = Math.max(camShake, e.hard ? 0.55 : 0.22);
        showPop(`LANDING <b>+${Math.round(e.bonus)}</b>`, 0.8);
        break;
      case 'hit':
        camShake = 1;
        flash(0.45);
        sfx.crash();
        renderShields();
        showPop('SHIELD DOWN', 0.9);
        break;
      case 'shieldUp':
        renderShields();
        sfx.blip(1040, 0.2, 'triangle', 0.13, 1560);
        showPop('SHIELD +1', 0.9);
        break;
      case 'scrape':
        if (Math.random() < 0.18) sfx.noise(0.12, 0.09, 2600);
        camShake = Math.max(camShake, 0.14);
        break;
      case 'cone':
        world.hideProp(e.prop.id);
        sfx.noise(0.16, 0.15);
        camShake = Math.max(camShake, 0.3);
        break;
      case 'driftEnd':
        showPop(`DRIFT <b>+${e.amount}</b>`);
        sfx.blip(720, 0.16, 'triangle', 0.1, 1150);
        break;
      case 'die':
        break;
    }
  }
}

/* ================================================================= visuals */
function titleUpdate(dt) {
  world.time += dt;
  S.s += 13 * dt;
  ctx.path = world.director.path;
  world.director.ensure(S.s + 620);

  const f = world.director.path.sample(S.s, {});
  const lead = world.director.path.sample(S.s + 18, {});
  const u = Math.sin(world.time * 0.4) * 0.55;
  const lat = u * f.halfW;
  const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
  world.bike.position.set(
    f.x + rx * lat,
    f.y + surfaceLift(f, clamp(u, -1, 1)) + 0.34,
    f.z + rz * lat
  );
  world.bike.rotation.set(0, f.yaw, f.roll * 0.8);
  world.thruster.scale.set(1.4, 1, 1.4);
  world.hover.material.opacity = 0.3;
  pushTrail(world.bike.position, f.yaw, false);

  const camDist = 12 + Math.sin(world.time * 0.23) * 2;
  camPos.lerp(new THREE.Vector3(
    world.bike.position.x - Math.sin(f.yaw) * camDist + Math.cos(f.yaw) * 4.2,
    world.bike.position.y + 4.4,
    world.bike.position.z - Math.cos(f.yaw) * camDist - Math.sin(f.yaw) * 4.2
  ), 1 - Math.pow(0.03, dt));
  world.camera.position.copy(camPos);
  world.camera.lookAt(lead.x, lead.y + 1.8, lead.z);
  world.camera.fov = lerp(world.camera.fov, 62, 0.05);
  world.camera.updateProjectionMatrix();
  world.bloom.strength = 0.95;
}

let trailPos = [];
function pushTrail(pos, yaw, boosting) {
  trailPos.unshift({ x: pos.x, y: pos.y + 0.4, z: pos.z, yaw, b: boosting });
  if (trailPos.length > world.trailN) trailPos.pop();
  const geo = world.trail.geometry;
  const pa = geo.attributes.position;
  const ca = geo.attributes.color;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  for (let i = 0; i < world.trailN; i++) {
    const t = trailPos[i] || trailPos[trailPos.length - 1];
    if (!t) continue;
    const fade = 1 - i / world.trailN;
    const w = 0.14 + fade * 0.3;
    pa.setXYZ(i * 2, t.x - rx * w, t.y - i * 0.02, t.z - rz * w);
    pa.setXYZ(i * 2 + 1, t.x + rx * w, t.y - i * 0.02, t.z + rz * w);
    const c = t.b ? [1, 0.8, 0.35] : [0.2, 0.97, 1.0];
    ca.setXYZ(i * 2, c[0] * fade * 0.9, c[1] * fade, c[2] * fade);
    ca.setXYZ(i * 2 + 1, c[0] * fade * 0.9, c[1] * fade, c[2] * fade);
  }
  pa.needsUpdate = true;
  ca.needsUpdate = true;
}

function resetTrail() {
  const pa = world.trail.geometry.attributes.position;
  for (let i = 0; i < pa.count; i++) pa.setXYZ(i, 0, -999, 0);
  pa.needsUpdate = true;
}

const tmpF = {};
function updateBike(dt) {
  const f = world.director.path.sample(S.s, tmpF);
  const u = clamp(S.u, -1.06, 1.06);
  const lat = u * f.halfW;
  const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
  const bike = world.bike;

  bike.position.set(
    f.x + rx * lat,
    f.y + surfaceLift(f, u) + S.h + 0.34 + Math.sin(world.time * 7) * 0.03,
    f.z + rz * lat
  );

  // nose-in drift yaw + spin on impact
  if (S.spinning > 0) S.spinning = Math.max(0, S.spinning - dt);
  const driftYaw = S.drifting ? -S.steer * 0.34 - f.curv * S.sVel * 0.02 : 0;
  const spinYaw = S.spinning > 0 ? Math.min(1, S.spinning / 0.65) * Math.PI * 2 * 0.8 : 0;
  bikeRot.yaw = lerp(bikeRot.yaw, f.yaw + driftYaw, 1 - Math.pow(0.0001, dt));
  bike.rotation.y = bikeRot.yaw + spinYaw;
  const bank = f.roll * 0.85 + S.steer * 0.26 * (S.drifting ? 1.6 : 1);
  bikeRot.roll = lerp(bikeRot.roll, bank, 1 - Math.pow(0.0002, dt));
  bike.rotation.z = bikeRot.roll;
  let grade = 0;
  if (!S.airborne) {
    const dy = world.director.path.sample(S.s + 3, {}).y - f.y;
    grade = Math.atan2(dy, 3);
  }
  const pitch = S.airborne ? clamp(-S.vh * 0.05, -0.5, 0.55) : -grade * 0.75;
  bikeRot.pitch = lerp(bikeRot.pitch, pitch, 1 - Math.pow(0.001, dt));
  bike.rotation.x = bikeRot.pitch;

  // thrusters / hover
  const p = clamp(S.sVel / 72, 0, 1);
  const boosting = S.boost > 0;
  const flare = 1 + p * 0.5 + (boosting ? 1.15 : 0) + (S.drifting ? 0.2 : 0);
  world.thruster.scale.set(flare, 1, flare);
  world.thruster.material.color.setHex(boosting ? 0xffd166 : CYAN);
  world.thruster.material.opacity = 0.4 + p * 0.4 + (boosting ? 0.28 : 0);
  world.hover.material.opacity = 0.16 + Math.abs(Math.sin(world.time * 6)) * 0.15 + (boosting ? 0.24 : 0);
  world.hover.material.color.setHex(boosting ? 0xffd166 : CYAN);
  world.bikeLight.color.setHex(boosting ? 0xffd166 : CYAN);
  world.bikeLight.intensity = 22 + (boosting ? 22 : 0);

  // drift sparks
  if (S.drifting && !S.airborne && state === 'play') spawnSpark(bike.position, f, boosting);
  updateSparks(dt);

  // shield bubble
  const shielding = S.invuln > 0 && S.shields > 0 && state === 'play';
  world.bubble.visible = shielding;
  world.bubble.material.opacity = shielding ? 0.14 + Math.sin(world.time * 24) * 0.09 : 0;

  world.rider.rotation.z = lerp(world.rider.rotation.z, -S.steer * 0.18, 0.1);
  world.bloom.strength = 0.8 + (boosting ? 0.5 : 0) + p * 0.22;

  pushTrail(bike.position, bike.rotation.y, boosting);
}

/* ---- particle sparks (drift smoke) ---- */
const sparkCount = 180;
let sparks = null;
function initSparks() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(sparkCount * 3).fill(-9999);
  const col = new Float32Array(sparkCount * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.34,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  sparks = { mesh: new THREE.Points(geo, mat), vel: new Float32Array(sparkCount * 3), life: new Float32Array(sparkCount), i: 0 };
  sparks.mesh.frustumCulled = false;
  world.scene.add(sparks.mesh);
}
function spawnSpark(pos, f, boosting) {
  const { vel, life } = sparks;
  const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
  for (let k = 0; k < 2; k++) {
    const i = sparks.i = (sparks.i + 1) % sparkCount;
    const off = (Math.random() - 0.5) * 1.1;
    const pa = sparks.mesh.geometry.attributes.position;
    pa.setXYZ(i, pos.x + rx * off, pos.y - 0.2, pos.z + rz * off);
    vel[i * 3] = (Math.random() - 0.5) * 3 - rx * 2;
    vel[i * 3 + 1] = 1 + Math.random() * 3.5;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 3 - rz * 2;
    life[i] = 0.45 + Math.random() * 0.35;
    const ca = sparks.mesh.geometry.attributes.color;
    if (boosting) ca.setXYZ(i, 1, 0.75, 0.3);
    else ca.setXYZ(i, Math.random() * 0.4 + 0.1, 0.9, 1);
  }
  sparks.mesh.geometry.attributes.position.needsUpdate = true;
  sparks.mesh.geometry.attributes.color.needsUpdate = true;
}
function updateSparks(dt) {
  if (!sparks) return;
  const pa = sparks.mesh.geometry.attributes.position;
  const { vel, life } = sparks;
  let dirty = false;
  for (let i = 0; i < sparkCount; i++) {
    if (life[i] <= 0) continue;
    life[i] -= dt;
    if (life[i] <= 0) { pa.setXYZ(i, -9999, -9999, -9999); dirty = true; continue; }
    pa.setXYZ(i, pa.getX(i) + vel[i * 3] * dt, pa.getY(i) + vel[i * 3 + 1] * dt, pa.getZ(i) + vel[i * 3 + 2] * dt);
    vel[i * 3 + 1] -= 9 * dt;
    dirty = true;
  }
  if (dirty) pa.needsUpdate = true;
}

/* ---- ring collect burst: quick ring flash at the prop ---- */
const bursts = [];
function burst(prop, color) {
  if (!prop) return;
  const p = world.propMeshes.get(prop.id);
  if (!p) return;
  const m = new THREE.Mesh(
    new THREE.RingGeometry(1, 1.5, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  m.position.copy(p.position);
  m.quaternion.copy(world.camera.quaternion);
  world.scene.add(m);
  bursts.push({ m, t: 0 });
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.t += dt;
    const k = b.t / 0.45;
    b.m.scale.setScalar(1 + k * 4);
    b.m.material.opacity = Math.max(0, 0.95 * (1 - k));
    b.m.quaternion.copy(world.camera.quaternion);
    if (k >= 1) { world.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); bursts.splice(i, 1); }
  }
}

/* ---- camera ---- */
function updateCamera(dt) {
  const bike = world.bike;
  const speedPct = clamp((S.sVel - 20) / 55, 0, 1);
  const behind = 8.4 + speedPct * 3.6 + (S.boost > 0 ? 2.8 : 0);
  const up = 3.4 + speedPct * 1.1 + (S.airborne ? 1.2 : 0);
  const yaw = bikeRot.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);

  const target = new THREE.Vector3(
    bike.position.x - fx * behind,
    bike.position.y + up,
    bike.position.z - fz * behind
  );
  // lean the camera toward the inside of the corner a touch
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  target.x += rx * S.u * 2.0;
  target.z += rz * S.u * 2.0;

  camPos.lerp(target, 1 - Math.pow(0.004, dt));
  updateShake(dt);
  world.camera.position.copy(camPos).add(shakeOff);

  camLook.set(
    bike.position.x + fx * 13,
    bike.position.y + 1.7 + (S.airborne ? 0.9 : 0),
    bike.position.z + fz * 13
  );
  world.camera.lookAt(camLook);
  world.camera.rotation.z += -bikeRot.roll * 0.16;
  world.camera.fov = lerp(world.camera.fov, 70 + speedPct * 11 + (S.boost > 0 ? 7 : 0), 1 - Math.pow(0.02, dt));
  world.camera.updateProjectionMatrix();
}

function updateShake(dt) {
  camShake = Math.max(0, camShake - dt * 2.6);
  const amp = camShake * camShake * 0.7 + (S.boost > 0 ? 0.05 : 0) * (state === 'play' ? 1 : 0);
  shakeOff.set(
    (Math.random() - 0.5) * amp,
    (Math.random() - 0.5) * amp,
    (Math.random() - 0.5) * amp
  );
}

function updateSpeedFx() {
  const w = clamp((S.sVel - 34) / 40, 0, 1);
  $('speedlines').style.opacity = String(w * (S.boost > 0 ? 1 : 0.5));
  const danger = clamp((Math.abs(S.u) - 0.62) / 0.4, 0, 1);
  $('vignette').style.boxShadow = danger > 0.05
    ? `inset 0 0 ${120 * danger}px rgba(255,47,208,${0.5 * danger})`
    : 'none';
}

let hintFor = null;
function updateTurnHint() {
  const b = world.director.path;
  const seg = b.segments.find((sg) => sg.type === 'turn' && sg.s0 - S.s > -6 && sg.s0 - S.s < 46);
  const el = $('turnhint');
  if (seg && !S.drifting) {
    el.classList.remove('hidden');
    if (hintFor !== seg.id) {
      hintFor = seg.id;
      el.querySelector('.arrow').textContent = seg.dir > 0 ? '❯' : '❮';
    }
    el.querySelector('.txt').textContent = '90° DRIFT';
  } else {
    el.classList.add('hidden');
  }
}

/* ================================================================= boot */
function boot() {
  world.director.ensure(700);
  initSparks();
  resetTrail();
  renderShields();
  $('bestScore').textContent = best.toLocaleString();
  show('loading', false);
  show('title', true);
  show('hud', false);
  requestAnimationFrame(loop);
}

setTimeout(boot, 40);
