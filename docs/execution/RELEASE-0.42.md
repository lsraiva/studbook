# Release 0.42.0 — the race as a broadcast (side view)

State: **in review**, not deployed.

## Change

The live race now opens in a side-on "broadcast" camera, `assets/race/side-scene.js`. It extends the aerial `RaceScene`, so it keeps the same engine data, order board, race calls, sound, controls and result:
- **Painted world:** a grandstand at golden hour (generated with Higgsfield) drifts in parallax behind the course, with its painted fence laid exactly on the far rail. On the course: mown turf, faint lane lines, distance poles, the finishing post, and a near rail that rushes past faster than the field.
- **Animated runners:** an 8-frame painted gallop cycle (generated with Higgsfield), advanced by the ground each horse covers, so a faster horse strides faster. At load, each runner is repainted in its own coat (the same remap as the portraits) and its stable's silks (the white silks and saddle cloth are tinted).
- **Depth:** lanes become depth; far lanes sit higher and smaller, near horses pass in front, and numbers are drawn on top so a horse hidden in the pack is still identified.
- **Camera:** follows the leader exactly, using the interpolated engine positions. The zoom frames the top three, closer on phones. After the leader finishes, it holds on the post to show the rest crossing.
- **Effects:** turf kicked up behind the field, and a photo-finish flash at the line.
- **Cost:** about 0.5 ms of drawing per frame. The scaled grandstand is cached, so each frame only copies it.

## Assets

- `race-gallop.webp` (339 KB) and `race-grandstand.webp` (340 KB), loaded only when a race is opened.
- Recorded in `assets/art/NOTICE-generated.md`; 4 Higgsfield credits.

## Tests

- New browser case: the broadcast view loads; every runner has 8 painted frames; the canvas is a painting, not a flat fill; the result matches the engine winner.
- The existing live-race cases still pass on the new view: board, result, sound switch, Escape, phone fit, reduced motion and race-card entry.
