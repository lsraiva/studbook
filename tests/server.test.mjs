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
import { mkdtemp, rm, mkdir, writeFile, symlink } from "node:fs/promises";
import { publicAsset } from "../server/public-files.mjs";
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

  /* ---------- only game assets belong on the public static surface ---------- */
  for (const path of ["/server/index.mjs", "/package.json", "/.git/config", "/tools/backup.mjs", "/assets/../server/index.mjs", "/assets/%2e%2e%2fserver/index.mjs", "/assets/config.js%00"]) {
    const response = await fetch(`${base}${path}`);
    ok(`private or malformed static path is refused: ${path}`, [400, 403, 404].includes(response.status));
  }
  const art = await fetch(`${base}/assets/art/crest.webp`);
  ok("public horse artwork keeps its image MIME type", art.status === 200 && /image\/webp/.test(art.headers.get("content-type") ?? ""));

  const fixtureRoot = join(dataDir, "public-fixture");
  await mkdir(join(fixtureRoot, "assets", "art"), { recursive: true });
  await writeFile(join(fixtureRoot, "users.json"), '{"fixture":"private"}');
  await symlink(join(fixtureRoot, "users.json"), join(fixtureRoot, "assets", "art", "alias.webp"));
  ok("allowlisted-looking symlink cannot expose private files", (await publicAsset(fixtureRoot, "/assets/art/alias.webp")).status === 404);
  ok("private JSON remains private even when placed inside static root", (await publicAsset(fixtureRoot, "/users.json")).status === 404);
  ok("invalid URI encoding is a client error", (await publicAsset(fixtureRoot, "/assets/%ZZ")).status === 400);
  const head = await fetch(`${base}/assets/ui.js`, { method: "HEAD" });
  ok("HEAD serves public headers without a body", head.status === 200 && (await head.text()) === "");
  const postedStatic = await fetch(`${base}/assets/ui.js`, { method: "POST" });
  ok("static assets reject writes", postedStatic.status === 405);

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

  /* ---------- every public route to the league clock is refused ---------- */
  const clockBefore = (await api("/api/room", { token })).json.state.room;
  for (const action of [
    { type: "advance" },
    { type: "startOver", bank: 2000 },
    { type: "openWindow", endsAt: Date.now() - 1000 },
    { type: "openWindow", endsAt: Date.now() + 10_000 },
    { type: "openWindow", endsAt: Date.now() + 999_999_000 },
    { type: "closeWindow" },
  ]) {
    const result = await api("/api/action", { method: "POST", token, body: { action } });
    ok(`online clock command ${action.type} is refused`, result.status === 400 && result.json.code === "clock");
  }
  const clockAfter = (await api("/api/room", { token })).json.state.room;
  ok("refused clock commands preserve meeting and deadline", clockBefore.meeting === clockAfter.meeting && clockBefore.season === clockAfter.season && clockBefore.closesAt === clockAfter.closesAt);

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

  const minterInfo = await api("/api/minter");
  ok("a simulated minter is published", minterInfo.json.mode === "simulated" && /^0x[0-9a-f]{40}$/.test(minterInfo.json.address ?? ""),
     minterInfo.json.address);
  const nullifier = claimable.json.mints[0].nullifier;
  const signed = await api("/api/mints/sign", { method: "POST", token: holderToken, body: { nullifier } });
  ok("the mint intent can be signed", signed.status === 200 && (signed.json.signature ?? "").length > 100,
     `${(signed.json.signature ?? "").slice(0, 16)}…`);
  const { createHash, verify } = await import("node:crypto");
  const signedOk = verify(
    null,
    createHash("sha256").update(JSON.stringify(signed.json.payload)).digest(),
    minterInfo.json.publicKey,
    Buffer.from(signed.json.signature, "hex"),
  );
  ok("...with a signature that verifies against the published key", signedOk === true);

  const confirmed = await api("/api/mints/confirm", { method: "POST", token: holderToken, body: { nullifier } });
  ok("the simulated mint assigns a token id and a receipt",
     confirmed.status === 200 && confirmed.json.mint.tokenId >= 900001 && /^sim:/.test(confirmed.json.mint.txHash ?? ""),
     `#${confirmed.json.mint?.tokenId} ${String(confirmed.json.mint?.txHash).slice(0, 12)}`);
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
  const covered = await api("/api/action", { method: "POST", token: guest.json.token, body: { action: { type: "takeStarterOffer" } } });
  const originalGuest = covered.json.state.view;
  const originalMints = (await api("/api/mints", { token: guest.json.token })).json.mints;
  const attempts = await Promise.all([1, 2].map(() => api("/api/room/join", { method: "POST", token: guest.json.token, body: { code } })));
  const joined = attempts.find((a) => a.status === 200) ?? attempts[0];
  ok("concurrent transfer requests succeed once or return busy", attempts.some((a) => a.status === 200) && attempts.every((a) => [200, 409].includes(a.status)));
  ok("a second player joins by code", joined.status === 200 && joined.json.state.room.code === code,
     `${joined.json.state.room.seats} seats`);
  ok("room transfer preserves balance instead of granting a new bank", joined.json.state.view.stable.guineas === originalGuest.stable.guineas && originalGuest.stable.guineas === 1980);
  ok("room transfer preserves original horse identity and genome", JSON.stringify(joined.json.state.view.horses.map((h) => [h.id, h.genotype])) === JSON.stringify(originalGuest.horses.map((h) => [h.id, h.genotype])));
  ok("room transfer preserves purchased covering", joined.json.state.view.straws.length === 1 && joined.json.state.view.straws[0].id === originalGuest.straws[0].id);
  const movedMints = (await api("/api/mints", { token: guest.json.token })).json.mints;
  ok("unclaimed mint identity does not change with the room", movedMints[0].nullifier === originalMints[0].nullifier && movedMints[0].roomId === joined.json.state.room.id);
  await stop(); await start();
  const restoredGuest = (await api("/api/me", { token: guest.json.token })).json.state;
  ok("transferred stable survives process restart without duplication", restoredGuest.room.code === code && restoredGuest.room.seats === 2 && restoredGuest.view.stable.guineas === 1980 && restoredGuest.view.horses[0].id === originalGuest.horses[0].id);
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

  /* ---------- one market, two rooms ---------- */
  const seller = await api("/api/register", { method: "POST", body: { email: "seller@studbook.test", password: "correct horse battery" } });
  const buyer = await api("/api/register", { method: "POST", body: { email: "buyer@studbook.test", password: "correct horse battery" } });
  const sellerToken = seller.json.token;
  const buyerToken = buyer.json.token;
  const sellerRoom = seller.json.state.room.code;
  const buyerRoom = buyer.json.state.room.code;

  // the seller needs a second horse to consign: buy one from the room's own ring
  const houseLot = seller.json.state.view.listings.find((lot) => lot.kind === "horse" && lot.seller !== "st1");
  await api("/api/action", { method: "POST", token: sellerToken, body: { action: { type: "buyHorse", listingId: houseLot.id } } });
  const consigned = await api("/api/action", {
    method: "POST",
    token: sellerToken,
    body: { action: { type: "listHorse", horseId: houseLot.horseId, price: 100 } },
  });
  ok("a lot is consigned in room A", consigned.status === 200, sellerRoom);

  const market = await api("/api/market");
  const crossLot = market.json.lots.find(
    (lot) => lot.roomCode === sellerRoom && lot.kind === "horse" && lot.seller === "st1",
  );
  ok("the catalogue shows lots from every room", Boolean(crossLot) && market.json.rooms >= 2, `${market.json.lots.length} lots in ${market.json.rooms} rooms`);

  const sellerBefore = (await api("/api/me", { token: sellerToken })).json.state.view.stable.guineas;
  const buyerBefore = (await api("/api/me", { token: buyerToken })).json.state.view.stable.guineas;
  const bought = await api("/api/market/buy", { method: "POST", token: buyerToken, body: { roomId: crossLot.roomId, listingId: crossLot.listingId } });
  ok("a player in room B buys from room A", bought.status === 200, JSON.stringify(bought.json.sale));
  ok("...paying the full price", bought.json.sale.price === 100);
  ok("...and the seller receives it less the 5% rake",
     (await api("/api/me", { token: sellerToken })).json.state.view.stable.guineas === sellerBefore + 95,
     `${sellerBefore} → ${(await api("/api/me", { token: sellerToken })).json.state.view.stable.guineas}`);
  ok("...the buyer pays in full",
     (await api("/api/me", { token: buyerToken })).json.state.view.stable.guineas === buyerBefore - 100);
  const buyerHerd = (await api("/api/me", { token: buyerToken })).json.state.view.horses;
  ok("...and the horse arrives in room B", buyerHerd.some((horse) => horse.id === crossLot.horseId), `${buyerHerd.length} horses`);
  const afterMarket = await api("/api/market");
  ok("...and the lot leaves the catalogue", !afterMarket.json.lots.some((lot) => lot.roomId === crossLot.roomId && lot.listingId === crossLot.listingId));
  const againBuy = await api("/api/market/buy", { method: "POST", token: buyerToken, body: { roomId: crossLot.roomId, listingId: crossLot.listingId } });
  ok("a sold lot cannot be bought twice", againBuy.status === 404);
  const ownRoomLot = afterMarket.json.lots.find((lot) => lot.roomCode === buyerRoom);
  if (ownRoomLot) {
    const ownBuy = await api("/api/market/buy", { method: "POST", token: buyerToken, body: { roomId: ownRoomLot.roomId, listingId: ownRoomLot.listingId } });
    ok("a lot in your own room is bought the normal way", ownBuy.status === 400 && /own room/i.test(ownBuy.json.error), ownBuy.json.error);
  }

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
