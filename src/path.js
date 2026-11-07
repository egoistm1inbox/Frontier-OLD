// Pure path math for the endless circuit. No three.js dependency so it can be
// unit-tested in node.
//
// Frames are sampled every STEP units along the centreline. Each frame stores
// the centre point, heading (yaw), banking (roll), width and flags.
// Index i always has s === i * STEP (invariant, enforced by construction).

export const STEP = 2.0;
export const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

export class PathBuilder {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.yaw = 0;
    this.s = 0;
    this.frames = [];
    this.segments = [];
    this.frameOffset = 0; // frames removed from the front
    this._seg = null;
    // opening frame at s = 0
    this.frames.push(this._frame(0, 0, 0, { road: 1, type: 'start' }));
    this.frames[0].s = 0;
  }

  _frame(s, y, yaw, o = {}) {
    return {
      s,
      x: this.x,
      y,
      z: this.z,
      yaw,
      roll: o.roll || 0,
      curve: o.curve || 0,
      halfW: o.halfW ?? 9,
      road: o.road ?? 1,
      curv: o.curv || 0,
      type: o.type || 'straight',
      seg: o.seg ?? -1,
    };
  }

  get s0() {
    return this.frames.length ? this.frames[0].s : 0;
  }

  /** Walk n steps of STEP with parameterised heading / height / cross-section. */
  _walk(n, cfg) {
    const segIndex = cfg.seg ?? -1;
    const y0 = this.y;
    const yaw0 = cfg.yaw0 ?? this.yaw;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const tm = (i - 0.5) / n;
      const yaw = cfg.yaw ? cfg.yaw(t) : this.yaw;
      const yawMid = cfg.yaw ? cfg.yaw(tm) : this.yaw;
      const y = cfg.y ? cfg.y(t) : y0;
      this.x += Math.sin(yawMid) * STEP;
      this.z += Math.cos(yawMid) * STEP;
      this.y = y;
      this.yaw = yaw;
      this.s += STEP;
      const f = this._frame(this.s, y, yaw, {
        roll: cfg.roll ? cfg.roll(t) : 0,
        curve: cfg.curve ? cfg.curve(t) : 0,
        halfW: cfg.halfW ? cfg.halfW(t) : 9,
        road: cfg.road ?? 1,
        curv: typeof cfg.curv === 'function' ? cfg.curv(t) : cfg.curv || 0,
        type: cfg.type || 'straight',
        seg: segIndex,
      });
      this.frames.push(f);
    }
  }

  _begin(spec) {
    const seg = {
      id: this.segments.length,
      type: spec.type,
      s0: this.s,
      s1: this.s,
      dir: spec.dir || 0,
      yaw0: this.yaw,
      y0: this.y,
      jump: false,
      gap: false,
      frames: [],
    };
    this.segments.push(seg);
    this._seg = seg;
    return seg;
  }

  _end() {
    const seg = this._seg;
    if (!seg) return null;
    seg.s1 = this.s;
    seg.frames = this.frames.filter((f) => f.s > seg.s0 - 0.01 && f.s <= seg.s1);
    seg.yaw1 = this.yaw;
    seg.y1 = this.y;
    this._seg = null;
    return seg;
  }

  // ---- segment shapes -------------------------------------------------

  straight(steps, opts = {}) {
    const seg = this._begin({ type: opts.type || 'straight' });
    const bank = opts.bank || 0;
    const width = opts.width || 9;
    this._walk(steps, {
      seg: seg.id,
      type: opts.type || 'straight',
      halfW: (t) => (opts.taper ? lerp(width, opts.taperTo ?? 9, smooth(t)) : width),
      curve: opts.wallRise ? () => opts.wallRise : undefined,
      roll: bank ? (t) => bank * Math.sin(Math.min(1, t * 4) * HALF_PI) : undefined,
      y: opts.dy ? (t) => this._seg.y0 + opts.dy * smooth(t) : undefined,
    });
    return this._end();
  }

  /** Exactly 90 degree banked turn. dir +1 = right, -1 = left. */
  turn(steps, dir, opts = {}) {
    const seg = this._begin({ type: 'turn', dir });
    const yaw0 = this.yaw;
    const sweep = dir * HALF_PI;
    const bank = opts.bank ?? 0.95;
    const radius = (steps * STEP) / HALF_PI;
    const rollMax = -dir * bank;
    this._walk(steps, {
      seg: seg.id,
      type: 'turn',
      yaw0,
      yaw: (t) => yaw0 + sweep * t,
      curv: () => dir / radius,
      halfW: (t) => lerp(9, opts.width ?? 11, smooth(Math.min(1, t * 3))),
      roll: (t) => rollMax * smooth(clamp(t * 3.2, 0, 1)) * smooth(clamp((1 - t) * 3.2 + 0.001, 0, 1)),
      y: opts.dy ? (t) => this._seg.y0 + opts.dy * smooth(t) : undefined,
    });
    return this._end();
  }

  /** Rising launch ramp; ends at the lip. */
  kicker(steps, rise, width = 9) {
    const seg = this._begin({ type: 'kicker' });
    seg.jump = true;
    const y0 = this.y;
    this._walk(steps, {
      seg: seg.id,
      type: 'kicker',
      halfW: () => width,
      y: (t) => y0 + rise * (t * t),
    });
    seg.launchSlope = (rise * 2) / (steps * STEP);
    return this._end();
  }

  gap(steps, width = 9) {
    const seg = this._begin({ type: 'gap' });
    seg.gap = true;
    this._walk(steps, { seg: seg.id, type: 'gap', halfW: () => width, road: 0 });
    return this._end();
  }

  landing(steps, width = 9, dy = 0) {
    const seg = this._begin({ type: 'landing' });
    const y0 = this.y;
    this._walk(steps, {
      seg: seg.id,
      type: 'landing',
      halfW: () => width,
      y: dy ? (t) => y0 + dy * smooth(t) : undefined,
    });
    return this._end();
  }

  slope(steps, dy, type = 'slope') {
    const seg = this._begin({ type });
    const y0 = this.y;
    this._walk(steps, { seg: seg.id, type, y: (t) => y0 + dy * smooth(t) });
    return this._end();
  }

  tunnel(steps) {
    const seg = this._begin({ type: 'tunnel' });
    this._walk(steps, {
      seg: seg.id,
      type: 'tunnel',
      halfW: (t) => lerp(9, 8, Math.min(1, t * 6)),
    });
    return this._end();
  }

  /** Skate-park bowl: wide road with curving quarter-pipe walls. */
  bowl(steps, opts = {}) {
    const seg = this._begin({ type: 'bowl' });
    const w = opts.width ?? 13;
    const rise = opts.wallRise ?? 4.5;
    this._walk(steps, {
      seg: seg.id,
      type: 'bowl',
      halfW: (t) => w * (0.72 + 0.28 * smooth(Math.min(1, t * 2.5))),
      curve: (t) => rise * smooth(clamp((t - 0.06) / 0.5, 0, 1)) * smooth(clamp((1 - t) / 0.25, 0, 1)),
    });
    return this._end();
  }

  /** Long banked sweeper (gentle 45-ish degree drift). */
  sweeper(steps, dir, opts = {}) {
    const seg = this._begin({ type: 'sweeper', dir });
    const yaw0 = this.yaw;
    const sweep = dir * (opts.sweep ?? 0.9);
    const radius = (steps * STEP) / Math.abs(sweep);
    const rollMax = -dir * (opts.bank ?? 0.55);
    this._walk(steps, {
      seg: seg.id,
      type: 'sweeper',
      yaw: (t) => yaw0 + sweep * smooth(t * 0.9 + 0.05),
      curv: (t) => (dir / radius) * Math.cos(clamp((t - 0.5) * 2.6, -1.5, 1.5)),
      halfW: () => opts.width ?? 11,
      roll: (t) => rollMax * Math.sin(Math.PI * t),
    });
    return this._end();
  }

  // ---- queries --------------------------------------------------------

  trim(cutoffS) {
    while (this.frames.length > 2 && this.frames[1].s < cutoffS) {
      this.frames.shift();
      this.frameOffset++;
    }
    this.segments = this.segments.filter((s) => s.s1 > cutoffS - 120);
  }

  sample(s, out = {}) {
    const n = this.frames.length;
    if (n < 2) {
      const f = this.frames[0];
      return Object.assign(out, { x: f.x, y: f.y, z: f.z, yaw: f.yaw, roll: f.roll, curve: f.curve, halfW: f.halfW, road: f.road, curv: f.curv, type: f.type });
    }
    const fi = s / STEP - this.frameOffset;
    const i0 = clamp(Math.floor(fi), 0, n - 2);
    const t = clamp(fi - i0, 0, 1);
    const a = this.frames[i0];
    const b = this.frames[i0 + 1];
    out.x = lerp(a.x, b.x, t);
    out.y = lerp(a.y, b.y, t);
    out.z = lerp(a.z, b.z, t);
    out.yaw = lerp(a.yaw, b.yaw, t);
    out.roll = lerp(a.roll, b.roll, t);
    out.curve = lerp(a.curve, b.curve, t);
    out.halfW = lerp(a.halfW, b.halfW, t);
    out.curv = lerp(a.curv, b.curv, t);
    out.road = a.road;
    out.type = a.type;
    out.s = s;
    return out;
  }

  /** Frame-range helper for mesh builders. */
  framesBetween(s0, s1) {
    const a = Math.max(0, Math.floor(s0 / STEP) - this.frameOffset);
    const b = Math.min(this.frames.length - 1, Math.ceil(s1 / STEP) - this.frameOffset);
    return this.frames.slice(a, b + 1);
  }

  nextSegmentOfType(type, fromS) {
    for (const seg of this.segments) {
      if (seg.type === type && seg.s1 > fromS) return seg;
    }
    return null;
  }
}

/** Surface lift (relative to centreline) for a lateral offset u in [-1,1]. */
export function surfaceLift(frame, u) {
  const bank = Math.tan(frame.roll) * u * frame.halfW;
  const curve = frame.curve * Math.abs(u) ** 3;
  return bank + curve;
}

/** World position for (s, u, h): centreline + lateral offset + height. */
export function posAt(builder, s, u, h, out = {}) {
  const f = builder.sample(s, out.frame || (out.frame = {}));
  const rxv = Math.cos(f.yaw);
  const rzv = -Math.sin(f.yaw);
  const lat = u * f.halfW;
  const lift = surfaceLift(f, u) + h;
  out.x = f.x + rxv * lat;
  out.z = f.z + rzv * lat;
  out.y = f.y + lift;
  return out;
}
