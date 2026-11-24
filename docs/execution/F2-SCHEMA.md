# F2-01 — schema, global keys and invariants

State: **review** on `feat/f1-f2-foundations-20261124`. Nothing here is applied to production. No database was provisioned; F2-02 (Postgres staging) still needs provider, region and budget approval.

## What exists

| Piece | File | Role |
|---|---|---|
| Global keys | `server/domain/ids.mjs` | Deterministic UUIDv5 per entity, so importing the same JSON twice yields the same keys |
| Ledger contract + mock adapter | `server/domain/ledger.mjs` | Double-entry GNS, idempotent posting, audit; the interface the Postgres adapter must satisfy |
| Import planner | `server/domain/import-plan.mjs` | Maps `users.json` + `rooms/*.json` to rows and opening ledger entries, checks invariants, writes nothing |
| Dry-run CLI | `tools/import-dry-run.mjs <dir>` | Prints counts/problems/warnings; run only on a restored copy |
| SQL draft | `db/schema.sql` | Tables, uniqueness, CHECKs and triggers mirroring the same rules |
| Tests | `tests/ledger.test.mjs` | Synthetic data only, including RFC 4122 vector |

The live server is unchanged by F2-01: balances still live in room JSON.

## Decisions

1. **Identity.** `account = v5("account:"+userId)`, `stable = v5("stable:"+userId)` (a stable follows its account across room transfers), house yards are per room, and `horse = v5("horse:"+originRoomId+":"+localId)` — the same identity basis as the mint nullifier, so transfers never change a horse key.
2. **Money** is whole guineas in `bigint`. Every change is a balanced ledger entry; house accounts `treasury` (issuance), `fees` (5% rake) and `sink` (spending) may go negative, stables may not.
3. **Idempotency.** Each entry carries a unique key and a body fingerprint: replay returns the original entry, a different body with the same key is a conflict.
4. **Append-only.** Corrections are reversing entries; SQL triggers forbid UPDATE/DELETE.
5. **Genetics and pedigree are immutable** after insert (trigger). `breeder_stable_id` is fixed at foaling; pre-F2 horses import with NULL because the breeder was never recorded — no value is invented.
6. **Outbox** table for mail, mint intents and chain calls, written in the same transaction as the state change.

## Invariants checked by the import

- G1 one human stable per account across rooms
- G2 each live horse has exactly one owner, keys globally unique
- G3 stable horse lists and horse owners agree
- G4 opening ledger balance = current guineas, whole and ≥ 0
- G5 pedigree parents resolve to a live or archived horse (missing ones are warnings: founders/pre-archive)
- G6 human stables belong to known accounts
- Accounts without a stable (one exists in production) are reported, never recreated.

Validated against data produced by the real server (3 accounts, 12 stables, 74 horses after several meetings): zero problems.

## Next (gated)

1. Restore the encrypted backup in an isolated directory and run the dry run on it; record only the summary (counts/problems), never rows or emails.
2. F2-02: approve provider/region/budget → staging Postgres → apply `db/schema.sql` → Postgres adapter passing the same ledger tests.
3. F2-03: route market sales, prizes and purchases through the ledger in shadow mode (compare with room JSON) before cut-over.
4. Single-writer journal stays until the Postgres path is the source of truth; no horizontal scaling before that.
