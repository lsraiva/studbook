# Release 0.49.0 — Ranking podium, a straight field, the tack room drawn

State: **deployed** 2026-11-27 to `studbook-luann` (gru), revision `523b7afe8f2e89493d1ff03be9dc9cd9c11c4625`. Pre-deploy backup `20261127T004812Z` (SHA256 `b6011036…af34`, matched on the machine), restore tested: 12 accounts, 404 horses, 0 problems.

## Changes

- **Ranking podium:** the table now opens on the top three as medals: gold in the middle on the tallest step, silver left, bronze right.
  - Each step shows the stable, whether it is you, a house or a rival, the prize money, wins and best horse.
  - Your own step is outlined in brass.
  - The full table follows, with its headers now in Portuguese ("vitórias", "cavalos").
- **The field lines up:** in the race card's field, a runner with two tags (for example "poupar" and "classe de elite") pushed its whole row out of line. The tag column now has a fixed width on desktop, so every row's form bar starts at the same place.
- **Tack room:** each item has a drawn brass mark: the catalogue page, the feed sack and the meeting pass. "Conditioning feed" is now "Ração de condicionamento".
- **Ledger:** "horses", "start over" and "standard" were still in English; they now read "cavalos", "recomeçar" and "padrão".
- **Docs:** RELEASE-0.48 marked deployed.

## Tests

- `tests/browser/screens-pass.spec.mjs`:
  - the podium has three steps, gold in the middle and tallest, in Portuguese;
  - every runner row's form bar starts at the same x;
  - the three tack-room items have their marks and no English;
  - the ledger leaves no English behind.
- `npm test`: 332 checks.
