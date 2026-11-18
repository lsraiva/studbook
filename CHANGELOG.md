# Changelog

## 0.4.0 — server, accounts, design

### Added
- **Authoritative server** (`server/index.mjs`): every action is judged by the same engine module,
  the browser receives a view and nothing else. Clamps the entries clock, rate limits actions,
  refuses forged bodies.
- **Accounts and cloud saves**: email + password (scrypt, per-user salt, constant-time compare),
  opaque session tokens, one atomic save per account, reachable from any device.
- **Client transport** (`assets/net.js`) with the same interface as the offline socket, plus an
  account gate in the UI; same-origin detection, `SERVER_URL`, or `?server=`.
- **Design pass**: one palette declared once, a three-step type scale, entrance motion, hovering
  cards only where a pointer exists, sticky scrolling tab strip on phones, 44px touch targets, and a
  `prefers-reduced-motion` block that switches animation off.
- Tests: `tests/server.test.mjs` (23, over HTTP, including a restart and two devices) and
  `tests/design.test.mjs` (12, on the look).
- `Dockerfile`, `docs/SERVER.md`, CI runs all three suites.

### Changed
- The page no longer starts a local socket unconditionally: it asks for a server, then for an
  account, then falls back to offline play.

## 0.3.0 — the repo
- Split the single file into `assets/engine.js` (rules), `assets/ui.js` (screen), `assets/styles.css`.
- Tests: 20 assertions, including an 800-action fuzz, run against the engine directly.
- Tools: `release-gate` (6 gates over a served build), `economy-report`, `serve`.
- CI on every push; docs for review, design and economy.

### Rules changed
- **House sale burns the horse.** It leaves the yard and is archived; a straw still resolves its sire.
- **Forced sale pays.** It credits half appraised value and takes up to three horses a season.
- **Certification buys information.** Traits of a horse you do not own are hidden until certified.
- **Prices have a ceiling** (100.000 GNS) and a floor.
- **Seeds are per game**, recorded on the state; a fixed salt still reproduces a run.
- **Breeding pays in stock**: `BREEDER_PREMIUM` 240 → 0; `PURSE_SUBSIDY` 3.0 → 1.2; rivals capped at 3.000.
- One onboarding for every door: taking a seat gives the same starting mare as a fresh game.
- Reduced motion is honoured: no race animation, no waiting for the off.

### Fixed
- Stored XSS through stable and horse names (12 render sites).
- Free money: `addCoins` and `testGrant` refused, in validation and in apply.
- Lot-type confusion: a horse lot can no longer travel down the covering path.
- `NaN` balances from season 2, which silently killed every rival buyer.
- `splice(-1, 1)` on a missing lot silently ate the last one.
- Save quota failure is reported instead of silently falling back to memory.

## 0.2.0 — P0

- HTML escaping, no free coins, lot kind guards, rival `NaN` fix.

## 0.1.0 — first publication

- Single-file build: genetics, market, racing, season turnover.
