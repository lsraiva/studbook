# Economy

Everything here is measured, not asserted: `node tools/economy-report.mjs 120` reproduces the
tables. A passive player advances three meetings a season and touches nothing else, which is the
worst case for a sink and the honest case for supply.

## Before and after the rebalance

| | v0.2 (patched, unbalanced) | v0.3 |
|---|---|---|
| Money in the system | **+1.100 GNS per season** | **−1,2 GNS per season** |
| Herd in training | 27–32, but 97% of the archive was dead weight | 31–32 |
| Horses leaving the yard | never | ~5 a season, burnt to a compact archive |
| Rival balances | `NaN` from season 2 | capped at 3.000, still trading |
| Save after 120 seasons | 446 KB | 311 KB |

## v0.3, season by season

```
season  money  rivals  alive  burnt  lots  save KB
    20   10199    8415     32      84      92      86
    40    9789    8005     32     199      88     134
    60    9941    8157     31     301      94     179
    80   10002    8218     32     408      88     220
   100    9804    8020     31     515      92     265
   120    9692    7908     31     623      93     311
```

Money drifts −1,2 a season over 80 seasons: the economy is closed, which is the whole point.
The archive keeps growing (the burnt record of every horse that left) — that is the price of a
straw still resolving its sire after he is gone. It is ~150 bytes a horse.

## The four levers

| Lever | Value | Why |
|---|---|---|
| `UPKEEP_BASE` 5 + `UPKEEP_TALENT` 1,1 × talent^1,55 | steep in talent | a good horse must earn; a yard of average horses must not be free |
| `ENTRY_FEE` 15 × `PURSE_SUBSIDY` 1,2 | pot = 18 per runner | the house subsidises a fifth of the purse, not three times the fee |
| `BREEDER_PREMIUM` 0 | none | a foal is stock with a price; paying coin as well minted money twice |
| `AI_STIPEND` 280, `AI_TREASURY_CAP` 3.000 | capped | a rival with 130k sits out the market and stops being a counterparty |
| `HOUSE_HORSE_FLOOR` 0,5 | half appraised | the price floor, and the only sink for horses |

## Known tension

The straw market carries ~90 lots permanently, because every stallion produces five straws a
season and only three rivals buy two each. That is depth, not a bug — but it means the straw is a
buyer's market unless a stallion is elite. Watch it if you tune supply.

## After the global market (0.19.0)

The catalogue now spans rooms and a horse can be sold from one to another, so the measurement had to
be repeated. It holds:

```
season  money  rivals  alive  burnt  lots  save KB
    20   10163    8388     30      84      87      87
    40    9906    8131     31     192      68     129
    60    9621    7846     30     286      95     174
    80    9878    8103     31     394      91     218

money drift over 40 seasons: -28 GNS (-0.7/season) · alive 31 → 31
```

Why it holds, in one sentence: **the cross-room sale is the same trade as the in-room sale**. The
buyer pays the full price, the seller receives it less the 5% rake, and the rake is not credited to
anyone — so every sale is a small sink, exactly as it already was inside a room. Moving an animal
between rooms moves money *between* stables, not into the world; the total across rooms is unchanged
apart from the rake.

Two things this does not cover, and should be measured when they land:

- **promotion and relegation** — a stable changing division carries its bank with it; the effect is
  per-division, not global, but it can concentrate money in the top division over seasons.
- **the on-chain layer** — a token sale for real value would introduce a second price for the same
  horse, and that is the one change that can genuinely break this measurement.
