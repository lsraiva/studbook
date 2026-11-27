# Release 0.52.0 — the report's cheap P1 items

State: **deployed** 2026-11-27 to `studbook-luann` (gru), revision `ad17c34a79e6897bf410ecaf06f7d7aaca9853d6`. Pre-deploy backup `20261127T022659Z`, restore tested: 13 accounts, 425 horses, 0 problems.

## Changes

- **The rest of the Portuguese.**
  - I found the leftover English by scanning every screen of the rendered page, both offline and against a real local server with a test account, rather than from a list.
  - Translated: the online room line ("conectado: o estábulo está no servidor", "sala …", "· 1 lugar · a reunião 1 fecha em", "veja o código de seis dígitos…"), "entrar na sala de um amigo", "verificar", "copiar o link", "trocar de sala", the room's invite sentence, "Nenhum lote de outras salas agora.", the wallet prompt, "primeira olhada", "comparado à mãe", "lote de cavalo", "aposentado", and the "buy a horse" next step.
  - Also translated: the tooltips and screen-reader labels the scan found in English (buttons, tables, room fields).
- **Name the stable at sign-up.** The sign-up card has an optional "nome do estábulo" field. When creating a stable it is applied right away, with the same 2–24 character rule as the Carteira. Logging in ignores it.
- **One guidance block, on the Yard.** The road map, the advice line and the loading status no longer repeat on every tab. Elsewhere the next step shrinks to one compact line with its button. An error status still shows everywhere.
- **The meeting clock, readable.** The online countdown is a pill with a clock mark. It turns brass in the last minute and pulses red in the last 15 seconds (no pulse with reduced motion). A pause would change the server's rules, so it is not part of this release.
- **Global market duplicates.** Identical lots from another room (same item, room, seller and price) are one card with a count, as in the local catalogue.
- **The result card.**
  - After a birth it now shows the foal painted in its own coat and markings, as the birth scene does, instead of a generic foal picture.
  - It has a close button at the top, because on a phone the only way out sat at the bottom of a long card.
- **Bug found while testing:** Escape on the birth scene also closed the result card underneath, so the player lost the card. Escape now closes the scene only.

## Tests

- `tests/browser/p1.spec.mjs`:
  - the guidance block is whole on the Yard and a compact line elsewhere;
  - the clock turns brass and then red;
  - sign-up sends the stable name (server mocked);
  - the result card shows the painted foal, survives Escape on the scene, and closes from the top.
- `npm test`: 341 checks.
