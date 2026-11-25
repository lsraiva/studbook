# Release 0.39.0 — race sound, opening card, empty states

State: **deployed** 2026-11-25 as Fly release v22, revision `6f98ca8f6b178c13712e3d398ca4daefa9077a65`, after a verified backup and restore test (10 accounts, 301 horses, dry run 0 problems).

## Changes

- **Race sound** (`RaceAudio` in `assets/race/scene.js`), synthesised with Web Audio, with no samples or downloads:
  - start bell;
  - the field's hoofbeats at the pace the race is played (faster at 2×);
  - a crowd that rises through the home straight and cheers the finish.
  - It follows the game's own sound setting and has a "Som" switch in the race controls. It is off with reduced motion, and any audio failure leaves a silent race.
- **Opening card:** the wordmark over the hero image, "Abrindo o estábulo…" and a moving gold rule, instead of plain "conectando…" text. It leaves as soon as a stable or the account gate is ready (then is removed from the page), with a CSS fallback after 9 s.
- **Empty states:** the 8 "nothing here yet" places share an illustrated style: a gold horseshoe mark, a dashed frame and the sentence that says what to do next.
- **Docs:** RELEASE-0.37 and RELEASE-0.38 are marked deployed (v21, `af2f81c`).

## Tests

- `npm test`: 324 checks, 0 failures.
- New browser checks:
  - the opening card leaves and the game is clickable;
  - empty states carry the mark;
  - the race sound switch toggles without page errors.
- **Local browser runs were unreliable during this work.** The machine slowed progressively: boot went from 0.6 s to 16 s within one measurement, identically with and without the 0.38 portrait painting. Rely on CI for the browser suite.
