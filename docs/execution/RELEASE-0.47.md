# Release 0.47.0 — the markets as a catalogue

State: **in review**, not deployed.

## Changes

- **Lot cards** (`lotCard` in `assets/ui.js`): every lot in the stud market and the horse market is now a catalogue card.
  - The animal is painted in its own coat and markings, the same repaint as the Yard. Foals show as foals.
  - The coat label sits under the name, and horse lots add sex and age.
  - A value meter has two ticks: the field average and the elite cut.
  - Stakes and near-elite lots get a gold tag and a gold edge.
  - The price is large, with the seller underneath.
- **Grouped doses:** identical coverings (same stallion, seller, price and vintage) are one card with an "N doses" count. In a fresh game the stud market went from 24 near-identical cards to 6. Buying takes one dose; certifying covers the stallion.
- **Stale address:** the offline notes said "Play on studbook.fly.dev", the retired host. They now say to play online.
- **Engine view:** horse lots now carry `horseLineage` so the card can pick the right plate. It is display only and nothing is saved.

## Tests

- `tests/browser/market.spec.mjs`:
  - stud cards are grouped, and the dose counts add back up to every lot;
  - portraits are repainted, the meter has its elite tick, and the buy button is there;
  - horse lots show sex and age in Portuguese;
  - the retired address is gone.
- The i18n, catalogue and modes specs still pass. `npm test`: 332 checks.
