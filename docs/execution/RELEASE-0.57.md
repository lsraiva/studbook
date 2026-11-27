# Release 0.57.0 — the first session: fun first, and the foal named in its scene

State: **deployed** 2026-11-27 to `studbook-luann` (gru), revision `45770b94839d1971fc384bb31f5ffa3ad298f612`. Pre-deploy backup `20261127T133115Z` (SHA256 `6ce0345a…4a4f`, matched on the machine), restore tested: 13 accounts, 449 horses, 0 problems.

## Changes

- **The first step is the fun one.** A new yard's guide used to open with "take the first covering". It now opens with "inscreva seu cavalo na primeira reunião" (free in season one), so the horse is in the field, with odds, within one click. The covering, the cover and the meeting follow as before ("Agora a criação: …").
- **The first ride is offered.** Once the player's horse is in the field, the guide shows a brass invitation: "Seu cavalo está no campo. Monte a corrida ao vivo agora…" with the button "Montar a corrida ao vivo". It is shown until the player has opened a rideable race once (remembered in this browser), and only in the first two seasons.
- **The foal is named in the birth scene.** When the foal is revealed, a "Batize o potro" field appears with its studbook name filled in.
  - "Batizar" (or Enter) gives it the owner's name, by the same rule and action as the result card's field (2 to 24 characters).
  - A name that is too short is refused in words.
  - The scene's title changes at once, and "Batizado!" confirms it.

## What it does not do

- **The first foal still arrives when the season turns** (four meetings). Shortening that would change the rules of the calendar; the ride and the odds fill the wait instead.

## Tests

- `tests/ui.test.mjs`: the first step enters the horse at no cost, the ride is offered, and the same button then takes the covering.
- `tests/browser/first-session.spec.mjs`:
  - a new yard is led to enter, then invited to ride; the race opens with the reins; the invitation does not come back;
  - in the birth scene a short name is refused, "Trovão 7" is accepted with Enter, the title and the saved horse change, and the digits do not switch screens.
- `tests/browser/breeding.spec.mjs` follows the new first step.
- `npm test`: 403 checks.
