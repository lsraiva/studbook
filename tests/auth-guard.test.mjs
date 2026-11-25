#!/usr/bin/env node
/**
 * F1-06 — authentication throttling and honest failure on account writes.
 *
 *   node tests/auth-guard.test.mjs
 *
 * Unit checks of the limiter, then a real server on a temp directory with small limits.
 */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createWindowLimiter, clientAddress, sameCode } from "../server/auth-guard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) bad += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
};

/* ---------- limiter unit ---------- */
let clock = 1_000;
const limiter = createWindowLimiter({ limit: 3, windowMs: 10_000, now: () => clock });
for (let i = 0; i < 3; i += 1) limiter.hit("k");
ok("limiter blocks at the limit", limiter.retryAfter("k") === 10);
ok("limiter keys are independent", limiter.retryAfter("other") === 0);
clock += 10_001;
ok("limiter window slides open again", limiter.retryAfter("k") === 0 && limiter.size() === 0);
limiter.hit("k"); limiter.clear("k");
ok("clear forgets a key", limiter.retryAfter("k") === 0);
const tiny = createWindowLimiter({ limit: 1, windowMs: 1000, maxKeys: 2, now: () => clock });
tiny.hit("a"); tiny.hit("b"); tiny.hit("c");
ok("limiter memory is bounded", tiny.size() === 2);

const req = (header, remote) => ({ headers: header ? { "fly-client-ip": header } : {}, socket: { remoteAddress: remote } });
ok("proxy header ignored off Fly", clientAddress(req("9.9.9.9", "127.0.0.1"), { trustFly: false }) === "127.0.0.1");
ok("proxy header used on Fly", clientAddress(req("9.9.9.9", "10.0.0.1"), { trustFly: true }) === "9.9.9.9");
ok("codes compare exactly", sameCode("123456", "123456") && !sameCode("123457", "123456") && !sameCode("12345", "123456") && !sameCode("", ""));

/* ---------- live server with small limits ---------- */
const dataDir = await mkdtemp(join(tmpdir(), "studbook-auth-"));
const port = 8890 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;
let child = null;
async function start(extra = {}) {
  child = spawn(process.execPath, [join(root, "server/index.mjs")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, DEV_MAIL: "1", SOLO_SECONDS: "3600", LOGIN_FAIL_LIMIT: "3", CODE_ATTEMPTS: "3", AUTH_IP_LIMIT: "200", FLY_APP_NAME: "", ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", () => {}); // expected write failures are logged; keep output readable
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return res.json();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}
async function stop() {
  if (!child) return;
  child.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 150));
  child = null;
}
const api = async (path, { method = "POST", token, body } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})), retry: res.headers.get("retry-after") };
};
const pass = "correct horse battery";

try {
  await start();
  const reg = await api("/api/register", { body: { email: "lock@studbook.test", password: pass } });
  ok("register works under the limits", reg.status === 201);

  for (let i = 0; i < 3; i += 1) await api("/api/login", { body: { email: "lock@studbook.test", password: "wrong wrong" } });
  const locked = await api("/api/login", { body: { email: "lock@studbook.test", password: pass } });
  ok("after the failure limit even the right password waits", locked.status === 429 && Number(locked.retry) > 0, `retry-after ${locked.retry}`);
  const ghost = [];
  for (let i = 0; i < 4; i += 1) ghost.push((await api("/api/login", { body: { email: "nobody@studbook.test", password: "x".repeat(9) } })).status);
  ok("unknown emails lock the same way (no account oracle)", ghost.join() === "401,401,401,429", ghost.join());

  const rec = await api("/api/recover", { body: { email: "lock@studbook.test" } });
  const reset = await api("/api/reset", { body: { email: "lock@studbook.test", code: rec.json.devCode, password: "brand new battery" } });
  ok("a valid reset lifts the lockout", reset.status === 200 && (await api("/api/login", { body: { email: "lock@studbook.test", password: "brand new battery" } })).status === 200);

  const rec2 = await api("/api/recover", { body: { email: "lock@studbook.test" } });
  const wrongCode = rec2.json.devCode === "111111" ? "222222" : "111111";
  for (let i = 0; i < 3; i += 1) await api("/api/reset", { body: { email: "lock@studbook.test", code: wrongCode, password: "another battery" } });
  const burned = await api("/api/reset", { body: { email: "lock@studbook.test", code: rec2.json.devCode, password: "another battery" } });
  ok("a reset code dies after too many wrong guesses", burned.status === 400);

  const fresh = await api("/api/register", { body: { email: "code@studbook.test", password: pass } });
  const wrongVerify = fresh.json.devCode === "111111" ? "222222" : "111111";
  const first = await api("/api/verify", { token: fresh.json.token, body: { code: wrongVerify } });
  await api("/api/verify", { token: fresh.json.token, body: { code: wrongVerify } });
  const third = await api("/api/verify", { token: fresh.json.token, body: { code: wrongVerify } });
  const late = await api("/api/verify", { token: fresh.json.token, body: { code: fresh.json.devCode } });
  ok("a verify code dies after too many wrong guesses", first.json.code === "code" && third.json.code === "expired" && late.status === 400);

  await stop();
  await start();
  const afterRestart = await api("/api/verify", { token: fresh.json.token, body: { code: fresh.json.devCode } });
  ok("a burned code stays burned across a restart", afterRestart.status === 400);
  await stop();

  /* per-address budget */
  await start({ AUTH_IP_LIMIT: "2" });
  await api("/api/login", { body: { email: "a@studbook.test", password: pass } });
  await api("/api/login", { body: { email: "b@studbook.test", password: pass } });
  const flood = await api("/api/register", { body: { email: "c@studbook.test", password: pass } });
  ok("one address has a shared budget across account endpoints", flood.status === 429 && Number(flood.retry) > 0);
  await stop();

  /* a register whose save fails is not acknowledged and leaves no account behind */
  const before = (await start()).accounts;
  const roomsBefore = (await readdir(join(dataDir, "rooms"))).length;
  const blocker = join(dataDir, "users.json");
  await rm(blocker, { force: true }); // the running server already holds the accounts in memory
  await mkdir(join(blocker, "keep"), { recursive: true }); // a non-empty directory: every users write now fails
  const failed = await api("/api/register", { body: { email: "ghost@studbook.test", password: pass } });
  const health = await (await fetch(`${base}/api/health`)).json();
  ok("a register that cannot be saved answers 503", failed.status === 503 && failed.json.code === "storage", `${failed.status} ${failed.json.code}`);
  ok("the unsaved account is not served", health.accounts === before && (await api("/api/login", { body: { email: "ghost@studbook.test", password: pass } })).status !== 200);
  ok("no orphan room file is left by the failed register", (await readdir(join(dataDir, "rooms"))).length === roomsBefore);
  const paused = await api("/api/recover", { body: { email: "lock@studbook.test" } });
  ok("writes pause once the users file cannot be repaired", paused.status === 503 && paused.json.code === "storage");
} catch (error) {
  bad += 1;
  console.error(error);
} finally {
  await stop();
  await rm(dataDir, { recursive: true, force: true });
}

console.log(bad ? `${bad} auth-guard check(s) FAILED` : "auth-guard checks passed.");
process.exit(bad ? 1 : 0);
