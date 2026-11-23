#!/usr/bin/env node
/**
 * Studbook server — the rules run here.
 *
 * The browser never owns the state: it sends an action and receives a view. Every action is
 * judged by the same engine module the tests use (assets/engine.js), so a client cannot invent
 * a horse, a price or a balance. Accounts, sessions and saves live here too, which is what makes
 * a stable reachable from any device.
 *
 *   node server/index.mjs            # serves the game AND the API on :8787
 *
 * Env: PORT, DATA_DIR, ALLOWED_ORIGINS, ACTION_LIMIT, ACTION_WINDOW_MS
 */
import { createServer } from "node:http";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomInt,
  scryptSync,
  sign,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LOCI as LOCUS_ORDER,
  applyAction,
  scorePopulation,
  horseById,
  meta,
  runRound,
  setup,
  stableOf,
  validateAction,
  viewFor,
} from "../assets/engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dataDir = process.env.DATA_DIR ?? join(here, "data");
const port = Number(process.env.PORT ?? 8787);
const origins = (process.env.ALLOWED_ORIGINS ?? "*").split(",").map((o) => o.trim());
const ACTION_LIMIT = Number(process.env.ACTION_LIMIT ?? 40);
const ACTION_WINDOW_MS = Number(process.env.ACTION_WINDOW_MS ?? 10_000);
const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 30);
const MAX_BODY = 16 * 1024;

/* ---------------------------------------------------------------- storage */

const users = new Map();   // id -> { id, email, salt, hash, createdAt }
const emails = new Map();  // email -> id
const sessions = new Map(); // token -> { userId, expiresAt }
const rooms = new Map();   // roomId -> { id, code, state, closesAt, version }
const mints = new Map();   // nullifier -> { roomId, horseId, owner, address, bornSeason, tokenId|null, status }
const userRoom = new Map(); // userId -> roomId
const traffic = new Map(); // userId -> number[] (action timestamps)

const userFile = join(dataDir, "users.json");
const sessionFile = join(dataDir, "sessions.json");
const roomDir = join(dataDir, "rooms");
/** A meeting closes on a clock, never on a click. Rooms with a second human are given longer. */
const MEETING_SECONDS = Number(process.env.MEETING_SECONDS ?? 43_200); // 12 h
const SOLO_SECONDS = Number(process.env.SOLO_SECONDS ?? 120);          // two minutes alone

async function writeJsonAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, path);
}

async function loadAll() {
  try {
    for (const user of JSON.parse(await readFile(userFile, "utf8"))) {
      users.set(user.id, user);
      emails.set(user.email, user.id);
    }
  } catch {
    /* first run */
  }
  try {
    const saved = JSON.parse(await readFile(sessionFile, "utf8"));
    for (const [token, session] of Object.entries(saved)) {
      if (session.expiresAt > Date.now()) sessions.set(token, session);
    }
  } catch {
    /* first run */
  }
  try {
    await mkdir(roomDir, { recursive: true });
  } catch {
    /* exists */
  }
  try {
    for (const file of await readdir(roomDir)) {
      if (!file.endsWith(".json")) continue;
      const room = JSON.parse(await readFile(join(roomDir, file), "utf8"));
      rooms.set(room.id, room);
      for (const player of room.state.players ?? []) userRoom.set(player, room.id);
    }
  } catch {
    /* first run */
  }
}

const persistUsers = () => writeJsonAtomic(userFile, [...users.values()]);
const persistSessions = () =>
  writeJsonAtomic(sessionFile, Object.fromEntries(sessions));
const persistRoom = (room) => writeJsonAtomic(join(roomDir, `${room.id}.json`), room);

const newCode = () => randomBytes(3).toString("hex").toUpperCase();

/** A block of ids per room, derived from its id: stable across restarts, disjoint between rooms. */
const idBaseFor = (roomId) =>
  (parseInt(createHash("sha1").update(roomId).digest("hex").slice(0, 8), 16) % 1_000_000) * 10_000;

/**
 * The nullifier of a horse is its identity, not a counter: the same animal can be presented twice
 * and still produce one token. Rebuilding it from the state means it survives a restart.
 */
const nullifierOf = (room, horse) =>
  createHash("sha256")
    .update(`studbook:${room.id}:${horse.id}:${horse.sire ?? 0}:${horse.dam ?? 0}:${horse.bornSeason ?? 0}`)
    .digest("hex");

