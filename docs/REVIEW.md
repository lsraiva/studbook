# Code review — findings and status

Base: `index.html`, single file, 5.784 lines, commit `9b96471`. Reviewed by reading it whole and by
running the extracted engine in Node: 400 seasons, 4.000 random valid actions, plus directed tests
on the suspicious paths.

| ID | Severity | Finding | Status |
|---|---|---|---|
| A0 | critical | Rivals' balances became `NaN` in season 2 — the upkeep bill landed on newborn foals before `scorePopulation` had priced them, so the market lost every buyer | **fixed** (0.2) |
| A1 | critical | Stored XSS: names went into `innerHTML` unescaped in 12 places | **fixed** (0.2) |
| A2 | critical | Free money: `addCoins` credited packs with no payment, `testGrant` credited 50.000 GNS, and the wants board accepted `NaN` balances as payment | **fixed** (0.2) |
| A3 | critical | No authority: the "server" is the browser (`LocalSocket`), `connectWallet` returns `{authorised: true}` | **open** — architecture |
| A4 | high | Save is editable JSON in `localStorage`, no signature or provenance | **open** — needs A3 |
| B1 | high | `unlistStraw` accepted a horse lot: horse stuck unowned, `undefined` in the barn | **fixed** (0.2) |
| B2 | high | Certification sold information already on screen (`traits` were public, and traits determine the score) | **fixed** (0.3) |
| B3 | medium | Every new game was the same game: seed came from the player id alone | **fixed** (0.3) |
| B4 | medium | No sink: sold and retired horses stayed in state forever — 1.086 horses, 27 alive at season 301 | **fixed** (0.3) |
| B5 | medium | A broke player with one horse had no way out | **fixed in part** (a retired last horse can now be sold) |
| B6 | medium | Forced sale credited nothing and ran once a season | **fixed** (0.3) |
| B7 | medium | `splice(findIndex(...), 1)` with a missing id ate the last lot | **fixed** (0.2) |
| B8 | low | Prices had no ceiling: `1e308` ended in `Infinity` in the save | **fixed** (0.3) |
| B9 | low | Taking a seat gave five horses; a fresh game gave one | **fixed** (0.3) |
| C1 | low | `localPlayerId` duplicated `playerId`, `isGameOver` was dead, `firsts.foal` was off by one season | **fixed** (0.3) |
| D1 | low | No `prefers-reduced-motion` | **fixed** (0.3) |

## What was good and stayed

Deterministic PRNG with the roll kept in state; `viewFor` as an information boundary; the breeding
caps as a supply policy written before there was a token; the market's three mechanisms (5% rake,
Dutch decay, a wants board); and the finish of the screen work — focus restored on dialog close,
`aria-live`, `role="meter"`, synthesised sound with no assets.

## How the numbers were produced

The engine has no DOM: slice it out of the page, import it, and it runs in Node. Every claim in
`docs/ECONOMY.md` comes from that harness, and `tools/economy-report.mjs` reproduces it.
