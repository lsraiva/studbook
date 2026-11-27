# Release 0.60.0 — the stable album and the achievements

State: **deployed** 2026-11-27 to `studbook-luann` (gru), revision `a3260037282adb118b7fd30792b1608ca0219287`. Pre-deploy backup `20261127T211223Z` (SHA256 `2270f880…ecd0`, matched on the machine), restore tested: 13 accounts, 467 horses, 0 problems. Pre-deploy probe on the restored copy: 12 rooms, largest album 16 horses (1.3 KB), most foals bred 15, deepest line 4 generations.

## Changes

- **Stable album** (Ranking screen): eight coats by four face markings, thirty-two places.
  - A place is filled by the first horse of the yard to wear that combination: one it bred, at any time, or one it holds now. A horse bred here takes the place over one merely bought, and is marked with a brass dot.
  - A filled place shows the horse painted in its own coat, its name and its marking. An empty one is a silhouette with a question mark.
  - A home-bred horse that was sold or lost keeps its place: it is read from the state's record of departed horses.
- **Achievements:** eleven, with a seal when reached and a progress bar otherwise.
  - Firsts: first win, first foal, first sale, a stakes horse.
  - Breeding: breeder (5 foals), a yard of tradition (15), second generation, three generations of one line.
  - Album: every coat (8), half the album (16), the whole album (32).
- **No new saved data.** The view gains three read-only fields computed from what the state already keeps: `stable.album` (id, lineage and name per horse), `stable.bredCount` and `stable.generations`. Nothing is migrated.

## Found on the way (not fixed here)

- **The engine's "first foal" mark is never set.** It is looked for at the season boundary before the newborns exist, so `firsts.foal` stays empty and the "first foal" celebration never fires. The album's "primeiro potro" is counted from the foals actually bred instead. Fixing the mark itself would announce a "first foal" to yards that have bred dozens, so it needs its own change.
- In the birth scene of a very young dam, the dam is drawn with the foal plate (seen in a test yard that breeds yearlings).

## Tests

- `tests/album.test.mjs`, 7 checks on a yard played for nine seasons as a breeder:
  - a new yard's album holds its one horse;
  - every foal bred is counted and every bred or held horse is in the album;
  - a row carries only id, lineage, name, bred and here;
  - breeding from a home-bred mare makes a second generation;
  - a home-bred horse sold to the house keeps its place.
- `tests/browser/album.spec.mjs`:
  - 32 places, the filled ones painted and counted, the coat rows in Portuguese, eleven achievements with the right ones reached and no English;
  - a new yard has one place filled and the album fits a phone.
