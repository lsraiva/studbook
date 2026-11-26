# Release 0.48.0 — Breeding, shown

State: **in review**, not deployed.

## Changes

- **The chosen stallion:** "A cobertura" opens on the stallion behind the selected covering.
  - He is painted in his own coat, with his name, the season the dose was collected, and the value meter against the field average and the elite cut.
  - Near-elite and stakes stallions get a gold tag.
  - With no covering chosen, the panel greys out and says to pick one above.
- **The mares as cards:** each mare is painted in her coat and faces the stallion. She shows her age, value and band, and what the cross would bring.
  - A gold "+10% vigour" chip for a new lineage, or a red "same lineage" warning.
  - The worst inbreeding of the pair, red above 0.2, and how many foals she has left.
  - A large "breed" button, disabled with a reason when she is in foal or no covering is chosen.
  - The old table stays in the page, hidden while the cards show.
- **Portuguese:** new sentences for vigour, same lineage, inbreeding, foals left, the mare line and "collected in season". "nothing extra" on the free care option is now "nada extra".
- **Flaky test fixed:** the 0.46 ripple test could press a tab mid view-transition on a slow CI machine, when presses reach the page root rather than the tab. It now waits for the transition to end.

## Tests

- `tests/browser/breeding.spec.mjs` walks the real flow:
  1. empty board and a disabled breed button;
  2. take the account's first covering and pick it;
  3. the stallion is painted with his meter;
  4. the mare shows vigour or the warning, inbreeding and her line in Portuguese;
  5. breeding her turns the card to in foal.
- `npm test`: 332 checks.
