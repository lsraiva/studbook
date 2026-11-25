# Release 0.38.0 — coat-accurate portraits

State: **in review**, not deployed. Stacked on 0.37 (live race, PR #7).

## Change

Horse portraits in the yard gallery and the horse card are now repainted in the horse's own coat (8 coats), from the lineage paintings the game already ships. No new art and no purchase.

- **Method:** `assets/coat-portrait.js` remaps each painting's light onto the coat's ramp (shadow, colour, sheen) and dark, unsaturated hair onto the mane colour; specular highlights stay bright.
  - Each painting-and-coat pair is computed once in the browser and cached.
  - The image shows at once with the previous CSS tint, then swaps to the repainted version; if anything fails, the tinted image stays.
- **Before:** a CSS filter tinted the whole picture, so a cremello still read as a tinted bay.

## Limits

- Face markings and socks drawn in the paintings themselves are not removed; the coat label is the reference.
- On plates with a light mane, a bay's mane comes out brown instead of black.
- Fully faithful portraits (markings, conformation) still need new art: an owner decision.

## Tests

- `tests/coat-portrait.test.mjs` (5 cases): transparency and alpha kept; coat colour families; mane colour; highlights; no NaN.
- Browser: yard portraits are marked painted, use a data URL and carry no CSS filter.
- `npm test`: 324 checks, 0 failures. `npm run test:browser`: 24 passed.