const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(String(value ?? ""));

/**
 * Every horse a human owns gets one mint intent. Pending means the chain has not confirmed it;
 * unclaimed means the account has no wallet yet, so the animal is playable but not withdrawable.
 */
function issueMints(room) {
  const fresh = [];
  for (const stable of room.state.stables) {
    if (!stable.player) continue; // the house's own yards are not tokenized
    for (const horseId of stable.horses) {
      const horse = horseById(room.state, horseId);
      if (!horse) continue;
      const nullifier = nullifierOf(room, horse);
      if (mints.has(nullifier)) continue;
      const address = users.get(stable.player)?.wallet ?? null;
      const intent = {
        nullifier,
        roomId: room.id,
        horseId: horse.id,
        name: horse.name,
        owner: stable.player,
        address: isAddress(address) ? address : null,
        bornSeason: horse.bornSeason ?? 0,
        genome: packGenome(horse.genome),
        lineage: horse.lineage,
        sex: horse.sex === "F" ? 0 : 1,
        sireId: horse.sire ?? 0,
        damId: horse.dam ?? 0,
        tokenId: null,
        status: "unclaimed",
      };
      mints.set(nullifier, intent);
      fresh.push(intent);
    }
  }
  return fresh;
}

/** The genotype as the token stores it: 12 loci x 2 alleles x 2 bits, low bit first. */
function packGenome(genome) {
  let word = 0n;
  let bit = 0n;
  for (const locus of Object.keys(genome).sort((a, b) => LOCUS_ORDER.indexOf(a) - LOCUS_ORDER.indexOf(b))) {
    for (const allele of genome[locus]) {
      word |= BigInt(allele & 3) << bit;
      bit += 2n;
    }
  }
  return word.toString();
}

/** A seat in a room is a stable: the engine already knew how to add one mid-game. */
function openRoom(userId) {
  const id = `r${randomBytes(5).toString("hex")}`;
  const room = {
    id,
    code: newCode(),
    state: setup([userId], `room:${id}`, idBaseFor(id)),
    closesAt: Date.now() + SOLO_SECONDS * 1000,
    version: 1,
  };
  rooms.set(id, room);
  userRoom.set(userId, id);
  issueMints(room);
  return room;
}

function roomOf(userId) {
  const id = userRoom.get(userId);
  return id ? rooms.get(id) : null;
}

function humanSeats(room) {
  return (room.state.players ?? []).length;
}

/** Deadline: a room with one human runs fast, a league waits for the others. */
function rearm(room) {
  room.closesAt = Date.now() + (humanSeats(room) > 1 ? MEETING_SECONDS : SOLO_SECONDS) * 1000;
}

/* ---------------------------------------------------------------- accounts */

const hashPassword = (password, salt) => scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");

const newToken = () => randomBytes(32).toString("base64url");

/**
 * Mail without a mail provider. The code is always written to the server log; with DEV_MAIL=1 it is
 * also returned to the caller, which is what lets the test (and a local player) finish the flow.
 * Wiring a real sender means replacing this one function.
 */
function deliver(email, code, purpose) {
  console.log(`[mail:${purpose}] ${email} → ${code}`);
  return process.env.DEV_MAIL === "1" ? code : null;
}

const newCode6 = () => String(randomInt(100000, 999999));
const CODE_MINUTES = 15;

const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 160;

function createAccount(email, password) {
  if (!validEmail(email)) throw httpError(400, "that is not an email address", "email");
  if (typeof password !== "string" || password.length < 8) throw httpError(400, "a password is at least 8 characters", "password");
  if (emails.has(email)) throw httpError(409, "this email already has a stable", "taken");
  const id = `u${randomBytes(6).toString("hex")}`;
  const salt = randomBytes(16).toString("hex");
  const user = {
    id,
    email,
    salt,
    hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
    verified: false,
    verifyCode: newCode6(),
    verifyExpires: Date.now() + CODE_MINUTES * 60_000,
  };
  users.set(id, user);
  emails.set(email, id);
  openRoom(id);
  return user;
}

function checkPassword(user, password) {
  const attempt = Buffer.from(hashPassword(String(password ?? ""), user.salt), "hex");
  const known = Buffer.from(user.hash, "hex");
  return attempt.length === known.length && timingSafeEqual(attempt, known);
}

