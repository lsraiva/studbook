# Release 0.54.0 — the causal engine can decide official results (F0-02), behind a flag

State: **deployed with 0.55** on 2026-11-27 (revision `38f60b5664069febb577ecceeee9ecf2184aba92`). **The flag is off**: `STUDBOOK_RACE_ENGINE` is unset on the machine and all 12 rooms decide by the legacy rule.

## Changes

- **`assets/race/official.js`:** runs an official meeting through the causal engine.
  - Inputs: each horse's genetic traits, its stable's instruction as a riding style (push = front-runner, steady = stalker, hold = closer), and the meeting's course (distance and going, the same table the live exhibition uses).
  - Output: the finishing order, the times, the non-finishers, and a record of engine, params, seed and hash.
- **`assets/engine.js`, `runMeeting`:** in a room whose `raceEngine` is `"causal"`, the causal finishing order decides places, prizes, wins, records and the "lengths behind".
  - The seed is drawn from the room's own random stream, so a room replays exactly.
  - The legacy score is still computed: it drives the pace shapes of the old replay and the "why it lost" notes.
  - Fields under 2 or over 16 runners fall back to the legacy score.
- **Every result records how it was decided:** `lastRace.official` holds `{ engine: "legacy" }`, or the causal engine, params, seed, hash, distance and going. With the seed, the very race that decided the money can be replayed frame for frame.
- **`setRaceEngine(state, "causal" | "legacy")`:** logged once in the room's diary when it changes, with the meeting it applies from.
- **Switches:**
  - Server: env `STUDBOOK_RACE_ENGINE=causal` (or `legacy`) applies to every room from its next meeting. Unset leaves rooms as they are.
  - Offline: `?engine=causal` or `?engine=legacy` in the URL switches that browser's game, for trying it out.
- `tools/compare-race-engines.mjs` measures the difference; see below.

## What changes for players (20 games × 6 seasons, same seeds)

| | legacy (today) | causal |
|---|---|---|
| best horse for the day's going wins | 80.6% | 32.7% |
| going fit vs placing (Spearman) | 0.939 | 0.363 |
| best horse by value wins | 41.5% | 24.4% |
| winner among the top 3 by value | 76.3% | 54.0% |
| an outsider (bottom half by value) wins | 7.1% | 21.0% |
| richest stable's share of prize money | 54.0% | 51.4% |
| time to resolve a meeting | ~1 ms | ~17 ms |

**How to read the table:**

- **Today the result is almost decided before the off.** The best-suited horse wins four times in five. The tactic and the noise barely move it.
- **The causal race is close to real racing,** where favourites win about a third of the time. It is the race the live viewer shows. Riding style, the draw, getting boxed in and stamina now matter.
- **The cost:** breeding a better horse pays off less directly. That is a balance decision, not a bug. `params/1` was a first calibration from synthetic fields, and playtesting (F7) would produce `params/2`.

## Calibration: what the measurements say (2026-11-27)

The plan was to tune the engine until the favourite wins about 40%. Measuring first changed the plan:

- **The causal race is not too random.** Take a field, run it 14 times with different seeds, and call the most frequent winner the true favourite. On a fresh seed that horse wins **61.5%** of the time (48 fields from simulated games).
- **The low numbers in the table above measure a mismatch, not luck.** "Value" and "going fit" are the legacy model's numbers. They describe what the legacy score rewards, and the causal race rewards something else (pace against distance, energy, traffic). Widening the trait gains by 1.5× and 2×, and cutting start and stumble luck, left "best horse by value wins" at 23–27% every time.
- **The instruction is a real decision.** With every runner switched to the same instruction, the true favourite changes in **46%** of fields.

So no physics parameter was changed: `params/1` stays. What has to change before the flag goes on is what the player is shown:

1. **Odds from the race itself.** Run the declared field many times and show each runner's chance. That is the honest "cotação", and it is the next item on the roadmap anyway.
2. **Value, form bars and the "why it lost" notes** still speak the legacy model's language. Under the causal engine they must be derived from the causal race, or a player will breed for numbers that no longer decide anything.

`officialRace` now takes an optional `params`, so such experiments need no edits to the engine.

## Not done

- **The live viewer still shows an exhibition of the *next* field with a fresh seed.** It does not yet replay the official race from its recorded seed. That replay is the natural next step. The seed of an unrun meeting must never be shown, or a player could see the result before entering.
- **No server test for the env switch.** The rule is covered by unit tests and the offline browser test.

## Tests

- `tests/official-race.test.mjs`, 15 checks:
  - the flag defaults off, switches once, and an unknown name falls back to legacy;
  - legacy meetings are unchanged;
  - a causal meeting records engine, params, seed and hash;
  - the same seed gives the same hash, and replaying the recorded seed reproduces the race;
  - the table follows the causal order, and the money and wins follow it.
- `tests/browser/official-race.spec.mjs`: `?engine=causal` decides by the race; without it, legacy.
- `npm test`: 378 checks (after merging main at 0.53). The live-race and determinism specs still pass.
