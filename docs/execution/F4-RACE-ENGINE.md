# F4 — causal race engine

State: **review** on `feat/f4-race-engine-20261124`. Standalone module: **not wired into the live game**, which still resolves meetings with the existing engine and shows a replay. Rules review (F4-01 approval) is requested in the PR.

## Files

| File | Role |
|---|---|
| `assets/race/causal.js` | Pure ES module, no imports: params, physics, orders, bots, finish, hash. Runs in Node and browsers |
| `server/race-seed.mjs` | Seed = HMAC-SHA256(server secret, race id + nonce); commitment helper |
| `tests/race.test.mjs` | 19 cases: physics, tactics, space, bots, determinism, seeds, benchmark |
| `tests/browser/race-determinism.spec.mjs` | Same race in Chromium and Node → identical hash and order |

## Model (params/1, frozen in `PARAMS_V1`)

- **Clock:** fixed 20 Hz logical ticks; never the client frame rate. Finish time is interpolated inside the tick.
- **Critical-speed physiology:**
  - `stamina` sets the aerobic speed a horse holds for free (13.2–14.8 m/s);
  - `speed` sets top speed (15–19 m/s) and the anaerobic reserve (200–400 m of work above aerobic pace);
  - running above aerobic pace drains the reserve by `excess × (1 + 0.25 × excess) ÷ reserve`;
  - an empty horse fades to 80% of aerobic pace;
  - outcome: speed wins up to ~1,400 m and stamina from ~1,800 m; an average horse runs 2,000 m in ~133 s.
- **Other traits:**
  - `accel`: acceleration;
  - `recovery`: slow refill when easing well under aerobic pace;
  - `temperament`: gate break spread, plus energy wasted fighting when boxed in;
  - `soundness`: stumble risk and tolerance of soft or heavy ground.
- **Ground:** firm/good/soft/heavy change speed, drain and risk.
- **Track:** on bends an outer lane covers more ground for the same progress.
- **Space:**
  - a horse never passes through another in the same lane: it is capped a length behind and matched to the leader's speed (boxed);
  - lane changes need half a length of clear air plus a cooldown;
  - sitting 1–4 lengths behind another horse saves 20% drain (drafting).
- **Orders:** `hold` / `push` / `kick` set a point between aerobic (0) and top (1) speed (0.2 / 0.6 / 1.0); `out` / `in` change lane.
  - Each order has a cooldown, and every order gets a receipt (`ok`, `cooldown`, `blocked`, `rail`, `empty`, `late`, `duplicate`).
  - Spamming orders gives the same time as giving none, or worse.
- **Bots:** `frontRunner`, `closer`, `stalker`.
  - They see only their own state and what a jockey can see (gaps, lanes, speeds), never rival traits.
  - Seeded noise varies their timing between races while replays stay exact.

## Determinism

- **Arithmetic:** only `+ − × ÷`, `min`/`max`, `floor`. No `Math.exp`/`pow`/`sin`, whose last bits differ between JS engines.
- **Randomness:** sfc32 PRNG from a 128-bit seed. `Math.random` is never read (tested).
- **Order independence:**
  - runners are canonicalised by a key hash;
  - inputs are sorted by tick → runner rank → order name;
  - the space rule resolves front-to-back by a total order;
  - identical horses with identical luck produce a dead heat (tested with shuffled arrays).
- **Hash:** FNV-1a ×2 over the canonical result (placings, times, DNF, ticks, engine and params version). Verified equal between Node and Chromium; Firefox/Safari not yet run.

## Seeds (F4-06)

`deriveRaceSeed({ secret, raceId, nonce })`:
- the secret comes from server runtime config (`RACE_SEED_SECRET`, not yet set anywhere) and must be at least 32 characters;
- the nonce is drawn when entries close;
- public ids alone never determine a race;
- `seedCommitment` lets a live room publish a commitment before the off and reveal after (wire-up in F6).

## Benchmark

16 runners × 2,400 m with bots: ~3,700 ticks in ~130 ms on the dev machine (Node 24). The server can run hundreds of races per second; a client can replay or predict without stutter.

## Not done / next

1. **Wiring:** the live meeting still uses `assets/engine.js` scoring. Switching needs a product decision (F0-02: league vs live formats), an engine flag, and a migration of race results — not done.
2. **F5:** track scene, cameras, HUD, animation driven by `frames` (4 Hz snapshots, interpolated client-side). Needs the approved horse (F3).
3. **Cross-browser:** run the determinism spec on Firefox and WebKit.
4. **Balancing:** `params/1` is a first calibration from synthetic fields; play-testing (F7) will produce `params/2`. Results always record their params version.
