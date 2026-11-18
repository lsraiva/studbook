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
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyAction,
  horseById,
  meta,
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
const games = new Map();   // userId -> { state, version, updatedAt }
const traffic = new Map(); // userId -> number[] (action timestamps)

const userFile = join(dataDir, "users.json");
const sessionFile = join(dataDir, "sessions.json");
const gameDir = join(dataDir, "games");

async function writeJsonAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, path);
}

async function loadAll() {
  await mkdir(gameDir, { recursive: true });
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
  for (const id of users.keys()) {
    try {
      games.set(id, JSON.parse(await readFile(join(gameDir, `${id}.json`), "utf8")));
    } catch {
      /* the account exists, the game does not yet */
    }
  }
}

const persistUsers = () => writeJsonAtomic(userFile, [...users.values()]);
const persistSessions = () =>
  writeJsonAtomic(sessionFile, Object.fromEntries(sessions));
const persistGame = async (userId) => {
  const game = games.get(userId);
  game.updatedAt = new Date().toISOString();
  await writeJsonAtomic(join(gameDir, `${userId}.json`), game);
};

/* ---------------------------------------------------------------- accounts */

const hashPassword = (password, salt) => scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");

const newToken = () => randomBytes(32).toString("base64url");

const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 160;

function createAccount(email, password) {
  if (!validEmail(email)) throw httpError(400, "that is not an email address", "email");
  if (typeof password !== "string" || password.length < 8) throw httpError(400, "a password is at least 8 characters", "password");
  if (emails.has(email)) throw httpError(409, "this email already has a stable", "taken");
  const id = `u${randomBytes(6).toString("hex")}`;
  const salt = randomBytes(16).toString("hex");
  const user = { id, email, salt, hash: hashPassword(password, salt), createdAt: new Date().toISOString() };
  users.set(id, user);
  emails.set(email, id);
  const state = setup([id], `account:${id}`);
  games.set(id, { state, version: 1, updatedAt: null });
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
function frame(userId, game) {
  const stable = stableOf(game.state, userId);
  return {
    type: "state",
    status: "playing",
    seats: [userId],
    you: userId,
    connected: 1,
    view: viewFor(game.state, userId),
    result: null,
    meta,
    version: game.version,
    account: { id: userId, email: users.get(userId)?.email ?? null },
    cloud: true,
    stable: Boolean(stable),
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
  const game = games.get(userId);
  if (!game) throw httpError(404, "no game for this account", "nogame");
  if (!action || typeof action !== "object" || Array.isArray(action)) throw httpError(400, "an action is an object", "action");
  const verdict = validateAction(game.state, userId, action);
  if (!verdict.ok) throw httpError(400, verdict.error ?? "invalid action", "refused");
  if (action.type === "closeWindow") {
    const clock = game.state.clock;
    if (clock && Date.now() < clock.endsAt) throw httpError(400, "the entries window is still open", "early");
  }
  const cleaned = clampClock(action);
  game.state = applyAction(game.state, userId, cleaned);
  game.version += 1;
  persistGame(userId).catch(() => {});
  return game;
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
        await persistGame(user.id);
        const token = openSession(user);
        return send(res, 201, { token, user: { id: user.id, email: user.email }, state: frame(user.id, games.get(user.id)) });
      }
      const id = emails.get(email);
      const user = id ? users.get(id) : null;
      if (!user || !checkPassword(user, body.password)) throw httpError(401, "wrong email or password", "credentials");
      const token = openSession(user);
      return send(res, 200, { token, user: { id: user.id, email: user.email }, state: frame(user.id, games.get(user.id)) });
    }

    if (path === "/api/ranking" && req.method === "GET") {
      // Across every account: the table is public, the emails are not.
      const rows = [];
      for (const [userId, game] of games) {
        for (const stable of game.state.stables) {
          const horses = (stable.horses ?? []).map((id) => horseById(game.state, id)).filter(Boolean);
          rows.push({
            stable: stable.name,
            household: stable.id.startsWith("ai"),
            wins: horses.reduce((n, horse) => n + (horse.wins ?? 0), 0),
            prizes: Math.round(horses.reduce((n, horse) => n + (horse.earnings ?? 0), 0)),
            horses: horses.length,
            account: users.has(userId) ? `#${userId.slice(-4)}` : null,
          });
        }
      }
      rows.sort((a, b) => b.prizes - a.prizes || b.wins - a.wins);
      return send(res, 200, { ranking: rows.slice(0, 20), accounts: users.size });
    }

    if (path === "/api/me" && req.method === "GET") {
      const user = requireUser(req);
      return send(res, 200, { user: { id: user.id, email: user.email }, state: frame(user.id, games.get(user.id)) });
    }

    if (path === "/api/action" && req.method === "POST") {
      const user = requireUser(req);
      rateLimit(user.id);
      const body = await readBody(req);
      const game = applyAuthoritative(user.id, body.action);
      return send(res, 200, { state: frame(user.id, game) });
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

await loadAll();
server.listen(port, () => {
  console.log(`studbook server on http://127.0.0.1:${port} · ${users.size} account(s) · data in ${dataDir}`);
});

/** A test harness can import the pieces without opening a port twice. */
export { server, applyAuthoritative, createServer as _createServer };
