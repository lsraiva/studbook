# Release 0.61.0 — causal odds in instalments

State: **in review**, not deployed.

## The problem

Since 0.56 the odds of a causal room come from 24 simulated races. They were all run inside the first view of a new field, so that one request took up to 1.8 s on the restored production data, and the server (one thread) answered nobody else meanwhile.

## The change

- **`fieldOdds` works in instalments for causal rooms.** Each request for a view runs at most two more races and answers with the odds so far, marked `pending` until all 24 are in.
  - The seeds are drawn in the same order whatever the instalments, so the finished odds are exactly those of a single run.
  - `peek: true` reads the odds so far without doing any work; `complete: true` finishes at once (tests, tools, experiments).
  - The form score (legacy rooms) is cheap and is still run whole.
- **The view says so:** `oddsPending` is true while the odds are being worked out.
- **The page finishes the job by itself.** While the odds are pending it asks for the view again every 0.9 s (one timer, stopped while the tab is hidden). A note under the field says "primeiras cotações: ainda em cálculo, ficam mais precisas em alguns segundos" and goes away when they are whole.

## Measured on the restored production copy (12 rooms, three meetings each)

| | before | after |
|---|---|---|
| slowest view | 1,774 ms | 98 ms |
| average view | not measured | 29 ms |
| views until the odds are whole | 1 | 12 (about 10 s on screen) |

## Bug caught while building this

- The refresh first used a bare `join` message, which wipes the offline player's id and broke the game after the first refinement. The browser tests caught it; the refresh now sends the same join the page opens with.

## Tests

- `tests/odds.test.mjs`: the first causal odds come from two races and are pending; peeking does no work; one instalment per view; asking again finishes them and they stop changing; the finished odds equal a single run; `complete: true` finishes at once; legacy odds are whole at once.
- `tests/browser/odds.spec.mjs`: with `?engine=causal` the pending note goes away by itself within seconds and every runner stays priced.
- `npm test`: 427 checks.
