# Studbook 3D — execution status

Updated: 2026-11-23. This document records implemented work, not future promises.

## Scope and safety

The owner authorized beginning work with temporary access. This batch is on `fix/foundation-gates-20261123`, separate from main. No production deploy, schema migration, asset generation, new paid resource or blockchain transaction is part of this batch. Credentials are not stored in this repository or these documents.

## Baseline and read-only inventory

- Repository baseline: `0bad83c0e3a0bc7f79d4b0fedef485ad74796b79` (0.31.0).
- Fly application `studbook`, region `ams`, one shared CPU, 256 MB memory, encrypted 1 GB volume mounted at `/data`, release 12 at inspection.
- The machine was stopped during the first inventory read; the normal public HTTP health request subsequently returned 200/cloud=true. No manual start or deploy was issued.
- Public production `assets/engine.js` matched the repository baseline; `index.html` and `assets/ui.js` did not. Their hashes matched older revisions including `3e9a8cc06702615c5e6126f62e0e502f02112566`. This identifies frontend drift, not the exact backend commit of the running image.
- Consequently, main and the deployed application must not be assumed identical. Any eventual deploy requires explicit change review and a verified backup/restore.

## This batch

| Task | State | Evidence |
|---|---|---|
| F0-01 current/deployed inventory | review / partial | GitHub HEAD and Fly release/image/config read; precise backend source revision is not labeled |
| F0-03 infrastructure inventory | partial | machine/region/volume known; backup contents, secret inventory and restoration not verified |
| F0-06 baseline and CI | review | clean branch, lockfile install, functional/browser/contract CI configured |
| F1-01 one click / one meeting | review | regression failed before fix; exact advancement and season rollover pass in jsdom and Chromium |
| F1-02 online clock authority | review | all client advance/openWindow/closeWindow/startOver actions rejected; scheduler still passes two-player tests |
| F1-04 public file boundary | review | shared allowlist, malformed-path/symlink/private-file tests, correct image MIME and HEAD support |
| F1-05 responsive overflow | review | nine fresh-state screens tested at 360/390/430/1440 px; portrait touch viewport remains 390 px |

`review` means implemented and tested in this branch; it does not mean merged or deployed. Cloud populated-wallet layouts and physical-device performance remain separate QA work.

## Changes

1. Removed the duplicate direct Run listener, retaining one guarded delegated handler. The UI test now requires exactly one meeting instead of merely detecting any change. Added season-rollover and disabled-control cases.
2. Rejected all four public actions that could resolve, arm or reset a meeting online. Removed obsolete server clock-clamping code and hid manual-window UI for cloud rooms. Offline timed play is retained.
3. Added `server/public-files.mjs`, a shared explicit public-asset allowlist. Private source/data/dotfiles, traversal, malformed URI paths and allowed-looking symlinks are refused. Both production and the local preview server use it. The local server binds to loopback.
4. Fixed min-content growth of nested grid panels; filters recompose on mobile; tab bar no longer adds negative-margin page overflow; rankings scroll internally and have keyboard access.
5. Added Playwright regressions and reproducible CI using npm ci. Browser screenshots/traces on failure are artifacts, not committed source. Extended gitignore to exclude local data, secrets and test output.

## Tests

Before fixes: the new exact-click check failed (meeting 1 became 3), public-path checks failed, and legacy online clock commands were accepted. These failures were observed in isolated local tests.

After fixes:
- `npm test`: 205 assertions passed, zero failures.
- `npm run test:browser`: 6 tests passed, including all nine screens at four viewport widths, one-click rollover and mobile touch.
- `npm run contracts`: successful compilation; this is not an EVM security audit.
- `git diff --check`: clean.
- Changed-file credential scan: no token/private-key patterns found.

Reproduce browser tests with `npm ci`, `npx playwright install chromium`, then `npm run test:browser`. Tests start an isolated local preview server and create no production users.

## F1-03 incremental preparation

Added a pure `planRoomTransfer` module and 13 focused cases. It prepares the same balance, horse IDs/genomes, coverings, stable history and referenced sire/ancestor data without mutating either room. It records expected room versions and deadlines for a future atomic commit adapter. Unsafe transfers (active entries, pregnancy, market commitments, token ownership not reconciled, mismatched calendars or ID collisions) are refused without changing either room.

**This is preparation only. The online join endpoint is intentionally unchanged.** Do not activate the planner until locks, durable cross-room commit/recovery, mint identity handling and restart/concurrency regressions are implemented. This avoids replacing progress loss with asset duplication.

Validation: 13 new preparation cases; full `npm test` now includes them. No changes to visual assets, production or paid infrastructure.

## Remaining work / next action

1. Review this PR and the GitHub CI result; do not auto-merge or deploy.
2. F1-03: preserve stable/horse/covering identity and balances across room changes, with transactional/serialization design compatible with F2. That bug is not fixed by this batch.
3. F0-04: obtain a consistent backup and prove external restore before production changes. Current backup script alone is not proof.
4. F0-05: staging requires explicit resource/budget approval; no new service was created.
5. F1-06/F1-07: auth rate limits, durable-write error handling and cloud/offline isolation remain open.
6. No 3D or NFT phase is marked complete. Art budget/reference approval and migration gates remain in force.

## Continuity

Use `PLAN-INDEX.md` for the full owner-approved plan and the persistent `studbook-3d-stage-gates` workflow for cross-session continuity. Update this record with actual commits, tests and approval evidence. Never store credentials or raw account data here.
