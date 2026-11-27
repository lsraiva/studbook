# Release 0.56.0 — official results decided by the race

State: **deployed** 2026-11-27 to `studbook-luann` (gru), revision `223b40a0ffe0f2b86f344a28fb14e58d0a91dc10`. Pre-deploy backup `20261127T131322Z` (SHA256 `c79be4e8…53be`, matched on the machine), restore tested: 13 accounts, 447 horses, 0 problems. Verified on the machine two minutes after the deploy: `STUDBOOK_RACE_ENGINE=causal`; all 12 rooms switched and each decided its last race by the causal engine; no invalid balance; health answers in 0.2–0.3 s; 127 MB of memory available.

## The switch

`fly.toml` sets `STUDBOOK_RACE_ENGINE = 'causal'`. From its next meeting, every room decides places, prizes, wins and records by the causal race (`params/2`) instead of the form score. Authorised by the owner on 2026-11-27.

- **What changes for players:** races are open. The favourite's chance falls from about 82% to about 50% on average; no field has a near-certain winner; the instruction (atacar, manter, poupar) now changes results; the odds in the field are the causal race's own.
- **What does not change:** accounts, horses, guineas, genetics and pedigrees. Past results stay as they were; each result records how it was decided. Prize money, entry fees and the calendar are the same.
- **Each room's diary says so once:** "A partir da reunião N da temporada M, os resultados oficiais são decididos pela própria corrida…".
- **Rollback:** set the variable to `'legacy'` and deploy. Removing the line does not switch rooms back, because a room remembers its engine.

## Loss notes speak the race

In a room decided by the race, the note for a beaten runner no longer names a trait from the form score. It says what happened in the race, from the engine's own counts:

- "tropeçou uma vez" / "tropeçou N vezes";
- "ficou encaixotado por 3,2 s";
- "ficou sem fôlego antes da chegada" (and, when the instruction was atacar, "atacar gastou cedo demais");
- "chegou com fôlego sobrando" (and, when the instruction was poupar, "poupar segurou demais");
- "foi superado no dia".

The gap is in seconds behind the winner.

## Still in the old language

- The **value**, the **"× o campo" form bar** and the **going fit** on a horse's card come from the form score. They still describe breeding quality, but they no longer decide a race. The odds are the number to read before a race.

## Pre-switch probe

The restored production copy was run with the flag on, exactly as the server does on the clock: 12 rooms, 8 meetings each.

- 96 of 96 meetings were decided by the causal race, with no error; places and balances stayed valid.
- The switch was logged once per room.
- Slowest meeting: 35 ms. Slowest view: 475 ms (the first view of a new field computes its odds from 24 simulated races; later views of the same field are cached).

## Tests

- `tests/official-race.test.mjs`: a causal room explains a loss by what happened in the race, never by the form score's traits, and in Portuguese on screen.
- `npm test`: 400 checks.
