# Release 0.51.0 — the attractiveness report's P0 fixes

State: **deployed** 2026-11-27 to `studbook-luann` (gru), revision `8ba13b16e72961b1608315e54b0fa71d348f1d21`. Pre-deploy backup `20261127T014802Z` (SHA256 `511b3293…f65b`, matched on the machine), restore tested: 13 accounts, 432 horses, 0 problems. Verified: public health shows only ok/version/maintenance; on the machine it still reports accounts and revision; `/termos` answers the styled 404. Source: the P2E/Web3 attractiveness framework (Studbook re-evaluated at 0.49.0, 43/100), "Próximos passos priorizados", P0.

## Fixed

1. **Digits typed into a field switched screens (critical).**
   - The 1–9 screen shortcuts fired inside text fields, so "qa-estabulo1" could not be typed and a 6-digit code could jump tabs.
   - Shortcuts now ignore inputs, textareas, selects, editable text and IME composition. Outside a field they work as before.
2. **Toasts piled up for minutes.** Server refusals and diagnostics were appended with no timer.
   - Every toast now goes through one function. The same message again is counted on the first toast ("×4") instead of stacking.
   - At most three show, oldest out. Each has a close button.
   - Lifetimes: confirmations 3 s, errors 8 s, diagnostics 30 s.
3. **"recomeçar · 2.000 ₲" did nothing online,** and answered with the clock error "a reunião fecha no relógio…", the duplicated toast in the report.
   - **Online:** a stable is permanent (accounts, horses, guineas and pedigrees are preserved), so the server now refuses it with its own reason, "No modo online o estábulo é permanente…". The Carteira card says so instead of offering the button, and a `?reset=1` link no longer tries.
   - **Offline:** the demo keeps the tool.
4. **A yard with nothing left was a dead end.** With every horse retired and no mare, the next step said "buy a horse" with no button.
   - It now names the cheapest affordable horse lot (a mare first, so racing and breeding can restart) with a button that buys it.
   - If nothing fits the balance, it says how to get there: sell a covering, or wait, since lots get cheaper each season.
   - No rule or price changed.
5. **Selling had no confirmation.** Selling to the house now takes two presses.
   - The first turns the button into "confirmar venda · ₲ X" (X is the house's actual offer, now in the view as `houseOffer`) and says so in a toast.
   - The second, within 5 s, sells. Both sell buttons (card and table) use it.
6. **`/api/health` exposed the account count and the revision.**
   - **Public answer:** `{ ok, game, cloud, version, maintenance }`.
   - **Operator fields:** accounts, revision and uptime only answer a request made on the machine itself (loopback, without the Fly edge header). After a deploy: `fly ssh console -C "wget -qO- localhost:8080/api/health"`.
7. **404 without style.**
   - An unknown page (`/termos`, any path without a file extension) now gets a page in the game's look, in Portuguese, with links back to the stable and the home page.
   - Missing files still get a short plain 404.
8. **No SIMULADO label on tokens.**
   - The tokens section now opens with a stamped "SIMULADO" banner: nothing here exists on a real blockchain, and nothing can be sold for real money.
   - Offline the section was never drawn at all; it now is.
   - Its leftover English sentences are translated.

## Not done (needs the owner)

- **Termos, Privacidade, Sobre and Contato:** these pages need the owner's contact channel, the responsible party, and what data is kept and for how long. They are not invented here.

## Tests

- `tests/p0.test.mjs`:
  - a fully retired yard is shown the cheapest affordable lot with a valid buy action, or an explanation when broke;
  - the view carries the house's offer.
- `tests/server.test.mjs`:
  - the public health has no accounts, revision or uptime, while loopback keeps them;
  - start-over is refused as `permanent`;
  - an unknown page gets the styled 404, and a missing file gets the plain one.
- `tests/browser/p0.spec.mjs`:
  - "qa-estabulo1" types fully and the screen stays put, while shortcuts work outside fields;
  - a repeated toast is counted ×4, closes, and leaves on its own;
  - selling takes two presses with the price;
  - SIMULADO shows, and offline keeps start-over;
  - the styled 404.
- The 0.46 balance-roll test now records the chip with a MutationObserver: it timed out on slow machines.
- `npm test`: 341 checks.
