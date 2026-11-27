# Release 0.53.0 — ride the live race

State: **deployed** 2026-11-27 to `studbook-luann` (gru), revision `de89c6fd07f1a2b390e6ee31246ebd835d45a109`. Pre-deploy backup `20261127T024852Z`, restore tested: 13 accounts, 448 horses, 0 problems. Verified: the ride endpoint answers 401 without a session.

## Changes

- **Jockey orders in the live race.** When one of the player's own runners is in the exhibition, the live race shows the reins:
  - five orders: "← Por dentro", "Poupar" (A), "Ritmo" (S), "Arrancar" (D), "Por fora →" (arrow keys for the lanes);
  - a "Fôlego" gauge with the ridden horse's energy, red when low;
  - the stable's own riding style rides the horse until the first order ("Piloto automático"); from then on the player alone does ("Você está montando").
- **How an order works.** The causal engine is deterministic, so each order re-runs the same race with the rider's orders so far. Everything already shown stays exactly as it was, and only what follows the order changes. An order takes effect about a third of a second ahead of the picture, so the answer arrives unseen.
- **The engine's rules apply.** Orders have cooldowns (4 s after a kick, 1 s otherwise), a kick needs energy, and a lane change needs room. A refused order says why on its own button ("aguarde", "sem fôlego", "sem espaço", "na cerca").
- **The result compares the ride with the autopilot:** "Você levou X ao 2.º lugar · o piloto automático chegaria em 4.º: você montou melhor", with a "Montar de novo" button that restarts the same race from the gate.
- **A ridden race plays slower** (1.1× to 2.2× instead of up to 4×), so there is time to decide.
- **Where the race runs.**
  - Online: `GET /api/race/exhibition` now also returns a ride session, and `POST /api/race/ride` re-runs it. The field with its traits stays in the server's memory for 15 minutes; only positions, the ridden horse's energy and the receipts are sent.
  - Offline: the browser re-runs it, since it already owns the save.
- **Limits.** Only the caller's own runner can be ridden, orders are validated and capped at 120 per ride, and rides are rate-limited to 90 orders a minute.

## What it does not do

- **It is still an exhibition.** A ride changes no result, money or record. Official meetings online run on the clock with nobody present, so a live ride cannot decide them without a new format (scheduled live meetings). That is a product decision for later.
- **One runner.** With several of your runners in the field, you ride the first; choosing among them is not built yet.
- **Reduced motion** shows the result at once, so there is nothing to ride.

## Tests

- `tests/ride.test.mjs`, 15 checks:
  - watching is unchanged, to the hash;
  - riding with no order equals the autopilot;
  - frames before an order are identical;
  - orders are receipted and deterministic;
  - holding from the gate does not beat the autopilot;
  - a cooldown refusal carries its reason;
  - another stable's runner is refused;
  - bad orders are dropped and capped;
  - no trait leaves a ridden race.
- `tests/server.test.mjs`:
  - the session, the 401, a receipted re-run, and no traits in the answer;
  - a rival's runner and a stale session are refused;
  - riding writes nothing.
- `tests/browser/ride.spec.mjs`:
  - the reins appear, an order changes the race and is marked active, and the D key kicks;
  - the result compares with the autopilot, and "Montar de novo" resets;
  - no reins without a runner of your own;
  - the reins fit a phone with 44 px buttons.
