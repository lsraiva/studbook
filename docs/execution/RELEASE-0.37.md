# Release 0.37.0 — live race (exhibition)

State: **in review**, not deployed.

## What it is

A button in **Corridas** opens the next meeting's declared field running live on a full-screen racecourse.

- **Driven by the causal engine (F4):** every position comes from its frames (4 per second, interpolated on screen). Nothing is scripted toward a known result.
- **Exhibition only:** official meetings are still decided by `assets/engine.js` until the league/live format decision (F0-02). The race says so on screen and changes no result, balance or record.

## Pieces

| File | Role |
|---|---|
| `assets/race/track.js` | One left-handed oval shared by engine and picture. Finish at the end of the home straight. Bend sections for the engine; drawing coordinates for the scene. Bend radius and lane width equal the engine's. |
| `assets/race/exhibition.js` | Builds the race from the declared field. Tactics become bot styles (push → front-runner, steady → stalker, hold → closer). Returns names, stables, coat colours and positions only; no traits; anonymous runner keys. |
| `assets/race/scene.js` | Canvas renderer, plus all the moments on screen (next rows). |
| `GET /api/race/exhibition` | Online: the server simulates it (genotypes stay on the server), with a fresh seed each call. Signed-in, rate-limited, writes nothing. Offline: the same module runs in the tab on the local save. |

What `scene.js` puts on screen:

- **Horses and course:** coat-coloured horses, stable silks and saddle-cloth numbers; your runners ringed in gold; rails, mown bands, distance poles and the finishing post.
- **Camera:** follows the leaders, with look-ahead in the running direction; closer framing on phones.
- **Live information:** an order board (lengths while running, time gaps after the post), the clock, the metres to go and race calls (new leader, home straight, last 200 m).
- **Finish:** the last furlong slows down, then the result appears.
- **Controls:** pause, 2×, skip to the finish, close; Escape also closes.
- **Accessibility and cost:** reduced motion shows the finish and result at once; 30 fps cap; only visible course segments are drawn; no backdrop blur over the canvas.

## Tests

- `tests/race-scene.test.mjs` (10 cases):
  - course and engine constants agree;
  - every distance finishes on the post;
  - the rail is continuous;
  - drawn bends and the engine's bends agree on more than 99.5% of metres;
  - the exhibition runs exactly the declared field, leaks no trait, is deterministic per seed and needs two runners.
- Server: needs an account; returns a race; sends no genotype; writes nothing.
- `tests/browser/live-race.spec.mjs`:
  - the race plays and ends on the engine's winner, with the board, the podium and the exhibition notice;
  - fits a phone; closes with Escape;
  - reduced motion shows the result at once.

## Known limits

- **Drawing:** horses are stylised top-down shapes, not the 3D model. A side-on or 3D race is F5, after the horse art decision (F3).
- **Not yet in the scene:** sound and commentary voice.
- **Performance:** measured at 0.8 ms of drawing per frame on a desktop. Not yet measured on physical phones.
