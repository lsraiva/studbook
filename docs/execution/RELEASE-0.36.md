# Release 0.36.0 — catalogue design pass (game screens)

State: **deployed** 2026-11-25 as Fly release v20, revision `11066d47be5370d3d379079fef9d2df143c49205`, after a verified backup and restore test (8 accounts, 237 horses, dry run 0 problems).

## Goal

Bring the game screens up to the landing page's standard, without new assets or purchases.

## Changes

- **Shared visual language:** same ink-green, gold `#d7b77d`, cream and Georgia titles as the landing page. Numbers use the reading face with tabular figures instead of monospace.
- **Masthead:** the wordmark is back on every screen; quieter pills.
- **Navigation:** tabs became an underlined contents line.
- **Panels:** serif titles, gold rule, softer gradients.
- **Buttons:** the landing page's gold primary and outlined secondary.
- **Login:** redesigned like the landing page: Georgia title, gold field labels, primary "Entrar", offline demo as a text link.
- **Paddock:** now a runner table: name and line, stable, record, a form bar against the field, tactic, and an elite badge. Your runners are highlighted. Stacks cleanly on phones.
- **Yard hero:** readable figures ("reunião 1 de 4", "média do campo") instead of "m1" and "avg".
- **Translation:** sentences the engine composes are rebuilt in Portuguese from their parts:
  - the horse verdict, sex and age with correct singular and plural, the race-card labels and advice, tiers, care, margins, the luck strip and the pedigree "fundador × fundadora";
  - coat labels now use the Portuguese label;
  - the duplicated race-card sentence is fixed.
- **Bug fixed (also present in 0.35):** the race-card weight meters rendered empty, because a masthead `.bar` rule collapsed their fill. Now covered by a test.

## Not in this release

- **Horse portraits:** they are still one generic image per card, even when the coat differs. Coat-accurate portraits need new art (owner decision).
- **Animated race scene:** next step, built on the F4 engine frames.
- **Translation coverage:** states reached only after races and births may still contain English; this release audited a fresh game on all nine screens.

## Tests

- `npm test`: 304 checks, 0 failures.
- `npm run test:browser`: 20 passed, including the new `catalogue.spec.mjs`: meters have a fill; the paddock is a Portuguese runner table; the wordmark shows on every screen.
- Layout: no overflow at 360, 390, 430 or 1440 px.
