#!/usr/bin/env node
/**
 * Server tests — the authority claim only means something if it is tested from outside.
 *
 *   node tests/server.test.mjs
 *
 * Spawns the real server on a temp data directory, talks to it over HTTP like a browser would,
 * tries to cheat, restarts it, and checks the stable came back.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dataDir = await mkdtemp(join(tmpdir(), "studbook-server-"));
const port = 8790 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;

let bad = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) bad += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
};

let child = null;
async function start() {
  child = spawn(process.execPath, [join(root, "server/index.mjs")], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ACTION_LIMIT: "40",
      ACTION_WINDOW_MS: "10000",
      // a lone stable waits; a room with two humans closes fast, so the clock can be tested
      SOLO_SECONDS: "3600",
      MEETING_SECONDS: "2",
      // mail has no provider here: the code comes back in the response so the flow can be finished
      DEV_MAIL: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
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

const api = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
};

try {
  const health = await start();
  ok("health reports cloud", health.ok === true && health.cloud === true, `accounts ${health.accounts}`);

  /* ---------- static hosting: one command runs the whole game ---------- */
  const page = await fetch(`${base}/`);
  const html = await page.text();
  ok("serves the game", page.status === 200 && /<html/i.test(html), `${html.length} bytes`);
  const engine = await fetch(`${base}/assets/engine.js`);
  ok("serves the engine as a module", engine.status === 200 && /javascript/.test(engine.headers.get("content-type") ?? ""));

  /* ---------- accounts ---------- */
  const unauth = await api("/api/me");
  ok("no token, no view", unauth.status === 401);

  const weak = await api("/api/register", { method: "POST", body: { email: "a@b.co", password: "short" } });
  ok("short password refused", weak.status === 400, weak.json.error);

  const reg = await api("/api/register", { method: "POST", body: { email: "owner@studbook.test", password: "correct horse battery" } });
  const token = reg.json.token;
  ok("register returns a token and a stable", reg.status === 201 && Boolean(token) && reg.json.state.view?.stable !== null);
  const startGuineas = reg.json.state.view.stable.guineas;

  const dup = await api("/api/register", { method: "POST", body: { email: "owner@studbook.test", password: "correct horse battery" } });
  ok("email cannot claim two stables", dup.status === 409);

  const badLogin = await api("/api/login", { method: "POST", body: { email: "owner@studbook.test", password: "wrong password" } });
  ok("wrong password refused", badLogin.status === 401);

  /* ---------- cheating attempts ---------- */
  const cheats = [
    [{ type: "addCoins", pack: "chest" }, "coin pack"],
    [{ type: "testGrant", amount: 50000 }, "grant"],
    [{ type: "postWanted", price: 1e9 }, "absurd price"],
    [{ type: "enter", horseIds: ["h9999"] }, "someone else's horse"],
    [{ type: "startOver", bank: 50000 }, "big bank"],
  ];
  for (const [action, label] of cheats) {
    const res = await api("/api/action", { method: "POST", token, body: { action } });
    ok(`cheat refused: ${label}`, res.status === 400, res.json.error);
  }
  const forged = await api("/api/action", { method: "POST", token, body: { action: { type: "takeStarterOffer" }, state: { stables: [] }, view: {} } });
  ok("a forged state in the body is ignored", forged.status === 200 && forged.json.state.view.stable.guineas === startGuineas - 20);

  /* ---------- the same stable from a second device ---------- */
  const again = await api("/api/login", { method: "POST", body: { email: "owner@studbook.test", password: "correct horse battery" } });
  const token2 = again.json.token;
  const me = await api("/api/me", { token: token2 });
  ok("second device sees the same bank", me.json.state.view.stable.guineas === startGuineas - 20, `${me.json.state.view.stable.guineas}`);
  const devices = new Set([token, token2]);
  ok("two sessions, one account", devices.size === 2 && me.json.user.id === reg.json.user.id);

  /* ---------- the state survives a restart ---------- */
  const before = me.json.state.view.stable;
  const beforeHorses = me.json.state.view.horses.length;
  await stop();
  await start();
  const relog = await api("/api/login", { method: "POST", body: { email: "owner@studbook.test", password: "correct horse battery" } });
  const after = await api("/api/me", { token: relog.json.token });
  ok("cloud save survives a restart", after.json.state.view.stable.guineas === before.guineas, `${after.json.state.view.stable.guineas} GNS`);
  ok("...and the horses came back", after.json.state.view.horses.length === beforeHorses, `${after.json.state.view.horses.length} horses`);

  /* ---------- rate limiting ---------- */
  const spam = await api("/api/register", { method: "POST", body: { email: "spam@studbook.test", password: "correct horse battery" } });
  const spamToken = spam.json.token;
  let limited = 0;
  for (let i = 0; i < 55; i += 1) {
    const res = await api("/api/action", { method: "POST", token: spamToken, body: { action: { type: "advance" } } });
    if (res.status === 429) limited += 1;
  }
  ok("action spam is rate limited", limited > 0, `${limited} refused of 55`);

  /* ---------- the clock is the server's ---------- */
  const far = await api("/api/action", { method: "POST", token, body: { action: { type: "openWindow", endsAt: Date.now() + 999_999_000 } } });
  const endsAt = far.json.state.view.clock?.endsAt ?? 0;
  ok("a client cannot ask for a week-long window", far.status === 200 && endsAt - Date.now() <= 300_000, `${Math.round((endsAt - Date.now()) / 1000)}s`);
  const early = await api("/api/action", { method: "POST", token, body: { action: { type: "closeWindow" } } });
  ok("nor close it before the deadline", early.status === 400, early.json.error);

  /* ---------- a horse becomes a token: intent, wallet, one mint ---------- */
  const holder = await api("/api/register", { method: "POST", body: { email: "holder@studbook.test", password: "correct horse battery" } });
  const holderToken = holder.json.token;
  const intents = await api("/api/mints", { token: holderToken });
  ok("every horse in the yard has a mint intent", intents.json.mints.length >= 1, `${intents.json.mints.length} intent(s)`);
  ok("...unclaimed, because there is no wallet yet", intents.json.mints[0].status === "unclaimed", intents.json.mints[0].status);
  ok("the genotype is packed for the token", /^\d+$/.test(String(intents.json.mints[0].genome)), intents.json.mints[0].genome.slice(0, 12));

  const badWallet = await api("/api/wallet", { method: "POST", token: holderToken, body: { address: "0x123" } });
  ok("a malformed address is refused", badWallet.status === 400);
  const wallet = await api("/api/wallet", { method: "POST", token: holderToken, body: { address: "0x00000000000000000000000000000000000a11ce" } });
  ok("a wallet can be bound", wallet.status === 200);
  const claimable = await api("/api/mints", { token: holderToken });
  ok("...and the intent becomes claimable", claimable.json.mints[0].status === "pending" && claimable.json.pending >= 1,
     `${claimable.json.pending} pending`);

  const nullifier = claimable.json.mints[0].nullifier;
  const confirmed = await api("/api/mints/confirm", { method: "POST", token: holderToken, body: { nullifier, tokenId: 7 } });
  ok("the mint is confirmed once", confirmed.status === 200 && confirmed.json.mint.tokenId === 7);
  const twice = await api("/api/mints/confirm", { method: "POST", token: holderToken, body: { nullifier, tokenId: 8 } });
  ok("...and only once", twice.status === 409, twice.json.error);
  const outsider = await api("/api/register", { method: "POST", body: { email: "outsider@studbook.test", password: "correct horse battery" } });
  const stranger = await api("/api/mints/confirm", { method: "POST", token: outsider.json.token, body: { nullifier, tokenId: 9 } });
  ok("someone else cannot confirm your horse", stranger.status === 404);

  /* ---------- the public table ---------- */
  const board = await api("/api/ranking");
  ok("the ranking is public and has rows", board.status === 200 && board.json.ranking.length >= 2,
     `${board.json.ranking?.length} rows`);
  ok("...and it does not leak emails", !JSON.stringify(board.json).includes("@studbook.test"));

  /* ---------- a room: two humans, one clock ---------- */
  const host = await api("/api/register", { method: "POST", body: { email: "host@studbook.test", password: "correct horse battery" } });
  const guest = await api("/api/register", { method: "POST", body: { email: "guest@studbook.test", password: "correct horse battery" } });
  const code = host.json.state.room.code;
  const joined = await api("/api/room/join", { method: "POST", token: guest.json.token, body: { code } });
  ok("a second player joins by code", joined.status === 200 && joined.json.state.room.code === code,
     `${joined.json.state.room.seats} seats`);
  const wrongCode = await api("/api/room/join", { method: "POST", token: guest.json.token, body: { code: "ZZZZZZ" } });
  ok("a wrong code is refused", wrongCode.status === 404);

  const push = await api("/api/action", { method: "POST", token: host.json.token, body: { action: { type: "advance" } } });
  ok("no client action moves the clock", push.status === 400 && /clock/i.test(push.json.error ?? ""), push.json.error);

  const roomBefore = (await api("/api/room", { token: host.json.token })).json.state.room;
  await new Promise((r) => setTimeout(r, 5200)); // deadline + scheduler interval, nobody touching anything
  const roomAfter = (await api("/api/room", { token: host.json.token })).json.state.room;
  ok("the meeting closes on its own", roomAfter.meeting !== roomBefore.meeting || roomAfter.season !== roomBefore.season,
     `meeting ${roomBefore.meeting} → ${roomAfter.meeting}`);
  const seated = (await api("/api/room", { token: guest.json.token })).json.state.room;
  ok("...and both seats see the same clock", seated.meeting === roomAfter.meeting && seated.season === roomAfter.season,
     `guest meeting ${seated.meeting}`);

  /* ---------- verifying an address ---------- */
  const fresh = await api("/api/register", { method: "POST", body: { email: "verify@studbook.test", password: "correct horse battery" } });
  ok("register mails a code", Boolean(fresh.json.devCode), String(fresh.json.devCode));
  ok("...and the account starts unverified", fresh.json.user.verified === false);
  const badVerifyCode = await api("/api/verify", { method: "POST", token: fresh.json.token, body: { code: "000000" } });
  ok("a wrong code is refused", badVerifyCode.status === 400);
  const verified = await api("/api/verify", { method: "POST", token: fresh.json.token, body: { code: fresh.json.devCode } });
  ok("the mailed code verifies the account", verified.status === 200 && verified.json.verified === true);
  const meNow = await api("/api/me", { token: fresh.json.token });
  ok("...and the account says so", meNow.json.user.verified === true);

  /* ---------- forgetting and replacing a password ---------- */
  const rec = await api("/api/recover", { method: "POST", body: { email: "verify@studbook.test" } });
  ok("recover sends a code", rec.status === 200 && Boolean(rec.json.devCode));
  const unknown = await api("/api/recover", { method: "POST", body: { email: "nobody@studbook.test" } });
  ok("an unknown address looks the same", unknown.status === 200 && unknown.json.devCode === null);
  const badReset = await api("/api/reset", { method: "POST", body: { email: "verify@studbook.test", code: "111111", password: "brand new battery" } });
  ok("a wrong reset code is refused", badReset.status === 400);
  const reset = await api("/api/reset", { method: "POST", body: { email: "verify@studbook.test", code: rec.json.devCode, password: "brand new battery" } });
  ok("the password is replaced", reset.status === 200 && Boolean(reset.json.token));
  const oldPass = await api("/api/login", { method: "POST", body: { email: "verify@studbook.test", password: "correct horse battery" } });
  ok("the old password stops working", oldPass.status === 401);
  const newPass = await api("/api/login", { method: "POST", body: { email: "verify@studbook.test", password: "brand new battery" } });
  ok("the new one works", newPass.status === 200);
  const deadSession = await api("/api/me", { token: fresh.json.token });
  ok("and every old session died with it", deadSession.status === 401);

  /* ---------- the transport the page actually uses ---------- */
  const { CloudSocket } = await import("../assets/net.js");
  const sock = new CloudSocket(base, token);
  const inbox = [];
  let opened = false;
  sock.addEventListener("open", () => { opened = true; });
  sock.addEventListener("message", (event) => inbox.push(JSON.parse(event.data)));
  await new Promise((r) => setTimeout(r, 20));
  await sock.send(JSON.stringify({ type: "join", playerId: "ignored" }));
  await new Promise((r) => setTimeout(r, 80));
  const first = inbox.find((m) => m.type === "state");
  ok("the page's own socket receives a view", opened && Boolean(first?.view?.stable), `${inbox.length} message(s)`);
  await sock.send(JSON.stringify({ type: "action", action: { type: "addCoins", pack: "chest" } }));
  await new Promise((r) => setTimeout(r, 80));
  ok("...and a cheat is answered with an error, not a bank", inbox.some((m) => m.type === "error"));
} finally {
  await stop();
  await rm(dataDir, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} failing` : "\nall green");
process.exit(bad ? 1 : 0);
