#!/usr/bin/env node
/**
 * Deploy to Fly only what is on origin/main, labelled with its exact commit.
 *
 *   npm run deploy:fly            # checks, then fly deploy --build-arg COMMIT_SHA=<HEAD>
 *   npm run deploy:fly -- --check # checks only
 *
 * Refuses a dirty tree, a branch other than main, or a HEAD that differs from origin/main,
 * so /api/health always names a commit anyone can look up. Needs flyctl and either
 * `fly auth login` or FLY_API_TOKEN in the environment (never passed on the command line).
 * Take and verify a /data backup first (see docs/HANDOFF.md).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const fail = (message) => { console.error(`deploy refused: ${message}`); process.exit(1); };

if (git("status", "--porcelain")) fail("working tree has uncommitted changes");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main") fail(`on branch ${branch}, not main`);
execFileSync("git", ["fetch", "-q", "origin", "main"]);
const head = git("rev-parse", "HEAD");
const remote = git("rev-parse", "origin/main");
if (head !== remote) fail(`HEAD ${head.slice(0, 7)} differs from origin/main ${remote.slice(0, 7)}`);

const local = join(homedir(), ".fly", "bin", process.platform === "win32" ? "flyctl.exe" : "flyctl");
const fly = existsSync(local) ? local : "flyctl";
console.log(`deploying ${head} to Fly app studbook`);
if (process.argv.includes("--check")) process.exit(0);
const run = spawnSync(fly, ["deploy", "-a", "studbook", "--build-arg", `COMMIT_SHA=${head}`], { stdio: "inherit" });
process.exit(run.status ?? 1);
