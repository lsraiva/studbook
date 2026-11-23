# F1-03 — durable room transfer bridge

## Implemented, not deployed

`POST /api/room/join` now uses the preservation planner instead of deleting the old stable and creating starter stock. Existing horse IDs, genomes, balance, coverings and stable history move together; referenced sires/ancestors remain resolvable as non-owned history. Horse mint origin is recorded so moving rooms does not change its nullifier.

Supported transfer: same season/meeting, open deadlines, no active race entry, pregnancy, market commitment or wallet/token requiring reconciliation. Unsafe requests return a refusal without changing either room. Same-room requests are idempotent. These restrictions are deliberate, not a claim that every possible transfer is supported.

## Commit and recovery

This is a **single-writer JSON bridge**, not a replacement for transactional Postgres.

1. Lock source and destination in the one server process.
2. Validate membership, versions, calendar, asset identities and availability.
3. Build both new room snapshots without mutating live state.
4. Write a committed record to `DATA_DIR/room-transfers/` using a unique temp file, file sync, rename and directory sync.
5. Publish both room states synchronously in memory.
6. Materialize both room JSON projections; wait for both writes to settle before releasing locks.

The journal is the commit point. If a projection fails, the transfer remains committed, the API reports recovery required, and new writes are paused. An uncertain journal error also pauses writes; do not retry financial operations blindly. At startup, committed journals repair absent/older projections before rebuilding membership and accepting traffic. Newer versions are never overwritten; invalid journals or conflicting memberships fail closed.

Per-file writes are queued to prevent same-temp-file races. Tick, actions, cross-room buying and mint/wallet mutations respect transfer locks. Empty source rooms remain as archived history and are not ticked or advertised as active markets/rankings.

## Tests

- API: two concurrent join requests, unchanged balance/horse/genome/covering, stable mint nullifier and real process restart.
- Storage: interrupted before journal, interrupted after journal before publish, one projection fails, replay idempotency, newer-version protection, queued writes, invalid journal and backup inclusion.
- Planner: existing preservation/refusal tests remain.

Fault injection is an internal test callback, not an HTTP/environment-controlled production crash feature.

## Operational limits and rollback

- Exactly one application writer per data directory. In-memory locks are not distributed locks. Do not horizontally scale this design; use the planned Postgres migration first.
- Retain the committed journal. The backup tool now includes `room-transfers` as authoritative data. A consistent backup still requires paused writers or a consistent snapshot; this code change does not prove external backup/restore readiness.
- No automatic journal compaction is enabled. Define retention/migration before broader deployment.
- Do not downgrade to a server that ignores the journal or mint origin after new transfers have occurred. Reconcile and use a forward fix or tested compatible migration.
- Already-minted/pending NFT transfer and the general mint ledger persistence gap remain blocked/future work; this does not implement blockchain ownership reconciliation.
- This batch does not make cross-room sales transactional. That remains F2 work.
- Production deployment still requires approved backup/restore and review. No deployment was performed for this implementation.
