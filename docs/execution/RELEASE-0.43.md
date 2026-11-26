# Release 0.43.0 — the birth, staged

State: **deployed** 2026-11-26 to `studbook-luann` (gru), revision `e2d31ee6c9770e15051bb6c865715a89c316c651`. Pre-deploy backup `20261126T143905Z` (SHA256 `88820d51…3763`, matched on the machine), restore tested: 11 accounts, 354 horses, 0 problems.

## Change

A foal's birth is now a moment, `assets/birth-scene.js`, played over the existing result card. The card stays underneath with every number.

1. "Temporada N · nasce um potro/uma potra". The mare and the stallion enter from the sides, each in its own coat and markings, both facing the centre.
2. Two streams of gold leave the parents and braid toward the centre, where a glow gathers. A settling motif plays as the lines join.
3. The foal appears in its own coat and painted markings, with a gold halo, its name in Georgia, its coat label, and its tier stamped on. The existing fanfare plays at this moment, scaled to the tier.
4. "Conhecer o potro" (or Escape) closes the scene and focuses the card.

- **Skip and reduced motion:** "Pular" skips at any time; reduced motion shows the final frame at once.
- **Repeats:** each foal is staged once.
- **Parents' art:** a stallion from another stable falls back to the stallion plate.
- **Phone layout:** the foal on top, the parents below.
- **Assets:** no new art; reuses the 0.41 plates and the coat repaint.

## Tests

- `tests/browser/birth.spec.mjs`: a save where the player's mare has just foaled, built with the engine inside the test.
  - The scene shows both parents, reveals the foal with its name and a painted portrait, and closes to the result card.
  - With reduced motion the final frame shows at once.
- `npm test`: 327 checks. `npm run test:browser`: 33 passed.

Also: RELEASE-0.42 is marked deployed (v3, `70e746c`).
