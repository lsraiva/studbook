# Release 0.55.0 — odds before the off

State: **in review**, not deployed. Built on top of 0.54 (the causal engine behind a flag, still off).

## Changes

- **`fieldOdds(state)` in `assets/engine.js`:** each declared runner's chance of winning, its chance of a paid place and its expected prize.
  - The odds come from running the next meeting many times with the very rule that will decide it: 400 runs of the form score, or 24 runs of the causal race in a room switched to it.
  - Asking for the odds changes nothing: they use their own random stream, never the room's.
  - The same field always gives the same odds. A changed entry or instruction gives new ones. Results are cached per field.
- **The field shows them.** Every runner row has its price ("3 para 1", "1 para 2", "50+ para 1", "quase certo") and its chance in percent; the favourite is in brass. The player's own runner adds "prêmio esperado ₲ X · inscrição ₲ Y", the report's "expected return before the race".
- **A line under the title says where the odds come from** and that changing an instruction moves them.

## What the odds reveal (measured on 40 fields per rule)

| | form score (today) | causal race |
|---|---|---|
| the favourite's chance, on average | 82% | 68% |
| fields with a 90%+ favourite | 50% | 23% |
| runners with at least a 5% chance | 1.7 | 2.2 |

- **The odds are honest.** Over 80 simulated meetings the favourites were priced at 85% and won 88%.
- **Most races are decided before the off, under both rules.** Today half the fields have a near-certain winner. The causal race is more open but still far from the roughly 40% favourite the roadmap aims for.
- **This is now the calibration metric.** Earlier attempts measured against the legacy "value", which was the wrong yardstick (see RELEASE-0.54). The lever is the spread of ability inside a field (how far the best horse is from the rest), not luck. Tuning it is the next step, and it needs `fieldOdds` to accept alternative params.

## Tests

- `tests/odds.test.mjs`, 13 checks:
  - asking changes nothing in the room; every runner is priced;
  - win chances add to one and paid chances to the places paid;
  - the same field gives the same odds;
  - favourites win about as often as priced;
  - the view carries them, and an instruction moves them;
  - a causal room gets causal odds without touching its random stream.
- `tests/browser/odds.spec.mjs`:
  - prices and chances in Portuguese, the favourite marked, the player's expected prize, rows aligned;
  - causal odds with `?engine=causal`;
  - a phone fits without sideways scroll.