function openSession(user) {
  const token = newToken();
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_DAYS * 86_400_000 });
  persistSessions().catch(() => {});
  return token;
}

/* ---------------------------------------------------------------- replies */

function httpError(status, message, code = "invalid") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cors(req, res) {
  const origin = req.headers.origin ?? "";
  const allowed = origins.includes("*") ? origin || "*" : origins.find((o) => o === origin);
  if (!allowed) return;
  res.setHeader("access-control-allow-origin", allowed);
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-headers", "content-type, authorization");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-max-age", "600");
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw httpError(413, "request too large", "large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw httpError(400, "body is not JSON", "json");
  }
}

/* ---------------------------------------------------------------- the game */

/** The browser gets a view, never the state: this is the whole anti-cheat boundary. */
function frame(room, userId) {
  const stable = stableOf(room.state, userId);
  const seats = room.state.players ?? [];
  return {
    type: "state",
    status: "playing",
    seats: [...seats],
    you: userId,
    connected: seats.length,
    view: viewFor(room.state, userId),
    result: null,
    meta,
    version: room.version,
    account: {
      id: userId,
      email: users.get(userId)?.email ?? null,
      verified: Boolean(users.get(userId)?.verified),
    },
    cloud: true,
    stable: Boolean(stable),
    // The room owns the clock. The player only owns what they enter.
    room: {
      id: room.id,
      code: room.code,
      seats: seats.length,
      closesAt: room.closesAt,
      season: room.state.season,
      meeting: room.state.meeting ?? 1,
    },
  };
}

function rateLimit(userId) {
  const now = Date.now();
  const recent = (traffic.get(userId) ?? []).filter((t) => now - t < ACTION_WINDOW_MS);
  if (recent.length >= ACTION_LIMIT) throw httpError(429, "too many actions: wait a moment", "rate");
  recent.push(now);
  traffic.set(userId, recent);
}

/** Server-side clamps: the client may ask for a deadline, it may not set one. */
function clampClock(action) {
  if (action?.type !== "openWindow") return action;
  const asked = Number(action.endsAt);
  const now = Date.now();
  const seconds = Number.isFinite(asked) ? (asked - now) / 1000 : NaN;
  const bounded = Math.min(300, Math.max(10, Number.isFinite(seconds) ? seconds : 90));
  return { ...action, endsAt: now + Math.round(bounded) * 1000 };
}

function applyAuthoritative(userId, action) {
  const room = roomOf(userId);
  if (!room) throw httpError(404, "no room for this account", "noroom");
  if (!action || typeof action !== "object" || Array.isArray(action)) throw httpError(400, "an action is an object", "action");
  if (action.type === "advance") {
    throw httpError(400, "the meeting closes on the clock — enter your runners and wait", "clock");
  }
  const verdict = validateAction(room.state, userId, action);
  if (!verdict.ok) throw httpError(400, verdict.error ?? "invalid action", "refused");
  if (action.type === "closeWindow") {
    const clock = room.state.clock;
    if (clock && Date.now() < clock.endsAt) throw httpError(400, "the entries window is still open", "early");
  }
  const cleaned = clampClock(action);
  room.state = applyAction(room.state, userId, cleaned);
  room.version += 1;
  persistRoom(room).catch(() => {});
  return room;
}

/* ---------------------------------------------------------------- the market */

/** Every lot in every room, keyed by room and lot id. Built by reading the rooms, never cached. */
function catalogue() {
  const rows = [];
  for (const room of rooms.values()) {
    for (const listing of room.state.listings ?? []) {
      const horse = listing.kind === "horse" ? horseById(room.state, listing.horseId) : null;
      const sire = listing.straw ? horseById(room.state, listing.straw.sire) : null;
      rows.push({
        key: `${room.id}:${listing.id}`,
        roomId: room.id,
        roomCode: room.code,
        listingId: listing.id,
        kind: listing.kind === "horse" ? "horse" : "covering",
        price: listing.price,
        season: listing.season,
        seller: listing.seller,
        sellerName: members(room).get(listing.seller) ?? "the house",
        horseName: horse?.name ?? (sire ? `${sire.name} covering` : "lot"),
        horseId: horse?.id ?? null,
        lineage: horse?.lineage ?? sire?.lineage ?? null,
        age: horse?.age ?? null,
        value: horse?.value ?? sire?.value ?? null,
      });
    }
  }
  return rows.sort((a, b) => a.price - b.price);
}

