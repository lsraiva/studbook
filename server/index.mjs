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
 * Env: PORT, DATA_DIR, ALLOWED_ORIGINS, ACTION_LIMIT, ACTION_WINDOW_MS,
 *      AUTH_IP_LIMIT, LOGIN_FAIL_LIMIT, AUTH_WINDOW_MS, CODE_ATTEMPTS
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
import { mkdir, readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { publicAsset, sendAsset } from "./public-files.mjs";
import { planRoomTransfer } from "./room-transfer.mjs";
import { writeJsonDurable, roomSnapshots, commitRoomTransfer, recoverRoomTransfers } from "./transfer-store.mjs";
import { createWindowLimiter, clientAddress, sameCode } from "./auth-guard.mjs";
import { prepareExhibition, runExhibition, cleanRide } from "../assets/race/exhibition.js";

import {
  LOCI as LOCUS_ORDER,
  applyAction,
  scorePopulation,
  horseById,
  meta,
  runRound,
  setRaceEngine,
  setup,
  stableOf,
  validateAction,
  viewFor,
} from "../assets/engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
/** One source of truth for the release label: package.json. The commit comes from the image build
 * (COMMIT_SHA build arg → STUDBOOK_RELEASE_SHA); a build without it reports null, never a fake id. */
const RELEASE_VERSION = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const RELEASE_SHA = /^[0-9a-f]{7,40}$/.test(process.env.STUDBOOK_RELEASE_SHA ?? "") ? process.env.STUDBOOK_RELEASE_SHA : null;
const dataDir = process.env.DATA_DIR ?? join(here, "data");
const port = Number(process.env.PORT ?? 8787);
const maintenanceMode = process.env.STUDBOOK_MAINTENANCE === "1";
// F0-02: how official results are decided. Unset leaves every room as it is (legacy unless a room
// was switched before); "causal" or "legacy" applies to every room from its next meeting on.
const RACE_ENGINE = ["causal", "legacy"].includes(process.env.STUDBOOK_RACE_ENGINE) ? process.env.STUDBOOK_RACE_ENGINE : null;
const origins = (process.env.ALLOWED_ORIGINS ?? "*").split(",").map((o) => o.trim());
const ACTION_LIMIT = Number(process.env.ACTION_LIMIT ?? 40);
const ACTION_WINDOW_MS = Number(process.env.ACTION_WINDOW_MS ?? 10_000);
const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 30);
const MAX_BODY = 16 * 1024;
/** F1-06: every unauthenticated account endpoint shares one per-address budget; wrong passwords
 * are additionally counted per email, and a mailed code dies after a few wrong guesses. */
const AUTH_WINDOW_MS = Number(process.env.AUTH_WINDOW_MS ?? 15 * 60_000);
const AUTH_IP_LIMIT = Number(process.env.AUTH_IP_LIMIT ?? 60);
const LOGIN_FAIL_LIMIT = Number(process.env.LOGIN_FAIL_LIMIT ?? 5);
const CODE_ATTEMPTS = Number(process.env.CODE_ATTEMPTS ?? 5);
const authByAddress = createWindowLimiter({ limit: AUTH_IP_LIMIT, windowMs: AUTH_WINDOW_MS });
const loginFailures = createWindowLimiter({ limit: LOGIN_FAIL_LIMIT, windowMs: AUTH_WINDOW_MS });

/* ---------------------------------------------------------------- storage */

const users = new Map();   // id -> { id, email, salt, hash, createdAt }
const emails = new Map();  // email -> id
const sessions = new Map(); // token -> { userId, expiresAt }
const rooms = new Map();   // roomId -> { id, code, state, closesAt, version }
const mints = new Map();   // nullifier -> { roomId, horseId, owner, address, bornSeason, tokenId|null, status }
const userRoom = new Map(); // userId -> roomId
const traffic = new Map(); // userId -> number[] (action timestamps)
const roomLocks = new Set();
let storageFault = false;
function assertRoomsWritable(...ids) {
  if (storageFault) throw httpError(503, "storage recovery required; writes are paused", "storage");
  if (ids.some((id) => roomLocks.has(id))) throw httpError(409, "room transfer in progress; retry shortly", "busy");
}

