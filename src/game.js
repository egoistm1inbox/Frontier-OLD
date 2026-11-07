// Pure game mechanics — no three.js, no DOM. main.js feeds it input each frame
// and reacts to the events it emits.

import { clamp, lerp, surfaceLift } from './path.js';

export const GRAV = 30;

export function createState() {
  return {
    s: 0,
    u: 0,
    sVel: 27,
    h: 0,
    vh: 0,
    airborne: false,
    lateralVel: 0,
    steer: 0,
    drifting: false,
    driftScore: 0,
    driftScoreTotal: 0,
    charge: 0,
    boost: 0,
    score: 0,
    shields: 3,
    maxShields: 5,
    combo: 1,
    comboTimer: 0,
    dist: 0,
    ringCount: 0,
    invuln: 0,
    hitCooldown: 0,
    scrape: 0,
    spinning: 0,
    dead: false,
  };
}

/**
 * @param {object} s state (mutated)
 * @param {object} ctx { path, props, collected:Set }
 * @param {object} input { left, right, drift }
 * @param {number} dt
 * @param {Array} events mutated: {type, ...}
 * @returns {boolean} alive
 */
export function step(s, ctx, input, dt, events) {
  const b = ctx.path;

  // ---------------- speed -------------------------------------------
  if (s.dead) {
    s.sVel = Math.max(0, s.sVel - 42 * dt);
    s.drifting = false;
  } else {
    const base = 27 + Math.min(23, s.dist / 220);
    const target = base + (s.boost > 0 ? 34 : 0) + (s.drifting ? 3 : 0);
    s.sVel = lerp(s.sVel, target, 1 - Math.pow(0.0009, dt));
    if (s.boost > 0) s.boost = Math.max(0, s.boost - dt);
  }

  // ---------------- steering ----------------------------------------
  let steer = 0;
  if (input.left) steer -= 1;
  if (input.right) steer += 1;
  s.steer = steer;
  const steerRate = s.drifting ? 1.7 : 2.9;
  s.lateralVel = lerp(s.lateralVel, steer * steerRate, 1 - Math.pow(0.0002, dt));
  const f0 = b.sample(s.s, {});
  s.u += (s.lateralVel * dt) / f0.halfW;

  // centrifugal pull — corners genuinely fight the player; drifting grips
  {
    const centrifugal = -f0.curv * s.sVel * (s.drifting ? 0.16 : 0.5);
    s.u += centrifugal * dt;
    s.driftScore += (Math.abs(f0.curv) * 60 + Math.abs(steer) * 14 + Math.abs(s.u) * 12) * dt * 8;
    s.driftScoreTotal += Math.abs(f0.curv) * 70 * dt;
  }

  // ---------------- advance -----------------------------------------
  const adv = s.sVel * dt;
  s.s += adv;
  s.dist += adv * 0.55;
  s.score += adv * 0.32 * s.combo;

  const f = b.sample(s.s, {});

  // ---------------- walls / scrape ----------------------------------
  const lim = 1.02;
  if (s.u < -lim || s.u > lim) {
    s.u = clamp(s.u, -lim, lim);
    s.lateralVel *= -0.25;
    s.sVel = Math.max(19, s.sVel * 0.99);
    s.scrape += dt;
    events.push({ type: 'scrape' });
    if (s.scrape > 1.15 && s.hitCooldown <= 0) {
      s.scrape = 0;
      hit(s, events, 'wall');
    }
  } else {
    s.scrape = 0;
  }

  // ---------------- vertical ----------------------------------------
  if (s.airborne) {
    s.vh -= GRAV * dt;
    s.h += s.vh * dt;
    if (s.h <= 0) {
      if (f.road !== 0) {
        events.push({ type: 'land', hard: s.vh < -10, bonus: 220 * s.combo });
        s.airborne = false;
        s.h = 0;
        s.vh = 0;
        s.combo = Math.min(9, s.combo + 0.6);
        s.comboTimer = 3;
        s.score += 220 * s.combo;
        s.charge = clamp(s.charge + 0.2, 0, 1);
      } else {
        s.h = 0;
        s.vh = Math.min(s.vh, 0);
      }
    }
    if (s.h < -18) {
      s.h = -18;
      s.vh = 0;
      events.push({ type: 'die', cause: 'void' });
      return false;
    }
  } else if (f.road === 0) {
    s.h -= 34 * dt;
    if (s.h < -18) {
      events.push({ type: 'die', cause: 'void' });
      return false;
    }
  } else if (s.h < 0) {
    s.h = 0;
  }

  // ---------------- launch off a kicker lip -------------------------
  if (!s.airborne) {
    const ahead = b.sample(s.s + 3.2, {});
    if (f.road !== 0 && ahead.road === 0 && s.h < 0.6) {
      const seg = b.segments.find((sg) => sg.type === 'kicker' && s.s > sg.s1 - 6 && s.s <= sg.s1 + 3);
      if (seg) {
        let vh = (seg.launchSlope || 0.6) * s.sVel * 0.92;
        const gap = b.segments.find((sg) => sg.type === 'gap' && sg.s1 > s.s);
        if (gap) {
          const need = (gap.s1 - s.s + 6) / Math.max(s.sVel, 18);
          vh = Math.max(vh, (GRAV * need) / 2 + 2);
        }
        s.airborne = true;
        s.vh = clamp(vh, 5, 19);
        events.push({ type: 'launch' });
      }
    }
  }

  // ---------------- timers ------------------------------------------
  if (s.comboTimer > 0) {
    s.comboTimer -= dt;
    if (s.comboTimer <= 0) s.combo = Math.max(1, s.combo - 0.35);
  }
  if (s.invuln > 0) s.invuln -= dt;
  if (s.hitCooldown > 0) s.hitCooldown -= dt;

  // ---------------- props -------------------------------------------
  for (const p of (s.dead ? [] : ctx.props)) {
    const ds = p.s - s.s;
    if (ds < -6 || ds > 30) continue;
    if (ctx.collected.has(p.id)) continue;
    const pu = p.u || 0;
    const f2 = b.sample(p.s, {});
    const lat = Math.abs(s.u - pu) * f2.halfW;
    const safe = s.invuln > 0 || s.boost > 0 || s.spinning > 0;

    switch (p.kind) {
      case 'ring':
        if (Math.abs(ds) < 2.4 && lat < (p.big ? 3.2 : 2.4) && s.h < 3.6) {
          ctx.collected.add(p.id);
          s.ringCount++;
          s.combo = Math.min(9, s.combo + 0.18);
          s.comboTimer = 3;
          s.score += 60 * s.combo;
          s.charge = clamp(s.charge + 0.05, 0, 1);
          if (s.ringCount % 10 === 0 && s.shields < s.maxShields) {
            s.shields++;
            events.push({ type: 'shieldUp', shields: s.shields });
          }
          events.push({ type: 'ring', prop: p });
        }
        break;
      case 'pad':
        if (Math.abs(ds) < 3.8 && lat < f2.halfW * 0.85 && s.h < 1.4) {
          ctx.collected.add(p.id);
          s.boost = Math.max(s.boost, 1.15);
          s.charge = 0;
          s.invuln = Math.max(s.invuln, 0.2);
          events.push({ type: 'pad' });
        }
        break;
      case 'pylon':
        if (Math.abs(ds) < 1.7 && lat < 1.35 && s.h < 2.3 && !safe) hit(s, events, 'pylon', p);
        break;
      case 'barrier':
        if (Math.abs(ds) < 1.5 && lat < 1.9 && s.h < 1.35 && !safe) hit(s, events, 'barrier', p);
        break;
      case 'cone':
        if (Math.abs(ds) < 1.4 && lat < 1.2 && s.h < 1.4) {
          ctx.collected.add(p.id);
          s.sVel *= 0.9;
          events.push({ type: 'cone' });
        }
        break;
      case 'gate':
        if (Math.abs(ds) < 2.2 && Math.abs(s.u) < 0.5 && s.h < 3.6) {
          ctx.collected.add(p.id);
          s.score += 180 * s.combo;
          s.charge = clamp(s.charge + 0.12, 0, 1);
          s.combo = Math.min(9, s.combo + 0.3);
          s.comboTimer = 3;
          events.push({ type: 'gate', prop: p });
        }
        break;
    }
    if (!s.shields) break;
  }

  return s.shields > 0;
}

function hit(s, events, cause, prop) {
  if (s.dead || s.hitCooldown > 0 || s.invuln > 0) return;
  s.shields--;
  s.hitCooldown = 0.9;
  s.invuln = 1.4;
  s.combo = 1;
  s.sVel *= 0.6;
  s.spinning = 0.65;
  events.push({ type: 'hit', cause, prop, shields: s.shields });
  if (s.shields <= 0) events.push({ type: 'die', cause });
}

/** Consume drift bank into boost charge. */
export function endDrift(s, events) {
  if (!s.drifting) return;
  s.drifting = false;
  if (s.driftScore > 40) {
    s.charge = clamp(s.charge + s.driftScore * 0.0016, 0, 1);
    events.push({ type: 'driftEnd', amount: Math.floor(s.driftScore) });
  }
  s.driftScore = 0;
}

/** Spend charge on a boost. */
export function useBoost(s, events) {
  if (s.charge <= 0.18) return false;
  s.boost = Math.max(s.boost, 0.55 + s.charge * 1.1);
  s.charge = 0;
  s.invuln = Math.max(s.invuln, 0.3);
  events.push({ type: 'boost' });
  return true;
}