/** Stable ids to the names a person reads. */
function members(room) {
  return new Map(room.state.stables.map((stable) => [stable.id, stable.name]));
}

/**
 * A sale across rooms. Two states change at once, which is exactly what the engine's own actions
 * cannot express — and exactly what a global market needs.
 */
function buyAcrossRooms(buyerId, roomId, listingId) {
  const sellerRoom = rooms.get(roomId);
  if (!sellerRoom) throw httpError(404, "no such room", "room");
  const buyerRoom = roomOf(buyerId);
  if (!buyerRoom) throw httpError(404, "no room for this account", "noroom");
  if (buyerRoom.id === sellerRoom.id) throw httpError(400, "that lot is in your own room", "same");

  const index = (sellerRoom.state.listings ?? []).findIndex((lot) => lot.id === listingId);
  if (index < 0) throw httpError(404, "that lot is gone", "lot");
  const listing = sellerRoom.state.listings[index];

  const buyer = stableOf(buyerRoom.state, buyerId);
  const seller = sellerRoom.state.stables.find((stable) => stable.id === listing.seller) ?? null;
  if (!buyer) throw httpError(409, "take a seat first", "noseat");
  if (seller && seller.player === buyerId) throw httpError(400, "that is your own lot", "own");
  if (buyer.guineas < listing.price) throw httpError(400, "not enough guineas", "money");

  const rake = Math.round(listing.price * 500 / 10_000); // the same 5% the in-room market charges

  if (listing.kind === "horse") {
    const horseIndex = sellerRoom.state.horses.findIndex((horse) => horse.id === listing.horseId);
    if (horseIndex < 0) throw httpError(409, "that horse has left the room", "horse");
    const [horse] = sellerRoom.state.horses.splice(horseIndex, 1);
    horse.owner = buyer.id;
    horse.listed = false;
    buyerRoom.state.horses.push(horse);
    buyer.horses.push(horse.id);
  } else {
    const straw = listing.straw;
    if (!straw) throw httpError(409, "that covering is gone", "straw");
    buyer.straws = [...(buyer.straws ?? []), { ...straw, id: `s${randStraw()}`, elite: Boolean(listing.select) }];
  }

  buyer.guineas -= listing.price;
  if (seller) {
    seller.guineas += listing.price - rake;
    seller.tally = { ...(seller.tally ?? { wins: 0, bred: 0 }), sold: (seller.tally?.sold ?? 0) + 1 };
  }
  sellerRoom.state.listings.splice(index, 1);
  buyer.tally = { ...(buyer.tally ?? { wins: 0, bred: 0 }) };

  scorePopulation(sellerRoom.state);
  scorePopulation(buyerRoom.state);
  sellerRoom.version += 1;
  buyerRoom.version += 1;
  persistRoom(sellerRoom).catch(() => {});
  persistRoom(buyerRoom).catch(() => {});
  return { roomId: sellerRoom.id, listingId, price: listing.price, rake, seller: seller?.id ?? null, buyer: buyer.id };
}

const randStraw = () => Math.floor(Math.random() * 1_000_000);

/* ------------------------------------------------------------------ minting */

/**
 * MINT_MODE=simulated signs with a key generated at boot and never touches a chain: the whole
 * flow — wallet, intent, signature, confirmation — can be exercised today, and the same call path
 * switches to the relayer once MINT_MODE=chain and the Sepolia keys are in place.
 */
const MINT_MODE = process.env.MINT_MODE === "chain" ? "chain" : "simulated";
const minterKey = MINT_MODE === "simulated"
  ? generateKeyPairSync("ec", { namedCurve: "secp256k1" })
  : null;
const simulatedAddress = minterKey
  ? `0x${createHash("sha256").update(minterKey.publicKey.export({ type: "spki", format: "der" })).digest("hex").slice(-40)}`
  : (process.env.MINTER_ADDRESS ?? null);
let simulatedMints = 900_000;
let mintNonce = 0;