const userFile = join(dataDir, "users.json");
const sessionFile = join(dataDir, "sessions.json");
const roomDir = join(dataDir, "rooms");
const transferDir = join(dataDir, "room-transfers");
/** A meeting closes on a clock, never on a click. Rooms with a second human are given longer. */
const MEETING_SECONDS = Number(process.env.MEETING_SECONDS ?? 43_200); // 12 h
const SOLO_SECONDS = Number(process.env.SOLO_SECONDS ?? 120);          // two minutes alone

async function writeJsonAtomic(path, value) {
  return writeJsonDurable(path, value);
}

async function loadAll() {
  try {
    for (const user of JSON.parse(await readFile(userFile, "utf8"))) {
      users.set(user.id, user);
      emails.set(user.email, user.id);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error; // corruption is not an empty new game
  }
  try {
    const saved = JSON.parse(await readFile(sessionFile, "utf8"));
    for (const [token, session] of Object.entries(saved)) {
      if (session.expiresAt > Date.now()) sessions.set(token, session);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error; // corruption is not an empty new game
  }
  try {
    await mkdir(roomDir, { recursive: true });
  } catch {
    /* exists */
  }
  try {
    const files = await readdir(roomDir);
    const written = new Set(files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
    // A crash between writing the temp file and renaming it leaves only the temp: recover instead of
    // losing a room, because the alternative is a player who comes back with a fresh stable.
    const recover = files.filter((f) => {
      const match = f.match(/^(.*)\.json\.[0-9]+\.tmp$/);
      return match && !written.has(match[1]);
    });
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const room = JSON.parse(await readFile(join(roomDir, file), "utf8"));
      rooms.set(room.id, room);
      for (const player of room.state.players ?? []) userRoom.set(player, room.id);
    }
    for (const file of recover) {
      const room = JSON.parse(await readFile(join(roomDir, file), "utf8"));
      rooms.set(room.id, room);
      for (const player of room.state.players ?? []) userRoom.set(player, room.id);
      await writeJsonAtomic(join(roomDir, `${room.id}.json`), room);
      console.log("recovered room from a partial write:", room.id);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error; // corruption is not an empty new game
  }
}

const writeUsersFile = () => writeJsonAtomic(userFile, [...users.values()]);
/** Accounts are acknowledged only once durable. A failed write leaves memory ahead of disk,
 * so writes pause until an operator reconciles — the same rule rooms already follow. */
async function persistUsers() {
  try {
    await writeUsersFile();
  } catch (error) {
    storageFault = true;
    console.error("users write failed:", error.message);
    throw httpError(503, "save interrupted; writes paused pending recovery", "storage");
  }
}
/** Losing a session only means signing in again, so this stays best-effort — but it is logged. */
const persistSessions = () =>
  writeJsonAtomic(sessionFile, Object.fromEntries(sessions)).catch((error) => console.error("sessions write failed:", error.message));
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
    .update(`studbook:${horse.originRoomId ?? room.id}:${horse.id}:${horse.sire ?? 0}:${horse.dam ?? 0}:${horse.bornSeason ?? 0}`)
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

/** Undo an account whose first save failed, so nothing unsaved is ever served as real. */
function forgetAccount(user) {
  const roomId = userRoom.get(user.id);
  users.delete(user.id);
  emails.delete(user.email);
  userRoom.delete(user.id);
  if (roomId) rooms.delete(roomId);
  for (const [nullifier, intent] of mints) if (intent.owner === user.id) mints.delete(nullifier);
}

const DUMMY_SALT = randomBytes(16).toString("hex");
function checkPassword(user, password) {
  if (!user) {
    hashPassword(String(password ?? ""), DUMMY_SALT); // same cost whether or not the email exists
    return false;
  }
  const attempt = Buffer.from(hashPassword(String(password ?? ""), user.salt), "hex");
  const known = Buffer.from(user.hash, "hex");
  return attempt.length === known.length && timingSafeEqual(attempt, known);
}

function openSession(user) {
  const token = newToken();
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_DAYS * 86_400_000 });
  persistSessions();
  return token;
}

/** Throws 429 when this address has spent its account-endpoint budget; otherwise spends one. */
function spendAuthBudget(req) {
  const key = `ip:${clientAddress(req)}`;
  const wait = authByAddress.retryAfter(key);
  if (wait) throw Object.assign(httpError(429, "too many attempts: wait a few minutes", "rate"), { retryAfter: wait });
  authByAddress.hit(key);
}

/** A mailed code survives CODE_ATTEMPTS wrong guesses, then must be requested again. */
function checkMailedCode(user, field, given) {
  const expires = field === "verifyCode" ? "verifyExpires" : "resetExpires";
  const attempts = field === "verifyCode" ? "verifyAttempts" : "resetAttempts";
  if (!user?.[field] || Date.now() > (user[expires] ?? 0)) return "expired";
  if (sameCode(given, user[field])) return "ok";
  user[attempts] = (user[attempts] ?? 0) + 1;
  if (user[attempts] >= CODE_ATTEMPTS) {
    user[field] = null;
    user[expires] = null;
    user[attempts] = 0;
    return "burned";
  }
  return "wrong";
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

/** Exhibitions being ridden: user id -> { session, prep, at }. Memory only, one per player. */
const rides = new Map();
const RIDE_TTL_MS = 15 * 60 * 1000;
const RIDE_LIMIT = 90; // orders per minute: a ride is a few dozen presses at most
const rideTraffic = new Map();
function rideLimit(userId) {
  const now = Date.now();
  const recent = (rideTraffic.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= RIDE_LIMIT) throw httpError(429, "too many actions: wait a moment", "rate");
  recent.push(now);
  rideTraffic.set(userId, recent);
  // forget rides nobody came back to
  for (const [id, held] of rides) if (now - held.at > RIDE_TTL_MS) rides.delete(id);
}

function rateLimit(userId) {
  const now = Date.now();
  const recent = (traffic.get(userId) ?? []).filter((t) => now - t < ACTION_WINDOW_MS);
  if (recent.length >= ACTION_LIMIT) throw httpError(429, "too many actions: wait a moment", "rate");
  recent.push(now);
  traffic.set(userId, recent);
}

async function applyAuthoritative(userId, action) {
  const room = roomOf(userId);
  if (!room) throw httpError(404, "no room for this account", "noroom");
  assertRoomsWritable(room.id);
  if (!action || typeof action !== "object" || Array.isArray(action)) throw httpError(400, "an action is an object", "action");
  if (action.type === "startOver") {
    // an online stable is permanent: its horses, balance and pedigrees are never wiped
    throw httpError(400, "online your stable is permanent — starting over is only in the offline demo", "permanent");
  }
  if (["advance", "openWindow", "closeWindow"].includes(action.type)) {
    throw httpError(400, "the meeting closes on the clock — enter your runners and wait", "clock");
  }
  const verdict = validateAction(room.state, userId, action);
  if (!verdict.ok) throw httpError(400, verdict.error ?? "invalid action", "refused");
  const updated = { ...room, state: applyAction(room.state, userId, action), version: room.version + 1 };
  roomLocks.add(room.id);
  try {
    await persistRoom(updated);
    rooms.set(room.id, updated);
    return updated;
  } catch {
    storageFault = true;
    throw httpError(503, "save interrupted; writes paused pending recovery", "storage");
  } finally { roomLocks.delete(room.id); }
}

/* ---------------------------------------------------------------- the market */

/** Every lot in every room, keyed by room and lot id. Built by reading the rooms, never cached. */
function catalogue() {
  const rows = [];
  for (const room of rooms.values()) {
    if (!humanSeats(room)) continue;
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
async function buyAcrossRooms(buyerId, roomId, listingId) {
  const liveSeller = rooms.get(roomId);
  if (!liveSeller) throw httpError(404, "no such room", "room");
  const liveBuyer = roomOf(buyerId);
  if (!liveBuyer) throw httpError(404, "no room for this account", "noroom");
  assertRoomsWritable(liveSeller.id, liveBuyer.id);
  if (liveBuyer.id === liveSeller.id) throw httpError(400, "that lot is in your own room", "same");
  // Work on copies: the live rooms change only after the sale is journaled (F1-06).
  const sellerRoom = structuredClone(liveSeller);
  const buyerRoom = structuredClone(liveBuyer);

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
  // Two rooms change together: the same durable journal as a room transfer is the commit point,
  // so a crash between the two room files is replayed on start instead of losing or doubling money.
  roomLocks.add(sellerRoom.id); roomLocks.add(buyerRoom.id);
  try {
    let committed;
    try {
      committed = await commitRoomTransfer({
        directory: transferDir, snapshots: [sellerRoom, buyerRoom], userId: buyerId, writeRoom: persistRoom,
        publish: (states) => { for (const room of states) rooms.set(room.id, room); },
      });
    } catch (error) {
      storageFault = true;
      console.error("sale journal failed:", error.message);
      throw httpError(503, "sale interrupted; writes paused pending recovery", "storage");
    }
    if (!committed.materialized) storageFault = true; // journaled: replayed on restart
  } finally {
    roomLocks.delete(sellerRoom.id); roomLocks.delete(buyerRoom.id);
  }
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

async function serveStatic(req, res) {
  if (!["GET", "HEAD"].includes(req.method ?? "")) {
    return res.writeHead(405, { allow: "GET, HEAD" }).end();
  }
  const asset = await publicAsset(root, (req.url ?? "/").split("?")[0]);
  sendAsset(req, res, asset);
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
  if (maintenanceMode && req.method === "POST") return send(res, 503, { error: "maintenance: writes are temporarily paused", code: "maintenance" });
  if (storageFault && req.method === "POST") return send(res, 503, { error: "storage recovery required; writes are paused", code: "storage" });

  try {
    if (path === "/api/health" && req.method === "GET") {
      // The public answer says the game is up and which version runs. How many accounts exist,
      // the exact commit and the uptime are for the operator: only a request made on the
      // machine itself (loopback, not through the Fly edge) gets them — `fly ssh console` then
      // `wget -qO- localhost:PORT/api/health`.
      const publicHealth = { ok: true, game: meta.game, cloud: true, version: RELEASE_VERSION, maintenance: maintenanceMode };
      const onMachine = /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(req.socket?.remoteAddress ?? "") && !req.headers["fly-client-ip"];
      return send(res, 200, onMachine
        ? { ...publicHealth, accounts: users.size, revision: RELEASE_SHA, uptime: Math.round(process.uptime()) }
        : publicHealth);
    }

    if ((path === "/api/register" || path === "/api/login") && req.method === "POST") {
      spendAuthBudget(req);
      const body = await readBody(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      if (path === "/api/register") {
        const user = createAccount(email, body.password);
        try {
          await writeUsersFile();
          await persistRoom(roomOf(user.id));
        } catch (error) {
          // Nothing was acknowledged yet: undo in memory and drop the account from disk again.
          forgetAccount(user);
          await writeUsersFile().catch((again) => {
            storageFault = true;
            console.error("users rollback failed:", again.message);
          });
          console.error("register write failed:", error.message);
          throw httpError(503, "could not save the new stable; try again shortly", "storage");
        }
        const token = openSession(user);
        const devCode = deliver(user.email, user.verifyCode, "verify");
        return send(res, 201, {
          token,
          user: { id: user.id, email: user.email, verified: false },
          devCode,
          state: frame(roomOf(user.id), user.id),
        });
      }
      const failKey = `email:${email}`;
      const wait = loginFailures.retryAfter(failKey);
      if (wait) throw Object.assign(httpError(429, "too many wrong passwords: wait a few minutes", "locked"), { retryAfter: wait });
      const id = emails.get(email);
      const user = id ? users.get(id) : null;
      if (!checkPassword(user, body.password)) {
        loginFailures.hit(failKey); // unknown emails count too, so the lockout reveals nothing
        throw httpError(401, "wrong email or password", "credentials");
      }
      loginFailures.clear(failKey);
      const token = openSession(user);
      return send(res, 200, { token, user: { id: user.id, email: user.email }, state: frame(roomOf(user.id) ?? openRoom(user.id), user.id) });
    }

    if (path === "/api/ranking" && req.method === "GET") {
      // Across every account: the table is public, the emails are not.
      const rows = [];
      for (const room of rooms.values()) {
        if (!humanSeats(room)) continue;
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
      spendAuthBudget(req);
      const user = requireUser(req);
      const body = await readBody(req);
      const code = String(body.code ?? "").trim();
      const outcome = checkMailedCode(user, "verifyCode", code);
      if (outcome === "expired") throw httpError(400, "the code has expired — ask for another", "expired");
      if (outcome !== "ok") {
        await persistUsers(); // the attempt counter must survive a restart
        if (outcome === "burned") throw httpError(400, "too many wrong codes — ask for another", "expired");
        throw httpError(400, "that is not the code", "code");
      }
      user.verifyAttempts = 0;
      user.verified = true;
      user.verifyCode = null;
      user.verifyExpires = null;
      await persistUsers();
      return send(res, 200, { verified: true, user: { id: user.id, email: user.email, verified: true } });
    }

    if (path === "/api/recover" && req.method === "POST") {
      spendAuthBudget(req);
      const body = await readBody(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      const user = users.get(emails.get(email));
      // Never say whether an account exists: the answer is the same either way.
      let devCode = null;
      if (user) {
        user.resetCode = newCode6();
        user.resetExpires = Date.now() + CODE_MINUTES * 60_000;
        user.resetAttempts = 0;
        await persistUsers();
        devCode = deliver(email, user.resetCode, "reset");
      }
      return send(res, 200, { sent: true, devCode });
    }

    if (path === "/api/reset" && req.method === "POST") {
      spendAuthBudget(req);
      const body = await readBody(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      const user = users.get(emails.get(email));
      const code = String(body.code ?? "").trim();
      const password = String(body.password ?? "");
      if (password.length < 8) throw httpError(400, "a password is at least 8 characters", "password");
      const outcome = user ? checkMailedCode(user, "resetCode", code) : "expired";
      if (outcome !== "ok") {
        if (outcome === "wrong" || outcome === "burned") await persistUsers();
        throw httpError(400, "that code is not valid for this address", "code");
      }
      user.resetAttempts = 0;
      loginFailures.clear(`email:${email}`);
      user.salt = randomBytes(16).toString("hex");
      user.hash = hashPassword(password, user.salt);
      user.resetCode = null;
      user.resetExpires = null;
      await persistUsers();
      // Every old session dies with the old password.
      for (const [token, session] of sessions) {
        if (session.userId === user.id) sessions.delete(token);
      }
      persistSessions();
      const token = openSession(user);
      return send(res, 200, { token, user: { id: user.id, email: user.email } });
    }

    if (path === "/api/me" && req.method === "GET") {
      const user = requireUser(req);
      const room = roomOf(user.id);
      if (!room) throw httpError(409, "no stable linked to this account; sign in again to initialize it", "noroom");
      return send(res, 200, {
        user: { id: user.id, email: user.email, verified: Boolean(user.verified) },
        state: frame(room, user.id),
      });
    }

    if (path === "/api/action" && req.method === "POST") {
      const user = requireUser(req);
      rateLimit(user.id);
      const body = await readBody(req);
      const room = await applyAuthoritative(user.id, body.action);
      return send(res, 200, { state: frame(room, user.id) });
    }

    if (path === "/api/wallet" && req.method === "POST") {
      const user = requireUser(req);
      const body = await readBody(req);
      assertRoomsWritable(userRoom.get(user.id));
      const address = String(body.address ?? "").trim();
      if (!isAddress(address)) throw httpError(400, "that is not an address", "address");
      // A mint already signed for the old address would land on the wrong wallet.
      const inFlight = [...mints.values()].some((m) => m.owner === user.id && m.status === "pending");
      if (user.wallet && user.wallet !== address && inFlight) {
        throw httpError(409, "a mint is in flight — wait for it before changing the address", "inflight");
      }
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
      assertRoomsWritable(userRoom.get(user.id));
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
      assertRoomsWritable(userRoom.get(user.id));
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
      const sale = await buyAcrossRooms(user.id, roomId, listingId);
      return send(res, 200, { sale, state: frame(roomOf(user.id), user.id) });
    }

    // An exhibition: the declared field run through the causal engine, positions only. It reads
    // the room and writes nothing, so it stays available in maintenance; a fresh seed each time.
    if (path === "/api/race/exhibition" && req.method === "GET") {
      const user = requireUser(req);
      rateLimit(user.id);
      const room = roomOf(user.id);
      if (!room) throw httpError(404, "no room for this account", "noroom");
      const prep = prepareExhibition(room.state, { seed: randomBytes(16).toString("hex"), mine: stableOf(room.state, user.id)?.id ?? "-" });
      if (!prep) throw httpError(409, "declare at least two runners first", "field");
      // The field as it stood is kept in memory for a while, so the player can ride it: each
      // order re-runs this same race. It holds traits, so it never leaves the server.
      const session = randomBytes(8).toString("hex");
      rides.set(user.id, { session, prep, at: Date.now() });
      return send(res, 200, { race: { ...runExhibition(prep), session } });
    }

    // Riding the exhibition: the caller's own runner takes these orders and the same race is
    // run again. Reads memory only and writes nothing: no result, money or record changes.
    if (path === "/api/race/ride" && req.method === "POST") {
      const user = requireUser(req);
      rideLimit(user.id);
      const body = await readBody(req);
      const held = rides.get(user.id);
      if (!held || held.session !== body.session || Date.now() - held.at > RIDE_TTL_MS) {
        throw httpError(409, "that race is over — open the live race again", "ride");
      }
      const ride = cleanRide(held.prep, { key: body.key, inputs: body.inputs });
      if (!ride) throw httpError(400, "you can only ride your own runner", "ride");
      return send(res, 200, { race: { ...runExhibition(held.prep, { ride }), session: held.session } });
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
      const current = roomOf(user.id);
      if (!current) throw httpError(404, "no room for this account", "noroom");
      assertRoomsWritable(current.id, target.id);
      if (current.id === target.id) return send(res, 200, { state: frame(target, user.id) });
      rateLimit(user.id);
      if (!humanSeats(target)) throw httpError(409, "that room is archived", "archived");
      if (user.wallet) throw httpError(409, "wallet-bound transfers require token reconciliation", "mint");
      roomLocks.add(current.id); roomLocks.add(target.id);
      try {
        let plan;
        try {
          plan = planRoomTransfer({ source: current, target, userId: user.id, now: Date.now(), mintIntents: [...mints.values()] });
        } catch (error) { throw httpError(409, error.message, error.code ?? "transfer"); }
        const snapshots = roomSnapshots(plan, current, target, Date.now() + MEETING_SECONDS * 1000);
        for (const room of snapshots) scorePopulation(room.state);
        let committed;
        try {
          committed = await commitRoomTransfer({
            directory: transferDir, snapshots, userId: user.id, writeRoom: persistRoom,
            publish: (states) => {
              for (const room of states) rooms.set(room.id, room);
              userRoom.set(user.id, target.id);
              for (const intent of mints.values()) if (intent.owner === user.id) intent.roomId = target.id;
            },
          });
        } catch {
          storageFault = true; // an uncertain journal commit must be recovered before any retry
          throw httpError(503, "transfer interrupted; writes paused pending recovery", "storage");
        }
        if (!committed.materialized) storageFault = true;
        return send(res, 200, { state: frame(rooms.get(target.id), user.id), storageRecoveryRequired: storageFault });
      } finally {
        roomLocks.delete(current.id); roomLocks.delete(target.id);
      }
    }

    if (path === "/api/logout" && req.method === "POST") {
      const token = bearer(req);
      if (token) {
        sessions.delete(token);
        persistSessions();
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "no such endpoint" });
  } catch (error) {
    const status = error.status ?? 500;
    if (status >= 500) console.error("server error:", error);
    if (error.retryAfter) res.setHeader("retry-after", String(error.retryAfter));
    return send(res, status, { error: error.message ?? "server error", code: error.code ?? "error" });
  }
});

/** The world turns here: a closed meeting is resolved by the server, for everyone in the room. */
async function tick() {
  if (storageFault || maintenanceMode) return;
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.closesAt > now || !humanSeats(room) || roomLocks.has(room.id)) continue;
    roomLocks.add(room.id);
    let next;
    try {
      // runRound mutates what it is given: resolve a copy so a failed save leaves the room untouched.
      const draft = structuredClone(room.state);
      if (RACE_ENGINE) setRaceEngine(draft, RACE_ENGINE);
      next = { ...room, state: runRound(draft, "The clock ran out —"), version: room.version + 1 };
      rearm(next);
    } catch (error) {
      console.error("turn failed for", room.id, error.message);
      rearm(room);
      roomLocks.delete(room.id);
      continue;
    }
    try {
      await persistRoom(next);
      rooms.set(room.id, next);
      issueMints(next); // a foal born this turn becomes an intent, once — only after it is saved
    } catch (error) {
      // Disk may now hold either version; stop all writes until an operator reconciles.
      storageFault = true;
      console.error("turn save failed for", room.id, error.message);
    } finally {
      roomLocks.delete(room.id);
    }
  }
}

await loadAll();
await recoverRoomTransfers({ directory: transferDir, rooms, writeRoom: persistRoom });
userRoom.clear();
for (const room of rooms.values()) {
  for (const player of room.state.players ?? []) {
    if (userRoom.has(player)) throw new Error("Conflicting room membership; recovery required");
    userRoom.set(player, room.id);
  }
}
setInterval(() => {
  tick().catch((error) => console.error("tick:", error.message));
}, 2000);
server.listen(port, () => {
  console.log(`studbook server on http://127.0.0.1:${port} · ${users.size} account(s) · data in ${dataDir}`);
});

/** A test harness can import the pieces without opening a port twice. */
export { server, applyAuthoritative, createServer as _createServer };
