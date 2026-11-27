# Release 0.59.0 — "Enquanto você esteve fora"

State: **in review**, not deployed.

## Changes

- **The recap** (`assets/recap.js`): an online stable runs its meetings on the clock whether or not its owner is looking. Coming back now opens a card that says what happened:
  - how much time went by, in the game ("1 temporada e 2 reuniões se passaram") and on the clock ("Você ficou 5 horas longe do haras");
  - the best moment first: the horse that won or placed, painted in its coat, with what it did and what it earned, and a "Compartilhar cartão" button;
  - four tiles: corridas, vitórias, prêmios and the change in the balance (green or red);
  - lines for foals born (named), horses that arrived, retired or left, and a nudge when none of the player's horses ran.
- **How it knows.** While the page is visible, a small snapshot of what the player saw is kept in this browser (season, meeting, balance, each horse's record). On the next visit the recap is the difference between that snapshot and the stable now. Nothing is stored on the server, and nothing is invented.
- **When it shows.** Once per visit, when at least one meeting was run and ten minutes or more went by. A background tab brought back to the front is checked again. A birth being staged, or a race being watched, has the floor first.
- **When it does not.** A first visit, a short absence, or the offline demo (which has no clock) show nothing.

## Tests

- `tests/recap.test.mjs`, 10 checks, on real game states (`npm test`: 413 checks in all):
  - no recap without an earlier visit or without a meeting run;
  - six meetings are one season and two meetings;
  - races, wins, prizes and the balance are the differences in the horses' own records and the bank;
  - a foal born meanwhile is named;
  - retirement, departure and arrival are told apart;
  - the time away is said as minutes, hours or days.
- `tests/browser/recap.spec.mjs`:
  - back after five hours, the recap shows the right span, tiles and star horse (painted), closes, and does not come back on reload;
  - two minutes away shows nothing;
  - it fits a phone.
