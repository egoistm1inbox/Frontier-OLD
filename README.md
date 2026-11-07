# NEON OVERDRIVE — OASIS Circuit

An endless neon hover-racer in the spirit of *Ready Player One* crossed with
*Subway Surfers*: auto-throttle, dodge traffic, jump ramps, blast through tunnels
and drift 90° banked skate-park corners at full speed.

![sector](https://img.shields.io/badge/sector-07-31f7ff) ![stack](https://img.shields.io/badge/three.js-r170-ff2fd0)

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

| Input | Action |
| --- | --- |
| `A` / `D` or `←` / `→` | steer across the deck |
| `Space` (hold) | drift — grips the 90° corners, banking charges boost |
| `Shift` | release boost charge |
| `Esc` | pause · `R` restart |

On touch devices: on-screen ◀ / DRIFT / ▶ buttons.

## What's in the circuit

- **Endless procedural track** — corner, tunnel, ramp-and-gap, bowl, overpass,
  sweeper and chicane modules stitched ahead of you forever.
- **True 90° banked turns** — a quarter-pipe wall lifts the outside edge; drift
  to hold the line instead of scraping the barrier.
- **Ramps & gaps** — the launch arc is solved per-gap so jumps are always
  clearable, but the landing bonus rewards speed.
- **Tunnels** with glowing ribs, overhead bridges crossing the deck, skate-park
  bowls with curving quarter-pipe walls.
- **Pickups**: golden rings (combo + charge, a shield every 10), boost pads,
  and bonus arches for threading the middle.
- **Shields, combo multiplier, boost, screen shake, bloom, drift sparks** and a
  procedurally synthesised engine (WebAudio — no audio files).

## Architecture

| File | Role |
| --- | --- |
| `src/path.js` | pure path maths — sampled frames, banking, cross-sections. No three.js. |
| `src/track.js` | procedural director: stitches modules, records props, bridges. |
| `src/game.js` | pure game rules — steering, centrifugal force, jumps, collisions. |
| `src/world.js` | three.js rendering: ribbons, quarter-pipe walls, tunnels, props, FX. |
| `src/main.js` | boot, input, HUD, camera, audio, event wiring. |

`path.js`, `track.js` and `game.js` have zero rendering dependencies, so the whole
game loop can be simulated headlessly (that is how the jump arcs and difficulty
were tuned).
