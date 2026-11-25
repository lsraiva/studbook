# Studbook 3D — execution status

## In review — `feat/f1-f2-foundations-20261124` (not deployed)

| Task | State | Evidence |
|---|---|---|
| F1-06 auth hardening and write failures | review | per-address auth budget, per-email lockout (unknown emails too), constant-time codes burned after N guesses, register rollback, users-write fault pause, journaled cross-room sales, meeting resolved on a copy; `tests/auth-guard.test.mjs` (20 checks) |
| F1-07 offline/cloud separation | review | `cloudApi` refuses account calls outside cloud mode; mode banner on every screen with sign-in offer; jsdom + Playwright (`modes.spec.mjs`) |
| F2-01 schema, keys, invariants | review | deterministic UUIDv5 keys, ledger contract + memory adapter, import dry run with G1–G6, `db/schema.sql` draft; `tests/ledger.test.mjs`. See [F2-SCHEMA.md](F2-SCHEMA.md) |

Totals on this branch: `npm test` 276 checks, 0 failures; `npm run test:browser` 13 tests pass (SwiftShader); contracts compile. The suite now also runs on Windows hosts (directory fsync and symlink checks are skipped only where the OS cannot do them; Linux CI still runs both).

No deploy, schema migration, provisioning, paid resource or blockchain call happened. F2-02 still needs provider/region/budget approval.

## Current publication

Version 0.35 translates the game chrome to Portuguese (tabs, buttons, tables, filters, errors and central states) via assets/i18n.js, while preserving names and numbers. Long engine-generated editorial copy is only partially covered; see RELEASE-0.35.md. Do not claim full translation yet.

Version 0.33 adds deterministic individual appearance (coat, mane, face mark, socks) to the yard, detail card, market and 3D viewer. Identity derives from public horse id+lineage only: no hidden genotype leak, no performance effect, no data migration. See RELEASE-0.33.md.

Version 0.32.0 is deployed to Fly with the welcome page and experimental 3D viewer. PR #2 is merged. See RELEASE-0.32.md and ../HANDOFF.md. The sections below record earlier batches and must not be interpreted as the current no-deploy status.

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

## First batch tests (historical)

Before fixes: the new exact-click check failed (meeting 1 became 3), public-path checks failed, and legacy online clock commands were accepted. These failures were observed in isolated local tests.

After fixes:
- `npm test`: 205 assertions passed, zero failures.
- `npm run test:browser`: 6 tests passed, including all nine screens at four viewport widths, one-click rollover and mobile touch.
- `npm run contracts`: successful compilation; this is not an EVM security audit.
- `git diff --check`: clean.
- Changed-file credential scan: no token/private-key patterns found.

Reproduce browser tests with `npm ci`, `npx playwright install chromium`, then `npm run test:browser`. Tests start an isolated local preview server and create no production users.

## F1-03 integrated transfer — current increment

The preservation planner is now connected to the join API through a durable committed journal. Room JSON files are recoverable projections; source/destination stay locked through journal commit and both materialization attempts. Startup replays committed transfers before accepting traffic. The bank, horse identity/genome, covering and stable history survive a join and process restart in synthetic tests.

Transfers with active entries, pregnancies, market commitments, wallet-bound assets or mismatched calendars are refused safely. Empty source rooms are archived, not erased. This is a single-writer bridge, not distributed transaction support or a replacement for F2/Postgres. See [ROOM-TRANSFER.md](ROOM-TRANSFER.md) for commit semantics, tests, backups and rollback restrictions.

No deploy, migration of production data, visual generation or paid infrastructure occurred in this increment.

## Remaining work / next action

1. Review this PR and the GitHub CI result; do not auto-merge or deploy.
2. F1-03: the eligible-transfer path is now implemented and in review. Wallet-bound assets, active commitments and different calendars are deliberately refused; full transactional ownership belongs to F2. Review ROOM-TRANSFER.md before any activation.
3. F0-04: obtain a consistent backup and prove external restore before production changes. Current backup script alone is not proof.
4. F0-05: staging requires explicit resource/budget approval; no new service was created.
5. F1-06/F1-07: auth rate limits, durable-write error handling and cloud/offline isolation remain open.
6. No 3D or NFT phase is marked complete. Art budget/reference approval and migration gates remain in force.

## Continuity

Use `PLAN-INDEX.md` for the full owner-approved plan and the persistent `studbook-3d-stage-gates` workflow for cross-session continuity. Update this record with actual commits, tests and approval evidence. Never store credentials or raw account data here.
