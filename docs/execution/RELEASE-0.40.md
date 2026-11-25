# Release 0.40.0 — Portuguese for a played game

State: **in review**, not deployed.

## Change

The texts that appear only after races, births and seasons are now translated, with singular and plural handled, by `assets/i18n.js` (`lateGame`):
- **Race reports:** finishing position, distance behind and the reason it was lost, including the "the clock ran out" prefix and the wrong-instruction clause.
- **Meeting summaries:** the winner and the purse.
- **Results:** the results row, the winning margin, the horse record line and the replay commentary.
- **The diary (`S4 · …`):** meetings run, coverings, mares in foal, house buy-backs, full barns and the season opening.
- **Season close:** the stable summary and each rival's intent.
- **Foals:** the birth reveal, a covering that missed, its place against the living field, the margin to the next tier, and foals due.
- **Coverings and the market:** collected coverings, mares in foal, the due season and market lots.

## Audit

An engine-built save (4 seasons, races run, a foal born) was loaded in the browser and all nine screens were scanned. Only Portuguese text remains, plus horse and stable names.

## Tests

- `tests/i18n.test.mjs`: new case with 11 played-game sentences.
- `npm test`: 325 checks, 0 failures.
