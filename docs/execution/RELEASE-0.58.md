# Release 0.58.0 — the shareable card

State: **deployed** 2026-11-27 to `studbook-luann` (gru), revision `28b1571dd1b553704855786dccde9a66ac8e82a4`. Pre-deploy backup `20261127T135911Z` (SHA256 `0d32855c…1b42`, matched on the machine), restore tested: 13 accounts, 460 horses, 0 problems. The causal engine stays on.

## Changes

- **`assets/share-card.js`:** draws a horse as a picture worth posting, 1080 × 1350 (4:5), on a canvas in the browser.
  - The horse is painted in its own coat and markings, standing on the stud farm at dusk.
  - Below it: a headline ("3 vitórias em 9 corridas", "Nasceu na temporada 4" or "Do meu haras"), the name, the coat, the line ("Pai × Mãe", or "Linha fundadora · L6" for a founder) and three facts.
  - The facts are the record for a horse that has raced (corridas, vitórias, colocações), and age, sex and lineage otherwise.
  - A gold seal marks elite and near-elite horses, or the foal's tier at birth.
  - The foot carries the stable's name and, online, the site's address.
- **Where the button is:** "compartilhar cartão" on every horse's card, and on the result card after a birth, next to the naming field.
- **How it leaves the game:** the system share sheet where the browser offers one for files (phones), otherwise a PNG download named after the horse. A toast says which happened.
- **Nothing is uploaded.** The card is drawn locally from art already loaded; the test confirms no request other than GET is made.

## Tests

- `tests/browser/share-card.spec.mjs`:
  - the horse card's button downloads a real PNG of 1080 × 1350, over 200 KB, named `studbook-<name>.png`, and says so in Portuguese;
  - a card drawn with known words has the name, the facts, the foot and the horse where they belong, and sends nothing.
- `npm test`: 403 checks.
