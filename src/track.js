// Procedural circuit director: stitches modules (corners, tunnels, gaps,
// overpasses, bowls) forever ahead of the player, and records props
// (obstacles, rings, boost pads, scenery anchors).

import { PathBuilder, STEP } from './path.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class TrackDirector {
  constructor(seed = 1337) {
    this.rng = mulberry32(seed);
    this.path = new PathBuilder();
    this.props = [];
    this.propId = 0;
    this.lastDir = 1;
    this.lastModule = '';
    this.modCount = 0;
    this.bridges = []; // {s0,s1,height}
    this.path.straight(26); // calm opening straight
    this._placeOpening();
    this.pending = 0;
  }

  _pick(arr) {
    return arr[Math.floor(this.rng() * arr.length)];
  }
  _r(a, b) {
    return a + this.rng() * (b - a);
  }
  _addProp(p) {
    p.id = ++this.propId;
    this.props.push(p);
    return p;
  }

  _placeOpening() {
    for (const u of [-0.62, 0, 0.62]) {
      this._addProp({ kind: 'ring', s: 30 + Math.abs(u) * 18, u, h: 1.6 });
    }
  }

  /** Generate until the track extends past `targetS`. */
  ensure(targetS) {
    let guard = 0;
    while (this.path.s < targetS && guard++ < 40) this._nextModule();
    // keep props trimmed
    const cut = targetS - 260;
    if (cut > 0 && this.props.length > 400) {
      this.props = this.props.filter((p) => p.s > cut);
    }
  }

  _nextModule() {
    const p = this.path;
    const diff = Math.min(1, p.s / 4200); // 0 → 1 difficulty ramp
    this.modCount++;

    // Opening: give the player a corner early so they meet the mechanic.
    const options = [];
    options.push('corner', 'corner', 'straightRun', 'straightRun', 'tunnelRun');
    if (this.modCount > 1) options.push('jumpGap');
    if (this.modCount > 2) options.push('bowlRun', 'bridgeSpan', 'sweeperRun', 'tunnelRun');
    if (this.modCount > 4) options.push('doubleHop', 'chicane');
    let kind = this._pick(options);
    if (kind === this.lastModule && Math.random() < 0.7) kind = this._pick(options);
    this.lastModule = kind;

    switch (kind) {
      case 'corner':
        return this._corner(diff);
      case 'tunnelRun':
        return this._tunnelRun(diff);
      case 'jumpGap':
        return this._jumpGap();
      case 'bowlRun':
        return this._bowlRun(diff);
      case 'bridgeSpan':
        return this._bridgeSpan(diff);
      case 'sweeperRun':
        return this._sweeperRun();
      case 'doubleHop':
        return this._doubleHop();
      case 'chicane':
        return this._chicane(diff);
      default:
        return this._straightRun(diff);
    }
  }

  _straightRun(diff) {
    const p = this.path;
    const len = Math.round(this._r(16, 24));
    this._addObstacles(p.s + STEP * 4, p.s + STEP * len, diff);
    p.straight(len);
    return 'straightRun';
  }

  _corner(diff) {
    const p = this.path;
    p.straight(Math.round(this._r(4, 9)));
    const dir = this.rng() < 0.5 ? 1 : -1;
    const steps = Math.round(this._r(34, 44));
    const start = p.s;
    p.turn(steps, dir, { bank: 0.46, width: 11 });
    const seg = p.segments[p.segments.length - 1];
    // drift rings hugging the inside of the banked wall
    const inside = -dir * 0.55;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const t = 0.3 + (i / n) * 0.6;
      this._addProp({ kind: 'ring', s: start + (seg.s1 - start) * t, u: inside, h: 1.7, big: i === n - 1 });
    }
    // wall chevrons at the outside
    this._addProp({ kind: 'chevron', s: start + STEP, u: dir * 0.82, h: 2.2, dir });
    this._addProp({ kind: 'chevron', s: seg.s1 - STEP * 2, u: dir * 0.82, h: 2.2, dir });
    this.turnHint = { s0: start, s1: seg.s1, dir };
    p.straight(Math.round(this._r(3, 7)));
    return 'corner';
  }

  _tunnelRun(diff) {
    const p = this.path;
    p.straight(5);
    const steps = Math.round(this._r(22, 30));
    const s0 = p.s;
    p.tunnel(steps);
    const s1 = p.s;
    // pylons alternating inside the tunnel
    const lanes = [-0.55, 0, 0.55];
    for (let s = s0 + 12; s < s1 - 10; s += this._r(16, 22)) {
      const u = this._pick(lanes);
      this._addProp({ kind: 'pylon', s, u, h: 2.6 });
      const other = this._pick(lanes.filter((l) => l !== u));
      this._addProp({ kind: 'ring', s, u: other, h: 1.6 });
    }
    this._addProp({ kind: 'tunnelSign', s: s0, h: 0 });
    p.straight(6);
    return 'tunnelRun';
  }

  _jumpGap() {
    const p = this.path;
    p.straight(Math.round(this._r(10, 16)));
    const rise = this._r(2.0, 3.2);
    const kickS = p.s;
    p.kicker(5, rise, 9);
    this._addProp({ kind: 'launch', s: kickS + STEP * 2.5, u: 0, h: 0 });
    for (const u of [-0.5, 0, 0.5]) {
      this._addProp({ kind: 'ring', s: p.s + 10 + u * 6, u, h: 4.2 });
    }
    p.gap(Math.round(this._r(9, 12)));
    p.landing(9, 9, -rise * 0.92);
    this._addProp({ kind: 'landMark', s: p.s - STEP * 6, u: 0, h: 0 });
    return 'jumpGap';
  }

  _doubleHop() {
    const p = this.path;
    p.straight(8);
    p.kicker(4, 1.8, 9);
    for (const u of [-0.4, 0.4]) this._addProp({ kind: 'ring', s: p.s + 6, u, h: 3.2 });
    p.gap(6);
    p.landing(5, 9, -1.6);
    p.straight(6);
    p.kicker(4, 2.4, 9);
    this._addProp({ kind: 'ring', s: p.s + 8, u: 0, h: 4 });
    p.gap(8);
    p.landing(8, 9, -2.2);
    return 'doubleHop';
  }

  _bowlRun(diff) {
    const p = this.path;
    p.straight(4);
    const steps = Math.round(this._r(20, 28));
    const s0 = p.s;
    p.bowl(steps, { width: 13, wallRise: 5.2 });
    const s1 = p.s;
    // slalom cones and wall rings
    for (let s = s0 + 10; s < s1 - 8; s += 14) {
      const side = Math.sin(s * 0.1) > 0 ? 1 : -1;
      this._addProp({ kind: 'cone', s, u: side * 0.15, h: 0.7 });
      this._addProp({ kind: 'ring', s: s + 6, u: -side * 0.62, h: 2.4 });
    }
    this._addProp({ kind: 'pad', s: s0 + 6, u: 0, h: 0 });
    return 'bowlRun';
  }

  _bridgeSpan(diff) {
    const p = this.path;
    const len = Math.round(this._r(20, 26));
    const s0 = p.s;
    this._addObstacles(p.s + 6, p.s + STEP * len - 6, diff);
    p.straight(len);
    const mid = s0 + (p.s - s0) * this._r(0.35, 0.65);
    this.bridges.push({ s: mid, s0: mid - 3, s1: mid + 3, w: p.sample(mid).halfW * 2.9 });
    this._addProp({ kind: 'bridge', s: mid, h: 0 });
    return 'bridgeSpan';
  }

  _sweeperRun() {
    const p = this.path;
    const dir = this.lastDir * -1;
    this.lastDir = dir;
    p.sweeper(26, dir, { sweep: 0.85, bank: 0.34, width: 11 });
    const seg = p.segments[p.segments.length - 1];
    for (let i = 0; i < 3; i++) {
      this._addProp({ kind: 'ring', s: seg.s0 + (seg.s1 - seg.s0) * (0.25 + i * 0.25), u: -dir * 0.4, h: 1.7 });
    }
    p.straight(6);
    return 'sweeperRun';
  }

  _chicane(diff) {
    const p = this.path;
    p.turn(26, 1, { bank: 0.4, width: 10 });
    p.turn(26, -1, { bank: 0.4, width: 10 });
    p.straight(10);
    this._addObstacles(p.s - 24, p.s - 4, diff);
    return 'chicane';
  }

  /** Fill a stretch with pylons / barriers / gates / rings / pads. */
  _addObstacles(s0, s1, diff) {
    const rng = this.rng;
    let s = s0 + this._r(6, 12);
    const lanes = [-0.68, -0.34, 0, 0.34, 0.68];
    const count = 2 + Math.floor(diff * 3 + rng() * 2);
    for (let i = 0; i < count && s < s1 - 6; i++) {
      // never wall the whole track off: leave at least one clear lane
      const u = this._pick(lanes);
      const roll = rng();
      if (roll < 0.5) {
        this._addProp({ kind: 'pylon', s, u, h: 2.6 });
      } else if (roll < 0.78) {
        this._addProp({ kind: 'barrier', s, u, w: 0.42, h: 1.3 });
      } else if (roll < 0.94) {
        this._addProp({ kind: 'gate', s, u: 0, h: 3.4 });
      } else {
        this._addProp({ kind: 'pad', s, u, h: 0 });
      }
      const free = lanes.filter((l) => Math.abs(l - u) > 0.3);
      const ringLane = this._pick(free.length ? free : [0.9]);
      this._addProp({ kind: 'ring', s: s + this._r(2, 5), u: ringLane, h: 1.7 });
      s += this._r(13, 21) * (1 - diff * 0.35);
    }
    if (rng() < 0.5) this._addProp({ kind: 'pad', s: s0 + this._r(3, 10), u: this._pick(lanes), h: 0 });
  }
}
