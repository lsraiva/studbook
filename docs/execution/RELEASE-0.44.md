# Release 0.44.0 — the living stable

State: **in review**, not deployed.

## Changes

- **The paddock** (`assets/paddock-scene.js`): the Yard opens on a painted stud farm with the player's own horses out in it.
  - Each horse is repainted in its coat and markings, the same repaint as the cards. Foals are smaller.
  - The horses walk, graze (head down) and stand on their own, with shadows on the grass. Further away means higher up and smaller.
  - Elite horses (stakes or near elite) carry a small gold star above them.
  - Day or dusk follows the player's clock: dusk from 17:00 to 06:00, with lit barn windows and fireflies. `?pasture=day` or `?pasture=dusk` pins the light for previews.
  - Hovering a horse shows its name; clicking it opens the horse card.
  - It draws only while on screen and the tab is visible. Reduced motion gets one still frame.
  - 21:9 on desktop, 220 px tall on phones.
  - Decorative only: it reads the herd and never changes game state.
- **Elite foil:** cards of stakes and near-elite horses get a gold sheen that sweeps across now and then, plus a light that follows the pointer with a slight 3D tilt. Reduced motion turns both off.
- **Art:** two Higgsfield backgrounds, `paddock-day.webp` and `paddock-dusk.webp` (4 credits), recorded in `assets/art/NOTICE-generated.md`.

## Tests

- `tests/browser/pasture.spec.mjs`:
  - the paddock shows and animates;
  - clicking a horse opens it;
  - phone fit with no sideways scroll;
  - reduced motion is a still frame;
  - a herd built with the engine all goes out, and every elite card carries the foil;
  - dusk can be pinned.
- `npm test`: 327 checks, 0 failures.
