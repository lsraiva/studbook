# Release 0.41.0 — screen transitions, race from the race card, art brief

State: **in review**, not deployed.

## Changes

- **Screen transitions:**
  - Changing tabs cross-fades the content in 180 ms with the View Transitions API. The masthead and the tabs stay put.
  - Browsers without the API, and reduced motion, switch instantly as before.
  - Rapid clicks cancel the previous transition silently; a bug caught in testing surfaced that cancellation as an on-screen error.
- **Live race from the Programa:** the "next up" race card has its own "Assistir à corrida ao vivo" button, which runs that card's going.
- **Art brief** (`docs/art/BRIEF-HORSE-ART.md`): what to generate with Higgsfield and why. Thoroughbred, side profile, bay with black points, **no white markings**, transparent background; acceptance checks; licence record.
- **Docs:** RELEASE-0.39 (v22) and RELEASE-0.40 (v23) marked deployed.

## Waiting on

- **Higgsfield connector:** not yet connected in the session. Generation of the new plates starts once the owner signs in.

## Tests

- New browser checks: the next race card opens the live race; tabs still switch with view transitions; rapid tab clicks surface no error.
- `npm test`: unit suite green.
