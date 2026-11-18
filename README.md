# Studbook

A bloodstock breeding game. Simulated genotypes, a stallion market, seasonal racing — and one
rule that everything else follows from: **every horse is born from a mare you own and a covering
you spent.**

Live: https://lsraiva.github.io/studbook/

## Play locally

```bash
node tools/serve.mjs        # http://127.0.0.1:8080
```

No build step, no dependencies. The page is static: `index.html` + four modules + a stylesheet.

## With accounts and a server

```bash
node server/index.mjs        # game + API on http://127.0.0.1:8787
```

The server owns the rules, the seed and the save: the browser sends an action and renders the view
it gets back. Create an account and the stable follows you to any device. GitHub Pages is static,
so the live site still plays offline; see `docs/SERVER.md` to host the API and `assets/config.js`
to point the page at it.

## Work on it

```bash
node tests/engine.test.mjs      # 20 assertions: rules, market, economy, fuzz
node tools/release-gate.mjs index.html   # 6 gates against a build (local or a URL)
node tools/economy-report.mjs 120        # what the money and the herd do over 120 seasons
```

The engine is a pure module over a plain state object: no DOM, no transport, no clock. A seed
plus a list of actions reproduces a season exactly, which is what makes the suite and the
economy report possible without a browser.

## Map

```
index.html              page shell: markup, SVG symbols, one module tag
assets/engine.js        the rules: genetics, market, race, season, actions, view projection
assets/ui.js            the screen: rendering, dialogs, sound, the account gate
assets/net.js           the cloud transport (same interface as the offline socket)
assets/config.js        where the server lives
assets/styles.css       the look: tokens, type scale, motion, mobile
server/index.mjs        the authoritative server: accounts, sessions, saves, anti-cheat
Dockerfile              one-command host
tests/engine.test.mjs   20 assertions, including an 800-action fuzz
tests/server.test.mjs   23 assertions against the live API: cheats, restarts, two devices
tests/design.test.mjs   12 assertions on the look: palette, scale, motion, mobile
tools/serve.mjs         local static server
tools/release-gate.mjs  served-assets gate: hash, syntax, suite, import graph
tools/economy-report.mjs  season-by-season economy measurement
docs/                   review, design, economy
.github/workflows/ci.yml  runs the suite on every push
```

## Rules worth knowing

- **Genetics.** Six traits, two loci each, dominance varying by locus. Vigour only when the cross
  is across lineages. Inbreeding `F` is measured against the living population, not a pedigree.
- **Supply.** A mare has eight foals in a career; a stallion gives five coverings a season until
  he is ten. A covering is a frozen straw: it stays usable after the sire retires.
- **The sink.** The house buys at half appraised value, and that horse is gone — archived, out of
  the yard, no longer billed. Without it the herd grew 4·2 animals a season and only 2% were alive.
- **Money.** Upkeep is exponential in talent, so a good horse has to earn. Prizes are subsidised
  1·2× the entry fee; breeding pays in stock, not in coin; rivals get a stipend that is capped, so
  a rival is a counterparty rather than a hoarder.
- **Certification.** Traits of a horse you do not own are hidden until you pay to certify it. The
  appraisal is public; the read on its ability is not.

## Status

Version 0.4. Added: an authoritative server with accounts and cloud saves, a design pass (named
palette, type scale, entrance motion, sticky tab strip on phones, reduced motion honoured), and the
suite that proves the server refuses the cheats.

Version 0.3. Fixed in this line: stored XSS through names, free money actions, lot-type confusion
in the market, `NaN` balances that killed rival trading in season two, the missing burn, the
unpayable forced sale, prices with no ceiling, and per-game seeds.

Still open, on purpose: an authoritative server (the rules run in the browser today), on-chain
assets, and the design questions in `docs/DESIGN.md`.

## Licence

MIT — see `LICENSE`.