/** The bytes a mint signs: the animal, its parents and a nonce that never repeats. */
function mintPayload(intent, nonce) {
  return {
    nullifier: intent.nullifier,
    genome: intent.genome,
    lineage: intent.lineage,
    sex: intent.sex,
    bornSeason: intent.bornSeason,
    sireId: intent.sireId,
    damId: intent.damId,
    nonce,
  };
}

const digestOf = (payload) => createHash("sha256").update(JSON.stringify(payload)).digest();

function signPayload(payload) {
  if (MINT_MODE !== "simulated") {
    // the real relayer signs the same bytes with the Sepolia key; wired when MINT_MODE=chain
    throw httpError(501, "the chain relayer is not wired yet — set MINT_MODE=simulated to test", "mode");
  }
  return sign(null, digestOf(payload), minterKey.privateKey).toString("hex");
}

/* ---------------------------------------------------------------- routing */

function staticType(path) {
  return (
    { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".md": "text/markdown; charset=utf-8" }[extname(path)] ?? "application/octet-stream"
  );
}

async function serveStatic(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, rel === "/" || rel === "" ? "index.html" : rel);
  if (!file.startsWith(root)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": staticType(file), "cache-control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}

const bearer = (req) => {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

function requireUser(req) {
  const token = bearer(req);
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt < Date.now()) throw httpError(401, "sign in again", "auth");
  const user = users.get(session.userId);
  if (!user) throw httpError(401, "sign in again", "auth");
  return user;
}

