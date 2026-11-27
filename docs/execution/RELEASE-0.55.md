# Release 0.55.0 — odds before the off

State: **in review**, not deployed. Built on top of 0.54 (the causal engine behind a flag, still off).

## Changes

- **`fieldOdds(state)` in `assets/engine.js`:** each declared runner's chance of winning, its chance of a paid place and its expected prize.
  - The odds come from running the next meeting many times with the very rule that will decide it: 400 runs of the form score, or 24 runs of the causal race in a room switched to it.
  - Asking for the odds changes nothing: they use their own random stream, never the room's.
  - The same field always gives the same odds. A changed entry or instruction gives new ones. Results are cached per field.
- **The field shows them.** Every runner row has its price ("3 para 1", "1 para 2", "50+ para 1", "quase certo") and its chance in percent; the favourite is in brass. The player's own runner adds "prêmio esperado ₲ X · inscrição ₲ Y", the report's "expected return before the race".
- **A line under the title says where the odds come from** and that changing an instruction moves them.

## What the odds revealed, and the calibration that followed

Measured on 40 fields per rule (five simulated games, eight meetings each):

| | form score (today) | causal, params/1 | causal, params/2 |
|---|---|---|---|
| the favourite's chance, on average | 82% | 68% | 52% |
| fields with a 90%+ favourite | 50% | 23% | 0% |
| runners with at least a 5% chance | 1.7 | 2.2 | 3.4 |

- **The odds are honest.** Over 80 simulated meetings the favourites were priced at 85% and won 88%.
- **Most races were decided before the off, under both rules.** Today half the fields have a near-certain winner.
- **params/2 = params/1 + form on the day.**
  - Each time a horse runs it is up to 3.5% better or worse than its breeding. The draw is seeded like everything else, and a steadier temperament varies less.
  - Nothing else changed, so traits keep their full effect.
  - With `formSpread` 0 (params/1) no number is drawn, so older races replay exactly.
- **Why form and not weaker traits.** Shrinking the trait gains to 60% also opened the fields, but it makes breeding matter less. Form on the day keeps the best horse the favourite and makes it beatable.
- **What breeding still decides** (30 later-season fields, against the same fields without day form):
  - the best horse is still the favourite in 80% of fields;
  - the best two win 60% of races;
  - the bottom half wins 16%.
- **On those later-season fields the favourite averages 45%.** The 52% above includes opening fields, where one stakes-class horse stands far above a new yard's runners.
- New races (official in causal rooms, the exhibition, the ride and the odds) run on params/2; every result records its params version.

## Tests

- `tests/odds.test.mjs`, 13 checks:
  - asking changes nothing in the room; every runner is priced;
  - win chances add to one and paid chances to the places paid;
  - the same field gives the same odds;
  - favourites win about as often as priced;
  - the view carries them, and an instruction moves them;
  - a causal room gets causal odds without touching its random stream.
- `tests/official-race.test.mjs`: new races say params/2; params/2 differs from params/1 only by `formSpread`; a params/1 race still replays exactly; a params/2 race replays from its seed.
- `tests/browser/odds.spec.mjs`:
  - prices and chances in Portuguese, the favourite marked, the player's expected prize, rows aligned;
  - causal odds with `?engine=causal`;
  - a phone fits without sideways scroll.
