# Design

The game is a genetics game with a market. The NFT is not the idea — the idea is that **the genome
is finite, public and deterministic**, so scarcity and proof fall out of the rules instead of being
bolted on. If the design works, nobody has to say "NFT": they buy a mare, cross her, race the foal
and one day sell the mother to the house.

## Loop

Five verbs: **buy** at the ring, **cover** a mare, **race** three meetings a season, **sell** a
horse or a covering, **survive** the upkeep. Three horizons keep it alive: a season (~10 minutes),
a generation (~5 seasons), a line (~20 seasons, when a stallion becomes a name and his straws get
expensive).

## What carries to an asset

| On-chain | Off-chain |
|---|---|
| `genome` — 12 loci × 2 alleles × 2 bits = **48 bits**, so one `uint64` | `value`, `stakes`, `F`, `upkeep` — all depend on the living population |
| lineage, sex, born season, starts/wins | the market, the season clock, the rival stables |
| cobertura as `ERC-1155` with its vintage | prices, rake, orders |

The phenotype is **derived on read** by the same formula the engine uses, so an asset needs no
metadata server: the animal is the number.

## Decisions taken

1. **Horse `721` + covering `1155`.** The horse is the collection; the covering is the flow — five
   units per stallion per season, each with a vintage. Without the covering the market has no
   turnover and the 5% rake collects nothing.
2. **Server authoritative, chain as registry.** The rules already have the right shape
   (`validateAction` → `applyAction` → `viewFor`). The chain records birth, death and ownership.
3. **GNS stays off-chain.** It has three real uses. Tokenising it now invites an APY that would
   outlive the game.
4. **Burn on the house sale.** The sink already exists in the fiction; it just had to be read as
   one. Half appraised value is the price floor.
5. **Commit-reveal per season.** Today one global RNG stream is predictable to whoever is playing.
   `HMAC(seed, season, meeting, counter)` keeps the replay auditable and the next roll unguessable.

## Roadmap

| Phase | Deliverable | Done when |
|---|---|---|
| 0 | trusted base | suite green, no free money, no XSS, sink in place (**done**) |
| 1 | off-chain asset ledger | a season closes with sources = sinks and herd size flat |
| 2 | on-chain anchor | every live horse has a token; zero drift between server and chain over 20 seasons |
| 3 | market, proof, retention | rake and royalty measured; public race receipts; external audit before an open mint |

## Not in scope

Primary sale of horses, egg packs, allowlists as a mechanic, staking APY, a governance token before
there is anything to govern, and "legendary" horses outside the breeding rules.
