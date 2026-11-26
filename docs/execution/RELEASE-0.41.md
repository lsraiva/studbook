# Release 0.41.0 — new horse art, painted markings, screen transitions

State: **deployed** 2026-11-26 to the new Fly app `studbook-luann` (region gru), revision `c49156f9952b98a747a3fc64db5f2e6c5deba23b`. See RELEASE-0.41 migration note below.

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

## Migration to the owner's Fly account (2026-11-26)

- **Why:** the original Fly account's trial ended and its machines stopped, so `https://studbook.fly.dev` went down.
- **New home:** `https://studbook-luann.fly.dev`, app `studbook-luann` on the owner's own Fly account (personal org), region `gru`, one shared-cpu machine with 256 MB and an encrypted 1 GB volume `studbook_data`.
- **Procedure:**
  1. Created the app and volume, and staged `STUDBOOK_MAINTENANCE=1`.
  2. Deployed 0.41 in maintenance mode.
  3. Uploaded the last verified backup (2026-11-25 19:19 UTC, `SHA256 626a2826…223a`, matched locally and on the machine), extracted it into `/data` and restarted.
  4. Pulled the restored `/data` back: it was byte-identical to the backup; dry run 10 accounts, 9 human stables, 295 horses, 9,805 GNS, 0 problems.
  5. Unset maintenance.
- **Verified:**
  - health `0.41.0` / `c49156f` / 10 accounts / maintenance false;
  - `/`, `/play`, `/horse-3d`, the new plates and the race modules return 200;
  - exhibition without login 401; login with an unknown account 401;
  - offline demo shows a painted plate with markings.
- **Data gap:** play between 2026-11-25 19:19 UTC and the old account's shutdown exists only on the old account's volume. It can be fetched and reconciled if that account is ever reactivated.
- **Old URL:** `https://studbook.fly.dev` no longer serves the game. Players need the new address, or a custom domain later.
