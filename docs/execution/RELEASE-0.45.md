# Release 0.45.0 — the landing hero, alive

State: **in review**, not deployed.

## Changes

- **Hero loop:** the welcome page's hero is now a short, silent, seamless loop of the same morning: the bay in the mist, mane and tail in the breeze, mist drifting, light through the trees. It was generated from `hero-wide.webp` as both first and last frame, so it matches the still, which stays as its poster.
  - It fades in over the still once it is actually playing, so nothing jumps while it loads.
  - It loads only on screens wider than 620 px. It is skipped under reduced motion, with data saver on, and on 2G connections. Those visitors keep the still, and no video is fetched.
  - It pauses when scrolled away or when the tab is hidden.
  - Files: `assets/art/hero-loop.webm` (VP9, for Chrome, Edge and Firefox) and `assets/art/hero-loop.mp4` (H.264, for Safari).
  - Generated with MAGI-2 on Higgsfield (64 credits in all, two takes plus a Seedance draft for comparison). The last second is blended into the first so the wrap is seamless. Files: 1.9 MB H.264 and 0.6 MB VP9, recorded in `assets/art/NOTICE-generated.md`.
  - The hero now frames the picture at 68% across, still and video alike, so the whole horse fits on common desktop shapes; before, the tail was cut at 16:10.
- **Social preview:** `og:image` pointed at the old `studbook.fly.dev`, which no longer serves anything; it now uses `studbook-luann.fly.dev`.
- **Byte ranges:** static files now answer `Range: bytes=` requests with 206, `content-range` and `accept-ranges`, in production and the local preview server alike (`sendAsset` in `server/public-files.mjs`). Safari will not play a video without them. Unsatisfiable ranges get 416.
- `mp4` and `webm` are allowed in `assets/art/` with the right MIME types.

## Tests

- `tests/server.test.mjs`: a ranged request returns 206 with the right bytes; a suffix range works; a range past the end gets 416; whole files advertise ranges; the loop is public as `video/mp4`.
- `tests/browser/landing-video.spec.mjs`:
  - on desktop the loop plays and the still gives way;
  - both files are served in byte ranges;
  - phones and reduced motion fetch no video at all.
