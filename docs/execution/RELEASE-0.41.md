# Release 0.41.0 — new horse art, painted markings, screen transitions

State: **in review**, not deployed.

## Changes

- **Screen transitions:**
  - Changing tabs cross-fades the content in 180 ms with the View Transitions API. The masthead and the tabs stay put.
  - Browsers without the API, and reduced motion, switch instantly as before.
  - Rapid clicks cancel the previous transition silently; a bug caught in testing surfaced that cancellation as an on-screen error.
- **Live race from the Programa:** the "next up" race card has its own "Assistir à corrida ao vivo" button, which runs that card's going.
- **Art brief** (`docs/art/BRIEF-HORSE-ART.md`): what to generate with Higgsfield and why. Thoroughbred, side profile, bay with black points, **no white markings**, transparent background; acceptance checks; licence record.
- **Docs:** RELEASE-0.39 (v22) and RELEASE-0.40 (v23) marked deployed.

## New horse art (Higgsfield)

- **The set:** 10 plates (`plate-l1` … `plate-l8`, `plate-foal`, `plate-stallion`) generated with the owner's Higgsfield account. Model: GPT Image 2.6, high quality, 2K, transparent background. Cost: 20 credits.
  - `plate-l1` came from the brief's base prompt.
  - The other nine used it as a style reference, with each lineage's conformation line.
- **Acceptance:**
  - every plate is a thoroughbred, side profile facing left, bay with black points and no white markings;
  - real transparency;
  - a clean repaint on all 8 coats;
  - 88–108 KB per file at 1024 × 680 WebP.
  - Recorded in `assets/art/NOTICE-generated.md`.
- **Use in the game:**
  - portraits in the yard and the horse card now use the new plates, framed whole rather than cropped;
  - the landing page and phone background keep the older art.
- **Painted markings:** `findAnchors` reads each plate's alpha mask to find the front of the face, the ground and the four legs. Star, stripe, blaze and 0–4 socks are then painted from the horse's phenotype, only over the horse, with soft edges. Every portrait now matches its label; the old plates had a blaze painted in for every horse.
- **The bay's mane, tail and lower legs** now come out black, as they should.

## Tests

- New browser checks: the next race card opens the live race; tabs still switch with view transitions; rapid tab clicks surface no error.
- `tests/coat-portrait.test.mjs`: new cases for anchors (nose, ground, four legs) and an empty mask.
- `npm test`: 327 checks, 0 failures. Browser: catalogue, identity and live-race specs, 16 passed.