const server = createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (!path.startsWith("/api/")) return serveStatic(req, res);

  try {
    if (path === "/api/health" && req.method === "GET") {
      return send(res, 200, { ok: true, game: meta.game, accounts: users.size, cloud: true, uptime: Math.round(process.uptime()) });
    }

    if ((path === "/api/register" || path === "/api/login") && req.method === "POST") {
      const body = await readBody(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      if (path === "/api/register") {
        const user = createAccount(email, body.password);
        await persistUsers();
        await persistRoom(roomOf(user.id));
        const token = openSession(user);
        const devCode = deliver(user.email, user.verifyCode, "verify");
        return send(res, 201, {
          token,
          user: { id: user.id, email: user.email, verified: false },
          devCode,
          state: frame(roomOf(user.id), user.id),
        });
      }
      const id = emails.get(email);
      const user = id ? users.get(id) : null;
      if (!user || !checkPassword(user, body.password)) throw httpError(401, "wrong email or password", "credentials");
      const token = openSession(user);
      return send(res, 200, { token, user: { id: user.id, email: user.email }, state: frame(roomOf(user.id) ?? openRoom(user.id), user.id) });
    }

    if (path === "/api/ranking" && req.method === "GET") {
      // Across every account: the table is public, the emails are not.
      const rows = [];
      for (const room of rooms.values()) {
        for (const stable of room.state.stables) {
          const horses = (stable.horses ?? []).map((id) => horseById(room.state, id)).filter(Boolean);
          rows.push({
            stable: stable.name,
            household: stable.id.startsWith("ai"),
            wins: horses.reduce((n, horse) => n + (horse.wins ?? 0), 0),
            prizes: Math.round(horses.reduce((n, horse) => n + (horse.earnings ?? 0), 0)),
            horses: horses.length,
            account: stable.player ? `#${stable.player.slice(-4)}` : null,
          });
        }
      }
      rows.sort((a, b) => b.prizes - a.prizes || b.wins - a.wins);
      return send(res, 200, { ranking: rows.slice(0, 20), accounts: users.size });
    }

    if (path === "/api/verify" && req.method === "POST") {
      const user = requireUser(req);
      const body = await readBody(req);
      const code = String(body.code ?? "").trim();
      if (!user.verifyCode || Date.now() > (user.verifyExpires ?? 0)) {
        throw httpError(400, "the code has expired — ask for another", "expired");
      }
      if (code !== user.verifyCode) throw httpError(400, "that is not the code", "code");
      user.verified = true;
      user.verifyCode = null;
      user.verifyExpires = null;
      await persistUsers();
      return send(res, 200, { verified: true, user: { id: user.id, email: user.email, verified: true } });
    }

    if (path === "/api/recover" && req.method === "POST") {
      const body = await readBody(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      const user = users.get(emails.get(email));
      // Never say whether an account exists: the answer is the same either way.
      let devCode = null;
      if (user) {
        user.resetCode = newCode6();
        user.resetExpires = Date.now() + CODE_MINUTES * 60_000;
        await persistUsers();
        devCode = deliver(email, user.resetCode, "reset");
      }
      return send(res, 200, { sent: true, devCode });
    }

    if (path === "/api/reset" && req.method === "POST") {
      const body = await readBody(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      const user = users.get(emails.get(email));
      const code = String(body.code ?? "").trim();
      const password = String(body.password ?? "");
      if (!user || !user.resetCode || Date.now() > (user.resetExpires ?? 0) || code !== user.resetCode) {
        throw httpError(400, "that code is not valid for this address", "code");
      }
      if (password.length < 8) throw httpError(400, "a password is at least 8 characters", "password");
      user.salt = randomBytes(16).toString("hex");
      user.hash = hashPassword(password, user.salt);
      user.resetCode = null;
      user.resetExpires = null;
      await persistUsers();
      // Every old session dies with the old password.
      for (const [token, session] of sessions) {
        if (session.userId === user.id) sessions.delete(token);
      }
      persistSessions().catch(() => {});
      const token = openSession(user);
      return send(res, 200, { token, user: { id: user.id, email: user.email } });
    }

    if (path === "/api/me" && req.method === "GET") {
      const user = requireUser(req);
      return send(res, 200, {
        user: { id: user.id, email: user.email, verified: Boolean(user.verified) },
        state: frame(roomOf(user.id), user.id),
      });
    }

    if (path === "/api/action" && req.method === "POST") {
      const user = requireUser(req);
      rateLimit(user.id);
      const body = await readBody(req);
      const room = applyAuthoritative(user.id, body.action);
      return send(res, 200, { state: frame(room, user.id) });
    }

    if (path === "/api/wallet" && req.method === "POST") {
      const user = requireUser(req);
      const body = await readBody(req);
      const address = String(body.address ?? "").trim();
      if (!isAddress(address)) throw httpError(400, "that is not an address", "address");
      user.wallet = address;
      await persistUsers();
      // whatever was unclaimed for this account becomes claimable now
      for (const intent of mints.values()) {
        if (intent.owner === user.id && !intent.address) {
          intent.address = address;
          intent.status = "pending";
        }
      }
      return send(res, 200, { wallet: address });
    }

    if (path === "/api/minter" && req.method === "GET") {
      return send(res, 200, {
        mode: MINT_MODE,
        address: simulatedAddress,
        publicKey:
          MINT_MODE === "simulated"
            ? minterKey.publicKey.export({ type: "spki", format: "pem" }).toString()
            : null,
        note:
          MINT_MODE === "simulated"
            ? "simulated: signatures are real ECDSA, nothing is broadcast, no chain involved"
            : "chain: set the Sepolia keys before minting",
      });
    }

    if (path === "/api/mints/sign" && req.method === "POST") {
      const user = requireUser(req);
      rateLimit(user.id);
      const body = await readBody(req);
      const nullifier = String(body.nullifier ?? "");
      const intent = mints.get(nullifier);
      if (!intent || intent.owner !== user.id) throw httpError(404, "no such mint", "mint");
      if (intent.status === "minted") throw httpError(409, "that horse is already on chain", "done");
      if (!intent.address) throw httpError(409, "bind a wallet first", "unclaimed");
      const nonce = ++mintNonce;
      const payload = mintPayload(intent, nonce);
      const signature = signPayload(payload);
      intent.signature = signature;
      intent.payload = payload;
      intent.signedAt = new Date().toISOString();
      return send(res, 200, { mode: MINT_MODE, payload, signature, minter: simulatedAddress });
    }

    if (path === "/api/mints" && req.method === "GET") {
      const user = requireUser(req);
      const mine = [...mints.values()].filter((intent) => intent.owner === user.id);
      return send(res, 200, {
        mints: mine,
        pending: mine.filter((intent) => intent.status === "pending").length,
        minted: mine.filter((intent) => intent.status === "minted").length,
      });
    }

    if (path === "/api/mints/confirm" && req.method === "POST") {
      const user = requireUser(req);
      const body = await readBody(req);
      const nullifier = String(body.nullifier ?? "");
      let tokenId = Number(body.tokenId);
      const intent = mints.get(nullifier);
      if (!intent || intent.owner !== user.id) throw httpError(404, "no such mint", "mint");
      if (intent.status === "minted") throw httpError(409, "that horse is already on chain", "done");
      if (!intent.address) throw httpError(409, "bind a wallet first", "unclaimed");
      if (MINT_MODE === "simulated" && (!Number.isInteger(tokenId) || tokenId <= 0)) {
        tokenId = ++simulatedMints; // the chain would return this from the receipt
        intent.txHash = `sim:${createHash("sha256").update(intent.nullifier + tokenId).digest("hex").slice(0, 40)}`;
      } else if (!Number.isInteger(tokenId) || tokenId <= 0) {
        throw httpError(400, "a token id is required", "token");
      }
      intent.tokenId = tokenId;
      intent.status = "minted";
      intent.mintMode = MINT_MODE;
      return send(res, 200, { mint: intent });
    }

    if (path === "/api/market" && req.method === "GET") {
      const rows = catalogue();
      return send(res, 200, { lots: rows, rooms: new Set(rows.map((row) => row.roomCode)).size });
    }

    if (path === "/api/market/buy" && req.method === "POST") {
      const user = requireUser(req);
      rateLimit(user.id);
      const body = await readBody(req);
      const roomId = String(body.roomId ?? "");
      const listingId = String(body.listingId ?? "");
      const sale = buyAcrossRooms(user.id, roomId, listingId);
      return send(res, 200, { sale, state: frame(roomOf(user.id), user.id) });
    }

    if (path === "/api/room" && req.method === "GET") {
      const user = requireUser(req);
      const room = roomOf(user.id);
      if (!room) throw httpError(404, "no room", "noroom");
      return send(res, 200, { state: frame(room, user.id) });
    }

    if (path === "/api/room/join" && req.method === "POST") {
      const user = requireUser(req);
      const body = await readBody(req);
      const code = String(body.code ?? "").trim().toUpperCase();
      const target = [...rooms.values()].find((room) => room.code === code);
      if (!target) throw httpError(404, "no room with that code", "code");
      if ((target.state.players ?? []).length >= 12) throw httpError(409, "that room is full", "full");
      const current = roomOf(user.id);
      if (current && current.id !== target.id) {
        // leave the old room; if it was only yours, take it with you
        current.state.players = (current.state.players ?? []).filter((id) => id !== user.id);
        current.state.stables = current.state.stables.filter((stable) => stable.player !== user.id);
        if (!current.state.players.length) {
          rooms.delete(current.id);
          await rm(join(roomDir, `${current.id}.json`), { force: true });
        } else {
          await persistRoom(current);
        }
      }
      if (current && current.id === target.id) return send(res, 200, { state: frame(target, user.id) });
      target.state = applyAction(target.state, user.id, { type: "takeSeat" });
      target.state.players = [...(target.state.players ?? []), user.id];
      userRoom.set(user.id, target.id);
      rearm(target);
      target.version += 1;
      await persistRoom(target);
      return send(res, 200, { state: frame(target, user.id) });
    }

    if (path === "/api/logout" && req.method === "POST") {
      const token = bearer(req);
      if (token) {
        sessions.delete(token);
        persistSessions().catch(() => {});
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "no such endpoint" });
  } catch (error) {
    const status = error.status ?? 500;
    if (status >= 500) console.error("server error:", error);
    return send(res, status, { error: error.message ?? "server error", code: error.code ?? "error" });
  }
});

/** The world turns here: a closed meeting is resolved by the server, for everyone in the room. */
async function tick() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.closesAt > now) continue;
    try {
      room.state = runRound(room.state, "The clock ran out —");
      issueMints(room); // a foal born this turn becomes an intent, once
      room.version += 1;
      rearm(room);
      await persistRoom(room);
    } catch (error) {
      console.error("turn failed for", room.id, error.message);
      rearm(room);
    }
  }
}

await loadAll();
setInterval(() => {
  tick().catch((error) => console.error("tick:", error.message));
}, 2000);
server.listen(port, () => {
  console.log(`studbook server on http://127.0.0.1:${port} · ${users.size} account(s) · data in ${dataDir}`);
});

/** A test harness can import the pieces without opening a port twice. */
export { server, applyAuthoritative, createServer as _createServer };
