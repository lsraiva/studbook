# Release 0.34.0 — foundations live, traceable label

## Contents

Everything merged to `main` through PR #4, plus the release-label fix:

- **F1-06:**
  - per-address budget on account endpoints;
  - per-email lockout after wrong passwords;
  - mailed codes burned after repeated wrong guesses;
  - register rollback when the save fails;
  - writes pause when the users file cannot be saved;
  - cross-room sales journaled before they are confirmed;
  - meetings resolved on a copy and published only after the save.
- **F1-07:** account calls only from cloud mode, and a mode banner on every screen.
- **F2-01:** schema draft, global keys, ledger contract and import dry run. Not active in production.
- **F4:** causal race engine module. Not wired into meetings.
- **Health label:**
  - `version` is read from `package.json`;
  - `revision` is the commit passed at build time, or `null`, never `unknown`.
- **`npm run deploy:fly`:** deploys only a clean `main` equal to `origin/main` and always passes `COMMIT_SHA`.

## Protection before deploy

- **Backup:** production `/data` backed up 2026-11-25T01:22Z through `fly ssh` (tar.gz, 68,509 bytes). SHA-256 matched on Fly and locally. Stored outside the repository on the operator's machine.
- **Restore test:** the server booted locally on the restored copy in maintenance mode with 7 accounts; POSTs were refused (503).
- **Import dry run on the restored copy:**
  - 7 accounts, 6 human stables, 211 horses, 8,344 GNS in human stables;
  - 0 problems;
  - 1 known legacy account without a stable, not recreated.
- No schema migration, data rewrite, new resource or paid service.

## Observed before this release

Production (release 18) already served F1-06/F1-07 code, but `/api/health` reported `0.33.0` and revision `unknown`: that deploy did not pass `COMMIT_SHA`. This release makes the deployed commit verifiable.

## Verification

Filled in after the deploy, in the release-record commit.
