// Studbook screen — renders the view and talks to the game socket.
// The rules live in engine.js; this file only draws them and sends actions.

import { CloudSocket, apiCall, detectServer, tokenStore } from "./net.js?v=0.9.2";
import { SERVER_URL, HAS_QUERY_SERVER } from "./config.js?v=0.9.2";
import { appearanceFor, coatSvg } from "./phenotype.js?v=0.33.0";
import { paintCoat } from "./coat-portrait.js?v=0.38.0";
import { bank, tabIndicator, eliteStamp } from "./micro.js?v=0.54.0";

import {
  applyAction,
  copy,
  fateNote,
  horseName,
  log,
  meta,
  round,
  setRaceEngine,
  setup,
  validateAction,
  viewFor,
} from "./engine.js";

const SAVE_PREFIX = "studbook:standalone:v2:";

function localPlayerId() {
  return playerId();
}

function loadSaved(playerId) {
  const raw = readStore(SAVE_PREFIX + playerId);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

class LocalSocket {
  constructor() {
    this.readyState = 1; // WebSocket.OPEN, which is all the client checks
    this.listeners = { open: [], message: [], close: [] };
    this.playerId = localPlayerId();
    this.game = loadSaved(this.playerId);
    setTimeout(() => this.emit("open", {}), 0);
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, event) { for (const fn of this.listeners[type] || []) fn(event); }
  post(data) { this.emit("message", { data: JSON.stringify(data) }); }
  save() {
    const ok = writeStore(SAVE_PREFIX + this.playerId, JSON.stringify(this.game));
    if (!ok && !this.warned) {
      this.warned = true;
      toast("this browser is out of storage — progress is held in memory only", true);
    }
  }
  fresh(playerId) {
    return { status: "playing", seats: [playerId], state: setup([playerId]), result: null };
  }
  broadcast() {
    this.post({
      type: "state",
      status: this.game.status,
      seats: this.game.seats,
      you: this.playerId,
      connected: 1,
      view: viewFor(this.game.state, this.playerId),
      result: this.game.result,
      meta,
    });
  }
  send(raw) {
    if (raw === "__ping") return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === "join") {
      this.playerId = msg.playerId;
      // look the save up under the id the client actually claims
      if (!this.game) this.game = loadSaved(msg.playerId) || this.fresh(msg.playerId);
      // ?engine=causal (or legacy) switches how this offline game decides official results
      const engine = new URLSearchParams(location.search).get("engine");
      if (engine === "causal" || engine === "legacy") setRaceEngine(this.game.state, engine);
      this.save();
      this.broadcast();
      return;
    }
    if (!this.game) return;
    if (msg.type === "action") {
      const verdict = validateAction(this.game.state, this.playerId, msg.action);
      if (!verdict.ok) {
        this.post({ type: "error", error: verdict.error || "invalid action" });
        return;
      }
      this.game.state = applyAction(this.game.state, this.playerId, msg.action);
      this.save();
      this.broadcast();
      return;
    }
    if (msg.type === "clock") {
      // This local room is the room: it owns the clock exactly as the Durable Object does
      // in production. A plain timer is right here because nothing hibernates in a tab.
      const seconds = Math.min(3600, Math.max(1, Number(msg.seconds) || 0));
      const endsAt = Date.now() + seconds * 1000;
      const open = { type: "openWindow", endsAt };
      const verdict = validateAction(this.game.state, this.playerId, open);
      if (!verdict.ok) {
        this.post({ type: "error", error: verdict.error || "invalid window" });
        return;
      }
      this.game.state = applyAction(this.game.state, this.playerId, open);
      this.save();
      this.broadcast();
      if (this.clockTimer) clearTimeout(this.clockTimer);
      this.clockTimer = setTimeout(() => {
        const close = { type: "closeWindow" };
        const can = validateAction(this.game.state, this.playerId, close);
        if (!can.ok) return;
        this.game.state = applyAction(this.game.state, this.playerId, close);
        this.save();
        this.broadcast();
      }, seconds * 1000);
      return;
    }
    if (msg.type === "reset") {
      this.game = this.fresh(this.playerId);
      this.save();
      this.broadcast();
    }
  }
}

/**
 * Studbook client. The net half is the platform's standard harness; the view half
 * renders whatever the authoritative room sends. This file decides nothing about
 * the game — it sends intents and draws.
 */

// ── net (keep) ─────────────────────────────────────────────────────────────
const room = new URLSearchParams(location.search).get("room") || "main";
/** A link that starts a fresh game: ?reset=1 is consumed once, then stripped. */
const WANTS_RESET = new URLSearchParams(location.search).get("reset") === "1";
let resetSent = false;

/**
 * Storage can THROW, not just fail: in-app browsers (Instagram, TikTok, Facebook
 * webviews), private modes and cross-origin frames raise a SecurityError on the
 * property itself. Reading it unguarded killed the whole module and the game never
 * started. Every access is guarded now, with an in-memory fallback so a session
 * still works even when nothing can be persisted.
 */
const MEMORY_STORE = {};

function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return Object.prototype.hasOwnProperty.call(MEMORY_STORE, key) ? MEMORY_STORE[key] : null;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Out of quota: the value survives this session only. The caller warns the player,
    // because a save that quietly stops saving is worse than one that says so.
    MEMORY_STORE[key] = value;
    return false;
  }
}

function playerId() {
  const key = "hf:game:playerId";
  const saved = readStore(key);
  if (saved) return saved;
  const id = Math.random().toString(36).slice(2, 10);
  writeStore(key, id);
  return id;
}

const PING = "__ping";
const PONG = "__pong";
let socket = null;
let retry = 0;

/** Where the rules run: the server if there is one, this tab otherwise. */
let cloudBase = null;
const CLOUD = () => cloudBase !== null;
/** A server that exists even while this tab plays the offline demo (F1-07). */
let serverBase = null;

/**
 * The only door to the account API. The offline demo is a separate world: nothing it does may
 * reach the online stable, even when a token from an earlier session is still in this browser.
 */
function cloudApi(path, options = {}) {
  if (!CLOUD()) {
    const error = new Error("offline demo — sign in to use your online stable");
    error.code = "offline";
    return Promise.reject(error);
  }
  return apiCall(cloudBase, path, options);
}

/** Says, on every screen, which world this tab is in (F1-07). */
function markMode() {
  const mode = CLOUD() ? "cloud" : "offline";
  document.body.dataset.mode = mode;
  let banner = document.getElementById("mode-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "mode-banner";
    banner.setAttribute("role", "status");
    const bar = document.querySelector(".bar");
    if (bar) bar.after(banner);
    else document.body.prepend(banner);
  }
  banner.className = `mode-banner ${mode}`;
  if (mode === "cloud") {
    banner.innerHTML = `<b>Online</b> · estábulo salvo no servidor`;
    return;
  }
  banner.innerHTML =
    `<b>Demonstração offline</b> · salva apenas neste navegador. Nada aqui altera um estábulo online.` +
    (serverBase !== null ? ` <button class="tiny" type="button" data-mode-signin>Entrar na conta</button>` : "");
  banner.querySelector("[data-mode-signin]")?.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.delete("offline");
    location.href = url.toString(); // a clean start goes through the account gate
  });
}

function connect(makeSocket = () => new LocalSocket()) {
  socket = makeSocket();
  markMode();
  socket.addEventListener("open", () => {
    retry = 0;
    net("live", CLOUD() ? "cloud" : "offline");
    setStatus(CLOUD() ? "connected — the stable is on the server" : "ring open — reading the catalogue…");
    // The flag is set BEFORE joining. On the standalone the whole room is local and
    // answers the join synchronously, so a state can land inside the send below —
    // arming the start-over afterwards meant the link never fired there.
    if (WANTS_RESET && !resetSent) {
      resetSent = true;
      pendingStart = true;
    }
    send({ type: "join", playerId: playerId() });
  });
  socket.addEventListener("message", (event) => {
    if (event.data === PONG) return;
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === "state") onState(msg);
    else if (msg.type === "error") {
      setStatus(msg.error, true);
      // A refusal that vanishes in 2.8 s reads as "nothing happened": it stays 8 s, with a close
      // button, and the same refusal twice is counted rather than stacked.
      toast(msg.error, true);
    }
  });
  socket.addEventListener("close", () => {
    retry = Math.min(retry + 1, 6);
    const wait = 500 * 2 ** (retry - 1);
    net("bad", "reconnecting");
    setStatus(`link lost — retrying in ${Math.round(wait / 1000)}s`, true);
    setTimeout(connect, wait);
  });
}

/**
 * THE WALLET SEAM. Nothing in the game asks about a wallet except here, at the moment a
 * purchase starts - playing, breeding, racing, selling are all wallet-free. Swapping the
 * sandbox below for a real chain adapter is the whole job: settle the payment, then tell
 * the room which coin pack was paid for, exactly as this does.
 */
function connectWallet() {
  // No chain is wired into this build. This authorises the purchase locally and says so on
  // screen: it takes no money and promises no asset. Replace this body, keep this shape.
  return Promise.resolve({ authorised: true, sandbox: true });
}

/**
 * The off. Racing has a clock, a card and now a field, but between clicking Run and seeing the
 * result there was no moment at all: the race happened while the button was still under the
 * finger. This holds the screen for a beat at the start, with the field just studied, then lets
 * the result through. It decides nothing - the rules have already run - so it cannot move a
 * placing. It only gives the start a moment of its own.
 */
let offAt = 0;
let offTimer = null;
/** Honour the system setting: no race animation, and no waiting for the off. */
const REDUCED_MOTION = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
const OFF_MILLISECONDS = REDUCED_MOTION ? 0 : 1600;

function theOffBlock(v) {
  const box = el("meeting");
  if (!box || !box.parentElement) return;
  let wrap = document.getElementById("the-off");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "the-off";
    box.parentElement.insertBefore(wrap, box);
  }
  const going = String(v.goingNote ?? "").replace(/\s+/g, " ").trim();
  const field = Array.isArray(v.paddock) ? v.paddock : [];
  const mine = field.filter((row) => row.mine);
  wrap.innerHTML =
    `<div class="kv"><b>THE OFF</b><span>` +
    `${going ? `${going} · ` : ""}${nf(field.length)} declared · they are running</span></div>` +
    (mine.length
      ? `<div class="kv"><span>yours: ${mine
          .map((row) => `${esc(row.name)} (${esc(row.tactic)})`)
          .join(", ")}</span></div>`
      : "");
}

document.addEventListener(
  "click",
  (event) => {
    const run = event.target.closest?.("button");
    if (!run || !/^Run meeting/.test(run.textContent.trim())) return;
    offAt = Date.now();
    theOffBlock(view);
    if (offTimer) clearTimeout(offTimer);
    offTimer = setTimeout(() => {
      offAt = 0;
      const gone = document.getElementById("the-off");
      if (gone) gone.remove();
      draw();
    }, OFF_MILLISECONDS);
  },
  true,
);

document.addEventListener("click", (event) => {
  const offer = event.target.closest?.("[data-starter-offer]");
  const pack = event.target.closest?.("[data-coin-pack]");
  if (offer) {
    act({ type: "takeStarterOffer" });
    return;
  }
  // Card actions are declared, not built: one handler decides what each one does, and the
  // guards live in the button's own disabled/title state where the player can read them.
  const horseButton = event.target.closest?.("[data-horse-act]");
  if (horseButton && view && view.stable) {
    const horseId = horseButton.getAttribute("data-horse-id");
    const kind = horseButton.getAttribute("data-horse-act");
    const horse = view.horses.find((row) => row.id === horseId);
    if (!horse) return;
    if (kind === "enter") {
      const entered = view.stable.entries.includes(horse.id);
      const next = entered
        ? view.stable.entries.filter((id) => id !== horse.id)
        : [...view.stable.entries, horse.id].slice(0, 3);
      act({ type: "enter", horseIds: next });
      return;
    }
    if (kind === "breed") {
      const strawId = selectedStraw ?? view?.selectedStraw ?? null;
      if (!strawId) return toast("pick a covering first", true);
      act({ type: "breed", mareId: horse.id, strawId, care: careChoice });
      return;
    }
    if (kind === "sell") {
      confirmSale(horseButton, horse);
      return;
    }
    if (kind === "consign") {
      act({ type: "listHorse", horseId: horse.id, price: Math.max(25, horse.suggestedPrice ?? 100) });
      return;
    }
  }

  if (!pack) return;
  const name = pack.getAttribute("data-coin-pack");
  connectWallet().then((settled) => {
    if (!settled || !settled.authorised) return;
    // The room credits the coins; the rules decide what a pack is worth.
    act({ type: "addCoins", pack: name });
  });
});

function send(msg) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}
setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(PING);
}, 30_000);

// ── view ───────────────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id);
const nf = (n, digits = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number.isFinite(n) ? n : 0);

/** Every name in this game is typed by a player. Nothing reaches innerHTML unescaped. */
function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

let view = null;
let seats = [];
let me = null;
let selectedStraw = null;
let askedSeat = false;

// ── screens ────────────────────────────────────────────────────────────────
// One screen per job, routable by hash so a screen can be linked and reloaded.
const SCREENS = ["yard", "racing", "goings", "breeding", "studs", "horses", "shop", "ranking", "ledger"];

function screenFromHash() {
  const name = (location.hash || "").replace("#", "");
  return SCREENS.includes(name) ? name : "yard";
}

let screen = screenFromHash();

function showScreen(name) {
  const next = SCREENS.includes(name) ? name : "yard";
  const changing = document.body.dataset.screen && document.body.dataset.screen !== next;
  screen = next;
  // a short cross-fade between screens where the browser can do it; the masthead and tabs stay put
  if (changing && !REDUCED_MOTION && typeof document.startViewTransition === "function") {
    try {
      const transition = document.startViewTransition(() => { document.body.dataset.screen = next; });
      // a quick second click skips the first transition: that rejection is expected, not an error
      for (const step of [transition.ready, transition.finished, transition.updateCallbackDone]) step?.catch?.(() => {});
    } catch {
      document.body.dataset.screen = next;
    }
  } else {
    document.body.dataset.screen = next;
  }
  if (location.hash.replace("#", "") !== screen) history.replaceState(null, "", `#${screen}`);
  for (const button of document.querySelectorAll(".tab")) {
    button.setAttribute("aria-current", String(button.dataset.screen === screen));
  }
  tabIndicator(el("tabs"));
}
window.addEventListener("resize", () => tabIndicator(el("tabs")));

window.addEventListener("hashchange", () => showScreen(screenFromHash()));

/**
 * The testing bank this browser prefers for a fresh run. Kept with the guarded
 * storage helpers: a webview that refuses storage still plays, it just forgets.
 */
const BANK_KEY = "hf:studbook:bank";
let bankChoice = Number(readStore(BANK_KEY)) || 0;
let pendingStart = false;

/** The remembered bank if the game still offers it, else the standard one. */
function bankFor(v) {
  const choices = Array.isArray(v.bankChoices) && v.bankChoices.length ? v.bankChoices : [2000];
  return choices.includes(bankChoice) ? bankChoice : choices[0];
}

/**
 * The breeding moment: the care choice, the sound, and the reveal. Everything here
 * reads what the rules already decided — nothing invents an outcome.
 */
const SOUND_KEY = "hf:studbook:sound";
const CARE_KEY = "hf:studbook:care";
const FOAL_KEY = "hf:studbook:foalSeen";
let soundOn = readStore(SOUND_KEY) !== "off";
let careChoice = readStore(CARE_KEY) || "plain";
let shownFoal = readStore(FOAL_KEY) || "";
let revealQueue = [];
let revealIndex = 0;
let revealTimers = [];
let audio = null;
const TIERS = ["ordinary", "promising", "excellent", "exceptional", "stakes class"];
const CARE_WORDS = { plain: "plain care", prepared: "prepared care", studcare: "stud care" };
/** Lineage coat colours, so a stable reads as a set of animals rather than rows. */
const COATS = {
  L1: "#b5651d", L2: "#5a4632", L3: "#8c6239", L4: "#cfbe9c",
  L5: "#a8703f", L6: "#6f6b6b", L7: "#c98a4b", L8: "#7a5c46",
};

/** A code-drawn horse, coloured by lineage. Placeholder art pending credits. */
function portraitOf(lineage, age) {
  // One plate per lineage: an animal you can recognise across the yard.
  // The 2026-11 plates: full-body thoroughbreds, bay with black points and no white markings,
  // on transparent ground, so the coat repaint is exact (docs/art/BRIEF-HORSE-ART.md).
  if (age !== null && age !== undefined && age <= 1) return "assets/art/plate-foal.webp";
  const file = String(lineage ?? "").toLowerCase();
  return /^l[1-8]$/.test(file) ? `assets/art/plate-${file}.webp` : "assets/art/plate-stallion.webp";
}

function horseArt(lineage, age = null) {
  const img = document.createElement("img");
  img.className = "horseart";
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.src = portraitOf(lineage, age);
  img.style.color = COATS[lineage] ?? "#a8703f";
  return img;
}

function iconArt(id, colour) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.style.color = colour;
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}

function setStatus(text, bad = false) {
  const node = el("status");
  node.textContent = text;
  node.classList.toggle("bad", bad);
}
function net(kind, text) {
  el("net").className = "dot " + (kind === "live" ? "live" : kind === "bad" ? "bad" : "");
  el("nettext").textContent = text;
}
/**
 * The one way a toast reaches the screen. The same message again is not a second toast: the
 * first one counts it ("×2") and stays a little longer. At most three are shown, oldest first
 * out. Every toast closes on its own (errors after 8 s, so they can be read) and has a close
 * button; nothing stacks up over the buttons for minutes any more.
 */
const TOAST_LIMIT = 3;
function showToast(node, ms = 3200) {
  const box = el("toasts");
  if (!box || !node) return null;
  const key = node.dataset.toastKey ?? node.textContent;
  const same = [...box.children].find((child) => child.dataset.toastKey === key);
  if (same) {
    const count = Number(same.dataset.count ?? 1) + 1;
    same.dataset.count = String(count);
    let badge = same.querySelector(".toast-count");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "toast-count";
      badge.setAttribute("data-no-i18n", "");
      same.insertBefore(badge, same.querySelector(".toast-close"));
    }
    badge.textContent = `×${count}`;
    clearTimeout(Number(same.dataset.timer));
    same.dataset.timer = String(setTimeout(() => same.remove(), ms));
    return same;
  }
  node.dataset.toastKey = key;
  node.style.pointerEvents = "auto";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "close");
  close.textContent = "×";
  close.addEventListener("click", () => node.remove());
  node.append(close);
  box.append(node);
  while (box.children.length > TOAST_LIMIT) box.firstElementChild.remove();
  node.dataset.timer = String(setTimeout(() => node.remove(), ms));
  return node;
}
function toast(text, bad = false) {
  const node = document.createElement("div");
  node.className = "toast" + (bad ? " bad" : "");
  const body = document.createElement("span");
  body.textContent = text;
  node.append(body);
  node.dataset.toastKey = `${bad ? "bad" : "ok"}:${text}`;
  return showToast(node, bad ? 8000 : 3200);
}
/**
 * Selling to the house cannot be undone, so it takes two presses: the first turns the button
 * into "confirm sale · ₲ X" for five seconds, the second sells. Survives a redraw in between,
 * because the pending sale is remembered here rather than on the button.
 */
let pendingSale = null;
function confirmSale(button, horse) {
  const now = Date.now();
  if (pendingSale && pendingSale.horseId === horse.id && now - pendingSale.at < 5000) {
    pendingSale = null;
    act({ type: "sell", horseId: horse.id });
    return;
  }
  pendingSale = { horseId: horse.id, at: now };
  const offer = horse.houseOffer ?? Math.round((horse.suggestedPrice ?? 0) * 0.6);
  if (button) {
    button.dataset.armed = "1";
    button.textContent = `confirm sale · ₲ ${nf(offer)}`;
    button.classList.add("armed");
  }
  toast(`Press again to sell ${horse.name} to the house for ₲ ${nf(offer)}.`);
  setTimeout(() => {
    if (pendingSale && pendingSale.horseId === horse.id && Date.now() - pendingSale.at >= 5000) pendingSale = null;
    if (button && button.isConnected && button.dataset.armed === "1") {
      button.dataset.armed = "";
      button.textContent = "sell";
      button.classList.remove("armed");
    }
  }, 5000);
}

function act(action) {
  send({ type: "action", action });
}

/** The first screen should say what this is and how the stable stands, in one look. */
function renderHero() {
  const hero = el("hero");
  if (!hero || !view || !view.stable) return;
  hero.hidden = false;
  if (el("hero-season")) el("hero-season").textContent = nf(view.season);
  if (el("hero-line")) el("hero-line").textContent = view.advice ?? "";
  const stats = el("hero-stats");
  if (!stats) return;
  const rows = [
    ["guineas", `₲ ${nf(view.stable.guineas)}`],
    ["in training", nf(view.horses.length)],
    ["season", nf(view.season)],
    ["meeting", `${nf(view.round)} of ${nf(view.meetingsPerSeason ?? 4)}`],
    ["going", view.conditionLabel ?? view.condition],
    ["field average", nf(view.field.mean, 2)],
  ];
  stats.innerHTML = rows
    .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`)
    .join("");
}


/** The first win, the first foal: said out loud once, with the sound that goes with it. */
const FIRST_LABELS = {
  win: "first win",
  place: "first placing",
  foal: "first foal",
  stakes: "first stakes horse",
  sold: "first sale",
};
const celebratedFirsts = new Set();

function celebrateFirsts(v) {
  if (!v || !v.firsts) return;
  for (const [key, label] of Object.entries(FIRST_LABELS)) {
    const entry = v.firsts[key];
    if (!entry) continue;
    const name = entry.horse ?? entry.name ?? "";
    const id = `${key}:${entry.season}:${name}`;
    if (celebratedFirsts.has(id)) continue;
    celebratedFirsts.add(id);
    chime(3, true);
    toast(`${label} — ${name}`, false);
  }
}

function onState(msg) {
  view = msg.view ? { ...msg.view, room: msg.room ?? msg.view.room ?? null, cloud: Boolean(msg.cloud ?? msg.view.cloud), account: msg.account ?? msg.view.account ?? null } : null;
  appReady();
  el("advance").hidden = Boolean(view?.cloud);
  seats = msg.seats ?? [];
  me = msg.you;
  // a ?reset=1 link: join is processed by now, so start the run on the chosen bank
  if (pendingStart && view && view.stable && !view.cloud && !view.room) {
    pendingStart = false;
    act({ type: "startOver", bank: bankFor(view) });
    const url = new URL(location.href);
    url.searchParams.delete("reset");
    history.replaceState(null, "", url);
    toast("starting over from season one");
  }
  const seated = seats.includes(me);
  if (!seated) setStatus("this tab is a spectator — the seat is held elsewhere");
  if (seated && view && !view.stable && !askedSeat) {
    askedSeat = true;
    send({ type: "action", action: { type: "takeSeat" } });
  }
  draw();
  renderHero();
  celebrateFirsts(view);
}

function traitBars(traits) {
  const wrap = document.createElement("div");
  wrap.className = "traits";
  for (const key of ["speed", "stamina", "accel", "recovery", "temperament", "soundness"]) {
    const cell = document.createElement("div");
    cell.className = "trait";
    cell.title = `${key}: ${traits ? traits[key] : "?"}`;
    cell.setAttribute("role", "meter");
    cell.setAttribute("aria-label", key);
    cell.setAttribute("aria-valuemin", "0");
    cell.setAttribute("aria-valuemax", "12");
    cell.setAttribute("aria-valuenow", String(traits ? traits[key] : 0));
    const fill = document.createElement("i");
    fill.style.width = `${Math.min(100, ((traits ? traits[key] : 0) / 12) * 100)}%`;
    cell.append(fill);
    wrap.append(cell);
  }
  return wrap;
}

let replayTimer = null;
let playedSeason = null;

/**
 * Replays the beats the rules computed. Each checkpoint's spread is normalised to
 * the rail so the pack stays readable, but the order inside a checkpoint, and who
 * wins the last one, are exactly what the engine decided.
 */
function playReplay(replay, force) {
  const track = el("track");
  if (!track || !replay || !replay.length) return;
  const season = view && view.meeting ? view.meeting.season : null;
  if (!force && playedSeason === season) return;
  playedSeason = season;
  if (replayTimer) clearInterval(replayTimer);
  let step = 0;
  const paint = () => {
    const beat = replay[step];
    if (!beat) return;
    const values = beat.order.map((row) => row.progress);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const spread = Math.max(0.001, hi - lo);
    for (const row of beat.order) {
      const marker = track.querySelector(`[data-horse="${row.horseId}"] .runner`);
      if (marker) marker.style.left = `${6 + 78 * ((row.progress - lo) / spread)}%`;
    }
    const note = el("track-note");
    if (note) {
      note.textContent =
        step === replay.length - 1
          ? `finish — ${beat.order[0].name} wins`
          : `checkpoint ${step + 1} of ${replay.length} — ${beat.order[0].name} leads`;
    }
    step += 1;
    if (step >= replay.length) {
      clearInterval(replayTimer);
      replayTimer = null;
    }
  };
  if (REDUCED_MOTION) {
    // show the finish, not the journey
    while (step < replay.length) paint();
    return;
  }
  paint();
  replayTimer = setInterval(paint, 700);
}

/** A short synthesised flourish, bigger for a better foal. No assets, no samples. */
function chime(tierIndex, ok) {
  if (!soundOn) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio = audio || new Ctx();
    const now = audio.currentTime;
    const gain = audio.createGain();
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(ok ? 0.15 + tierIndex * 0.02 : 0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (ok ? 1.2 : 0.5));
    const notes = ok ? [0, 4, 7, 12, 19].slice(0, 2 + Math.max(0, tierIndex)) : [0, -3];
    const base = ok ? 349.23 * (1 + tierIndex * 0.05) : 174.61;
    notes.forEach((semi, index) => {
      const osc = audio.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = base * 2 ** (semi / 12);
      osc.connect(gain);
      const at = now + index * 0.1;
      osc.start(at);
      osc.stop(at + 0.5);
    });
  } catch {
    /* sound is a nicety: if it cannot play, the moment still happens */
  }
}

/** A soft settling motif for a covering that caught: the wait, not the win. */
function settle() {
  if (!soundOn) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio = audio || new Ctx();
    const now = audio.currentTime;
    const gain = audio.createGain();
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    [0, 7].forEach((semi, index) => {
      const osc = audio.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 261.63 * 2 ** (semi / 12);
      osc.connect(gain);
      const at = now + index * 0.16;
      osc.start(at);
      osc.stop(at + 0.7);
    });
  } catch {
    /* sound is a nicety */
  }
}

/** A short tag for a flagged pregnancy, shown while the player waits. */
function fateTag(fate, note) {
  const row = document.createElement("div");
  const bad = fate === "scare" || fate === "slipped";
  row.className = "pairing" + (bad ? " risk" : "");
  row.textContent = note ?? fate;
  return row;
}

function kvRow(label, value) {
  const row = document.createElement("div");
  const left = document.createElement("span");
  left.className = "k";
  left.textContent = label;
  const right = document.createElement("span");
  right.textContent = value;
  row.append(left, right);
  return row;
}

/** Trait bars that start empty, so they can be filled one at a time. */
function revealTraits(traits) {
  const wrap = document.createElement("div");
  wrap.className = "traits traits-grid";
  const bars = [];
  for (const key of ["speed", "stamina", "accel", "recovery", "temperament", "soundness"]) {
    const cell = document.createElement("div");
    cell.className = "trait";
    cell.title = `${key}: ${traits ? traits[key] : "?"}`;
    cell.setAttribute("role", "meter");
    cell.setAttribute("aria-label", `${key} of 12`);
    cell.setAttribute("aria-valuemin", "0");
    cell.setAttribute("aria-valuemax", "12");
    cell.setAttribute("aria-valuenow", String(traits ? traits[key] : 0));
    const fill = document.createElement("i");
    fill.style.width = "0%";
    cell.append(fill);
    wrap.append(cell);
    bars.push({ fill, width: Math.min(100, ((traits ? traits[key] : 0) / 12) * 100) });
  }
  return { wrap, bars };
}

let focusBeforeReveal = null;

/** Closing always returns focus to whatever the player was on before the dialog. */
function closeReveal() {
  const box = el("reveal");
  if (box) box.hidden = true;
  // Several foals can be born in the same turn: closing one opens the next, so a run of
  // births is a run of moments rather than one card and a silent yard.
  if (revealIndex + 1 < revealQueue.length) {
    revealIndex += 1;
    if (view) openReveal(revealQueue[revealIndex], view, { index: revealIndex, total: revealQueue.length });
    return;
  }
  revealQueue = [];
  if (focusBeforeReveal && typeof focusBeforeReveal.focus === "function") focusBeforeReveal.focus();
  focusBeforeReveal = null;
}

/**
 * One way in as well as one way out. The first pass only wired the focus into the
 * born/miss card, and a covering that catches takes the "in foal" card instead, which
 * returns early - so the dialog that opens most often was the one that never took focus.
 */
function mountDialog(card) {
  const box = el("reveal");
  if (!box) return;
  card.setAttribute("tabindex", "-1");
  box.append(card);
  try {
    card.focus();
  } catch {
    /* focus is a courtesy; the dialog still works without it */
  }
}

function openReveal(foal, v, progress) {
  const box = el("reveal");
  if (!box) return;
  for (const timer of revealTimers) clearTimeout(timer);
  revealTimers = [];
  box.innerHTML = "";
  box.hidden = false;
  focusBeforeReveal = document.activeElement;

  const event = foal.event ?? (foal.ok ? "born" : "miss");
  const tierIndex = event === "born" ? Math.max(0, TIERS.indexOf(foal.tier)) : -1;
  const card = document.createElement("div");
  card.className = "card";
  // a way out at the top: on a phone the card is long, and its own button sits at the bottom
  const shut = document.createElement("button");
  shut.type = "button";
  shut.className = "reveal-close";
  shut.setAttribute("aria-label", "close");
  shut.textContent = "×";
  shut.addEventListener("click", () => closeReveal());
  card.append(shut);

  // A birth is the one moment the game can afford to be theatrical about.
  if (event === "born") {
    const scene = document.createElement("div");
    scene.className = "scene";
    const portrait = document.createElement("img");
    portrait.alt = "";
    portrait.decoding = "async";
    // the foal itself, in its own coat and markings, as the birth scene just showed it
    const born = (v?.horses ?? []).find((horse) => horse.id === foal.id);
    if (born) paintCoat(portrait, portraitOf(born.lineage, born.age ?? 0), appearanceFor(born));
    else portrait.src = "assets/art/plate-foal.webp";
    const tag = document.createElement("span");
    tag.className = "scene-tag";
    tag.textContent = "first look";
    scene.append(tag, portrait);
    card.append(scene);
    const parents = document.createElement("p");
    parents.className = "scene-line hint";
    parents.textContent = `out of ${foal.damName ?? "her"} by ${foal.sireName ?? "him"}`;
    card.append(parents);
  }

  // The rare loss: gentler than the fanfare, and honest about what it cost.
  if (event === "slipped") {
    const lostStamp = document.createElement("span");
    lostStamp.className = "stamp miss";
    lostStamp.textContent = "lost";
    card.append(lostStamp);
    const lostHead = document.createElement("h3");
    lostHead.textContent = "She slipped the foal";
    card.append(lostHead);
    const lostSub = document.createElement("p");
    lostSub.className = "hint";
    lostSub.textContent = `${foal.damName} lost the foal by ${foal.sireName}. The covering and the care are gone; there is no foal to name.`;
    card.append(lostSub);
    const lostRow = document.createElement("div");
    lostRow.className = "row";
    lostRow.style.marginTop = "0.7rem";
    const lostClose = document.createElement("button");
    lostClose.className = "tiny";
    lostClose.textContent = "try again";
    lostClose.addEventListener("click", () => {
      closeReveal();
    });
    lostRow.append(lostClose);
    card.append(lostRow);
    mountDialog(card);
    chime(0, false);
    return;
  }

  // The conception: the payoff is deferred, so this card is deliberately quiet.
  if (event === "expecting") {
    const waitStamp = document.createElement("span");
    waitStamp.className = "stamp";
    waitStamp.textContent = "in foal";
    card.append(waitStamp);
    const waitHead = document.createElement("h3");
    waitHead.textContent = "She is in foal";
    card.append(waitHead);
    const waitSub = document.createElement("p");
    waitSub.className = "hint";
    waitSub.textContent = `${foal.damName} caught to ${foal.sireName}, with ${CARE_WORDS[foal.care] ?? "plain care"} — the chance was ${Math.round((foal.chance ?? 0) * 100)}%.`;
    card.append(waitSub);
    const waitLines = document.createElement("div");
    waitLines.className = "lines";
    waitLines.append(
      kvRow("due", "next season"),
      kvRow("what now", "run the season to bring the foal into the yard"),
    );
    card.append(waitLines);
    if (foal.fate) card.append(fateTag(foal.fate, foal.fateNote));
    const waitClose = document.createElement("div");
    waitClose.className = "row";
    waitClose.style.marginTop = "0.7rem";
    const waitButton = document.createElement("button");
    waitButton.className = "brass";
    waitButton.textContent = "wait for the season";
    waitButton.addEventListener("click", () => {
      closeReveal();
    });
    waitClose.append(waitButton);
    card.append(waitClose);
    mountDialog(card);
    settle();
    return;
  }

  if (tierIndex >= 2) {
    const burst = document.createElement("div");
    burst.className = "burst";
    for (let i = 0; i < 20; i += 1) {
      const bit = document.createElement("i");
      bit.style.left = `${8 + Math.random() * 84}%`;
      bit.style.top = `${18 + Math.random() * 45}%`;
      bit.style.setProperty("--dx", `${(Math.random() - 0.5) * 240}px`);
      bit.style.setProperty("--dy", `${90 + Math.random() * 170}px`);
      bit.style.animationDelay = `${i * 35}ms`;
      burst.append(bit);
    }
    card.append(burst);
  }

  const stamp = document.createElement("span");
  stamp.className = "stamp" + (event === "born" ? (tierIndex >= 2 ? " high" : "") : " miss");
  stamp.textContent = event === "born" ? foal.tier : "no foal";
  card.append(stamp);
  if (progress && progress.total > 1) {
    const many = document.createElement("span");
    many.className = "hint";
    many.style.marginLeft = "0.5rem";
    many.textContent = `${progress.index + 1} of ${progress.total} this turn`;
    card.append(many);
  }

  const heading = document.createElement("h3");
  heading.textContent = event === "born" ? (foal.sex === "M" ? "A colt is born" : "A filly is born") : "The covering missed";
  card.append(heading);

  const sub = document.createElement("p");
  sub.className = "hint";
  sub.textContent = event === "born"
    ? `${foal.damName} out of ${foal.sireName}, with ${CARE_WORDS[foal.care] ?? "plain care"}.`
    : `${foal.damName} was covered by ${foal.sireName} and did not catch — the chance was ${Math.round((foal.chance ?? 0) * 100)}%. The straw and the care are spent either way.`;
  card.append(sub);

  if (event === "born") {
    const line = document.createElement("div");
    line.className = "foal";
    const mine = v.horses.find((horse) => horse.id === foal.id);
    line.append(horseArt(mine ? mine.lineage : null));
    const big = document.createElement("div");
    big.className = "big";
    big.textContent = "0.00";
    line.append(big);
    card.append(line);

    const traits = revealTraits(foal.traits);
    card.append(traits.wrap);
    traits.bars.forEach((bar, index) => {
      revealTimers.push(
        setTimeout(() => {
          bar.fill.style.width = `${bar.width}%`;
        }, 260 + index * 120),
      );
    });

    const lines = document.createElement("div");
    lines.className = "lines";
    lines.append(
      kvRow("against her dam", `${nf(foal.damValue, 2)} → ${nf(foal.value, 2)} (${foal.improvement >= 0 ? "+" : ""}${nf(foal.improvement, 2)})`),
      kvRow("the field", `${nf(foal.place)} of ${nf(foal.field)} living horses`),
      kvRow("inbreeding", `${nf(foal.f, 3)} · ${foal.fLabel}`),
      kvRow("care", CARE_WORDS[foal.care] ?? "plain care"),
    );
    if (foal.personalBest) lines.append(kvRow("your yard", "best foal you have bred"));
    card.append(lines);
    if (foal.fate && foal.fate !== "twins") {
      card.append(fateTag(foal.fate, foal.fateNote));
    }
    if (foal.fate === "twins") {
      const sibling = (v.lastFoals ?? []).find(
        (row) => row.id !== foal.id && row.damId === foal.damId && row.event === "born",
      );
      const twin = document.createElement("div");
      twin.className = "pairing";
      twin.textContent = sibling
        ? `twins — ${sibling.name} came too, both a little smaller for it`
        : "twins — two foals, both a little smaller for it";
      card.append(twin);
    }

    if (foal.nextTier) {
      const meter = document.createElement("div");
      meter.className = "meter";
      const fill = document.createElement("i");
      meter.append(fill);
      card.append(meter);
      const near = document.createElement("p");
      near.className = "hint";
      near.textContent = `${nf(foal.nearMiss, 2)} short of ${foal.nextTier}`;
      card.append(near);
      revealTimers.push(
        setTimeout(() => {
          fill.style.width = `${Math.max(6, Math.min(100, (foal.value / (foal.value + foal.nearMiss)) * 100))}%`;
        }, 520),
      );
    } else {
      const top = document.createElement("p");
      top.className = "hint";
      top.textContent = "Nothing in the catalogue is above this foal.";
      card.append(top);
    }

    const start = performance.now();
    const count = (now) => {
      const t = Math.min(1, (now - start) / 900);
      big.textContent = nf(foal.value * t, 2);
      if (t < 1) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);

    const nameRow = document.createElement("div");
    nameRow.className = "row";
    nameRow.style.marginTop = "0.7rem";
    const input = document.createElement("input");
    input.value = foal.name;
    input.maxLength = 24;
    input.setAttribute("aria-label", "Name the foal");
    nameRow.append(input);
    const keep = document.createElement("button");
    keep.className = "brass";
    keep.textContent = "keep the name";
    keep.addEventListener("click", () => {
      act({ type: "nameHorse", horseId: foal.id, name: input.value });
      toast("named");
    });
    nameRow.append(keep);
    card.append(nameRow);
  }

  const closeRow = document.createElement("div");
  closeRow.className = "row";
  closeRow.style.marginTop = "0.6rem";
  const close = document.createElement("button");
  close.className = "tiny";
  close.textContent = event === "born" ? "back to the yard" : "try again";
  close.addEventListener("click", () => {
    closeReveal();
  });
  closeRow.append(close);
  card.append(closeRow);

  mountDialog(card);
  const fateTier = foal.fate === "strong" ? 4 : foal.fate === "twins" ? 3 : 0;
  const fanfare = () => chime(Math.max(tierIndex, fateTier), event === "born");
  // a birth is staged once per foal; the card underneath keeps every number
  if (event === "born" && foal.id && !stagedBirths.has(foal.id)) {
    stagedBirths.add(foal.id);
    stageBirth(foal, v, fanfare).catch(fanfare);
    return;
  }
  fanfare();
}

const stagedBirths = new Set();

/** The cinematic birth (assets/birth-scene.js): parents in their coats, then the foal in its own. */
async function stageBirth(foal, v, fanfare) {
  const { playBirth } = await import("./birth-scene.js?v=0.54.0");
  const find = (id) => (v.horses ?? []).find((horse) => horse.id === id) ?? null;
  const who = (horse, fallbackName, fallbackSrc, age) => ({
    name: horse?.name ?? fallbackName ?? "",
    src: horse ? portraitOf(horse.lineage, age ?? horse.age) : fallbackSrc,
    appearance: horse ? appearanceFor(horse) : null,
  });
  const foalHorse = find(foal.id);
  const look = foalHorse ? appearanceFor(foalHorse) : null;
  playBirth({
    dam: who(find(foal.damId), foal.damName, "assets/art/plate-l1.webp"),
    sire: who(find(foal.sireId), foal.sireName, "assets/art/plate-stallion.webp"),
    foal: { name: foal.name, src: portraitOf(foalHorse?.lineage, 0), appearance: look },
    eyebrow: `Temporada ${nf(foal.bornSeason ?? v.season)} · nasce ${foal.sex === "M" ? "um potro" : "uma potra"}`,
    tier: window.__studbookI18n?.translate?.(foal.tier) ?? foal.tier,
    coat: look?.labelPt ?? "",
    reducedMotion: REDUCED_MOTION,
    onSound: (moment) => { if (moment === "join") settle(); if (moment === "reveal") fanfare(); },
    onDone: () => el("reveal")?.querySelector(".card")?.focus(),
  });
}

/** Show the moment once per foal, not on every redraw. */
function maybeReveal(v) {
  const foal = v.lastFoal;
  if (!foal) return;
  const batch = (v.lastFoals && v.lastFoals.length ? v.lastFoals : [foal]).filter(Boolean);
  const ids = batch.map((row) => row.id ?? row.damId).join("|");
  const stamp = `${foal.event ?? (foal.ok ? "born" : "miss")}:${ids}`;
  if (stamp === shownFoal) return;
  shownFoal = stamp;
  writeStore(FOAL_KEY, stamp);
  revealQueue = batch;
  revealIndex = 0;
  openReveal(revealQueue[0], v, { index: 0, total: batch.length });
}

/** The covering in hand and what goes into it, so the decision happens here. */
function renderCovering(v) {
  const covering = el("covering");
  const care = el("care");
  if (!covering || !care) return;
  covering.innerHTML = "";
  care.innerHTML = "";
  renderSireBoard(v, covering);

  const chosen = (v.careChoices ?? []).find((entry) => entry.care === careChoice) ?? (v.careChoices ?? [])[0];
  for (const choice of v.careChoices ?? []) {
    const button = document.createElement("button");
    button.className = "pick";
    button.setAttribute("aria-pressed", String(choice.care === careChoice));
    const title = document.createElement("b");
    title.textContent = `${CARE_WORDS[choice.care] ?? choice.care}${choice.cost ? ` · ${nf(choice.cost)} ₲` : " · free"}`;
    const detail = document.createElement("span");
    detail.textContent = choice.catch
      ? `+${Math.round(choice.catch * 100)}% catch · +${Math.round(choice.value * 100)}% value`
      : "nothing extra";
    button.append(title, detail);
    button.disabled = v.stable.guineas < choice.cost;
    button.addEventListener("click", () => {
      careChoice = choice.care;
      writeStore(CARE_KEY, choice.care);
      draw();
    });
    care.append(button);
  }
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent =
    chosen && v.stable.guineas >= chosen.cost
      ? `Breeding spends the covering and ${chosen.cost ? `charges ${nf(chosen.cost)} ₲ for care` : "costs nothing extra"}.`
      : `You cannot afford ${CARE_WORDS[careChoice] ?? careChoice} right now — pick something cheaper.`;
  care.append(note);
}

/** Her in foal, and how long the wait is: the season button ends it. */
function renderFoaling(v) {
  const due = el("due");
  if (due) {
    due.textContent = v.dueNextSeason
      ? `${nf(v.dueNextSeason)} foal${v.dueNextSeason === 1 ? "" : "s"} due when the season turns.`
      : "";
  }
  const list = el("foaling");
  if (!list) return;
  list.innerHTML = "";
  const rows = v.foaling ?? [];
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "hint empty-state";
    empty.textContent = "No mares in foal. Pick a covering and breed a mare above.";
    list.append(empty);
    return;
  }
  for (const row of rows) {
    const card = document.createElement("div");
    card.className = "lot mine";
    const head = document.createElement("div");
    head.className = "name";
    head.textContent = row.mareName;
    card.append(head);
    const meta = document.createElement("div");
    meta.className = "kv";
    meta.innerHTML = `<span>in foal to ${esc(row.sireName)}</span><b>due season ${nf(row.dueSeason)}</b>`;
    card.append(meta);
    const when = document.createElement("div");
    when.className = "kv";
    when.innerHTML = `<span>care</span><b>${CARE_WORDS[row.care] ?? row.care}</b>`;
    card.append(when);
    if (row.fate) card.append(fateTag(row.fate, row.fateNote));
    list.append(card);
  }
}

/** The foal book: what this yard has bred, and what each one landed as. */
function renderFoals(v) {
  const list = el("foals");
  if (!list) return;
  list.innerHTML = "";
  const foals = (v.stable && v.stable.foals) || [];
  const count = el("foal-count");
  if (count) count.textContent = nf(foals.length);
  if (!foals.length) {
    const empty = document.createElement("p");
    empty.className = "hint empty-state";
    empty.textContent = "No foals bred yet. Cover a mare on the Breeding screen and the book starts here.";
    list.append(empty);
    return;
  }
  for (const foal of foals) {
    const card = document.createElement("div");
    card.className = "lot" + (foal.inYard ? " mine" : "");
    const head = document.createElement("div");
    head.className = "name";
    head.textContent = foal.name;
    card.append(head);
    const meta = document.createElement("div");
    meta.className = "kv";
    meta.innerHTML = `<span>${esc(foal.sireName)} out of ${esc(foal.damName)} · S${nf(foal.bornSeason)}</span><b>${nf(foal.value, 2)}</b>`;
    card.append(meta);
    const where = document.createElement("div");
    where.className = "kv";
    where.innerHTML = `<span>${foal.inYard ? "in the yard" : foal.retired ? "retired" : "sold on"}</span><b>${foal.tier ?? "—"}</b>`;
    card.append(where);
    list.append(card);
  }
}

/**
 * One tiny line icon per trait, drawn in code like the rest of the art: no assets, no
 * credits. They exist so a reader identifies a trait before reading its name.
 */
const TRAIT_ICONS = {
  speed: "M13 2 L5 13 h5 l-1 9 8-11 h-5 z",
  accel: "M6 13l6-6 6 6M6 19l6-6 6 6",
  stamina: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  recovery: "M12 20s-7-4.5-7-9a4 4 0 017-2.5A4 4 0 0119 11c0 4.5-7 9-7 9z",
  temperament: "M12 3a9 9 0 100 18 9 9 0 000-18zM9 10h.01M15 10h.01M9 15h6",
  soundness: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z",
};

function traitIcon(trait) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ticon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", TRAIT_ICONS[trait] ?? "M12 5v14");
  path.setAttribute("fill", trait === "speed" ? "currentColor" : "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

/** The race cards: every going, with the live weights the engine scores with. */
function renderGoings(v) {
  const list = el("goings");
  if (!list) return;
  list.innerHTML = "";
  for (const going of v.goings ?? []) {
    const card = document.createElement("div");
    card.className = "going" + (going.next ? " next" : "");
    const head = document.createElement("h3");
    head.textContent = going.next ? `${going.label} · next up` : going.label;
    card.append(head);
    if (going.next) {
      // the next card is the one the live race runs on: watch it from here
      const watch = document.createElement("button");
      watch.type = "button";
      watch.className = "tiny going-watch";
      watch.dataset.liveRace = "";
      watch.textContent = "Assistir à corrida ao vivo";
      card.append(watch);
    }
    // the immediate read: two chips that matter, one that does not, before any bar
    const chips = document.createElement("div");
    chips.className = "chips";
    const wants = document.createElement("span");
    wants.className = "chiplabel";
    wants.textContent = "wants";
    chips.append(wants);
    for (const trait of going.wins ?? []) {
      const chip = document.createElement("span");
      chip.className = "chip top";
      chip.append(traitIcon(trait), document.createTextNode(trait));
      chips.append(chip);
    }
    const least = document.createElement("span");
    least.className = "chip least";
    least.append(traitIcon(going.punishes), document.createTextNode(going.punishes));
    chips.append(least);
    card.append(chips);

    const weights = document.createElement("div");
    weights.className = "weights";
    for (const row of going.weights ?? []) {
      const line = document.createElement("div");
      line.className = `w ${row.tier ?? "mid"}`;
      const marker = document.createElement("span");
      marker.className = "dot";
      marker.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.className = "tname";
      name.append(traitIcon(row.trait), document.createTextNode(row.trait));
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("i");
      // 2.2x so the biggest weight on the card (40) fills most of the rail and the
      // smallest (2) is still a visible mark rather than nothing
      fill.style.width = `${Math.max(2, row.weight * 2.2)}%`;
      bar.append(fill);
      const pct = document.createElement("span");
      pct.textContent = `${row.weight}%`;
      line.append(marker, name, bar, pct);
      weights.append(line);
    }
    card.append(weights);

    const prose = document.createElement("p");
    prose.className = "profile";
    prose.textContent = `Favours ${going.character}. It rewards ${(going.wins ?? []).join(" and ")}; it punishes a horse short of ${going.punishes}.`;
    card.append(prose);
    const tips = document.createElement("div");
    tips.className = "tips";
    const lines = [
      ["Prioritise", `${(going.wins ?? []).join(" and ")} — the two weights that decide this card`],
      ["Don't overpay for", `${going.punishes} — the cheapest part of the card`],
      ["Instruction", `${going.bestInstruction ?? "steady"}: ${going.instructionWhy ?? ""}`],
    ];
    for (const [label, text] of lines) {
      const row = document.createElement("p");
      row.className = "tip";
      const tag = document.createElement("b");
      tag.textContent = label;
      row.append(tag, document.createTextNode(` ${text}`));
      tips.append(row);
    }
    if (going.strategy) {
      const strategy = document.createElement("p");
      strategy.className = "tip";
      strategy.textContent = going.strategy;
      tips.append(strategy);
    }
    card.append(tips);
    list.append(card);
  }
}

let clockTicker = null;

/** Who is at this table, and how to bring someone else to it. */
function renderPlayers(v) {
  const list = el("players");
  if (!list) return;
  list.innerHTML = "";
  // The single-file build replaces the socket with a local room, and a game with no server
  // cannot have a second player. Say so rather than offering an invite that cannot work.
  const local = Boolean(socket && socket.constructor && socket.constructor.name === "LocalSocket");

  for (const row of v.players ?? []) {
    const line = document.createElement("div");
    line.className = "kv";
    const who = document.createElement("span");
    who.textContent = row.mine ? `${row.name} (you)` : row.name;
    const seat = document.createElement("b");
    seat.textContent = row.mine ? "your seat" : "another stable";
    line.append(who, seat);
    list.append(line);
  }

  const room = new URLSearchParams(location.search).get("room") || "main";
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = local
    ? "This build is one file with no server, so it is single-player by nature. The hosted build seats up to four stables in the same room."
    : `Room “${room}”. Anyone opening the link below joins this table.`;
  list.append(note);

  if (!local) {
    const link = document.createElement("input");
    link.readOnly = true;
    link.value = `${location.origin}${location.pathname}?room=${encodeURIComponent(room)}`;
    link.setAttribute("aria-label", "Invite link");
    list.append(link);
    const row = document.createElement("div");
    row.className = "row";
    const copy = document.createElement("button");
    copy.className = "tiny brass";
    copy.textContent = "copy the link";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link.value);
        toast("invite link copied");
      } catch {
        link.select();
        toast("the browser kept the clipboard — the link is selected to copy", true);
      }
    });
    const other = document.createElement("input");
    other.placeholder = "or another room";
    other.setAttribute("aria-label", "Room name");
    const go = document.createElement("button");
    go.className = "tiny";
    go.textContent = "switch room";
    go.addEventListener("click", () => {
      const next = String(other.value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (next.length < 2) return toast("a room name is at least two characters", true);
      location.href = `${location.pathname}?room=${encodeURIComponent(next)}`;
    });
    row.append(copy, other, go);
    list.append(row);
  }

  const nameRow = document.createElement("div");
  nameRow.className = "row";
  const field = document.createElement("input");
  field.value = v.stable.name;
  field.maxLength = 24;
  field.setAttribute("aria-label", "Stable name");
  const save = document.createElement("button");
  save.className = "tiny good";
  save.textContent = "use this name";
  save.addEventListener("click", () => act({ type: "nameStable", name: field.value }));
  nameRow.append(field, save);
  list.append(nameRow);
}

/** The room sets the deadline; the screen only reads it, once a second, while it is open. */
function tickClock() {
  const node = el("clock-count");
  if (!node) return;
  const clock = view && view.clock;
  if (!clock || !clock.open) {
    if (clockTicker) {
      clearInterval(clockTicker);
      clockTicker = null;
    }
    return;
  }
  const secondsLeft = Math.max(0, Math.round((clock.endsAt - Date.now()) / 1000));
  node.textContent =
    secondsLeft > 0
      ? `entries close in ${secondsLeft}s — the meeting then runs by itself`
      : "time is up: the meeting is running";
  if (!clockTicker) clockTicker = setInterval(tickClock, 1000);
}

/**
 * The opening, said in one place. A new stable holds one mare and no covering, and the
 * three moves that turn that into a game each live on a different screen. This strip names
 * them in order, ticks them off as they happen, and takes itself away once the first
 * meeting has run: after that the player has a game, not a to-do list.
 */
/**
 * The Yard's cards. A spreadsheet row says what a horse IS; a card has to say what he has
 * DONE, because that is the part a player owns emotionally. Every number here is already
 * published by the rules - starts, wins, placings, earnings, the best result he ever ran -
 * and the actions are declared as data attributes instead of being built again, so exactly
 * one place decides what each button does.
 */
/**
 * The Yard's filters. The state lives out here and the controls are built ONCE: rebuilding
 * an input on every redraw is what steals a caret mid-word, and a search box that fights
 * the person typing in it is worse than no search box.
 */
const yardFilters = { text: "", sex: "any", age: "any", wins: "any", value: "any", sort: "default" };

const YARD_FILTERS = [
  { key: "sex", label: "sex", options: [["any", "any"], ["f", "mares"], ["m", "colts"]] },
  {
    key: "age",
    label: "age",
    options: [["any", "any"], ["young", "0-1"], ["mid", "2-3"], ["prime", "4-6"], ["veteran", "7+"]],
  },
  {
    key: "wins",
    label: "wins",
    options: [["any", "any"], ["unraced", "unraced"], ["none", "raced, none"], ["one", "1+"], ["three", "3+"]],
  },
  {
    key: "value",
    label: "value",
    options: [["any", "any"], ["above", "above the field"], ["below", "below the field"], ["elite", "near elite"]],
  },
  {
    // Order rides the same machinery as the filters: one state object, one set of controls
    // built once, one redraw. A second mechanism for the same job would drift apart.
    key: "sort",
    label: "order",
    options: [
      ["default", "as listed"],
      ["young", "age: youngest first"],
      ["old", "age: oldest first"],
      ["wins", "wins: most first"],
      ["value", "value: highest first"],
      ["name", "name: A-Z"],
    ],
  },
];

function yardMatches(horse, v) {
  const f = yardFilters;
  if (f.text) {
    const hay = `${horse.name} ${horse.sireName ?? ""} ${horse.damName ?? ""}`.toLowerCase();
    if (!hay.includes(f.text.toLowerCase())) return false;
  }
  if (f.sex !== "any" && (f.sex === "f" ? horse.sex !== "F" : horse.sex !== "M")) return false;

  const age = horse.age ?? 0;
  if (f.age === "young" && age > 1) return false;
  if (f.age === "mid" && (age < 2 || age > 3)) return false;
  if (f.age === "prime" && (age < 4 || age > 6)) return false;
  if (f.age === "veteran" && age < 7) return false;

  const starts = horse.starts ?? 0;
  const wins = horse.wins ?? 0;
  if (f.wins === "unraced" && starts > 0) return false;
  if (f.wins === "none" && !(starts > 0 && wins === 0)) return false;
  if (f.wins === "one" && wins < 1) return false;
  if (f.wins === "three" && wins < 3) return false;

  // Value is read against the field, because that is how the card states it: an absolute
  // number means nothing without the company a horse keeps.
  const mean = (v.field && v.field.mean) || 0;
  if (f.value !== "any" && mean) {
    if (f.value === "above" && horse.value < mean) return false;
    if (f.value === "below" && horse.value >= mean) return false;
    if (f.value === "elite" && horse.value < (v.field.eliteCut ?? Infinity)) return false;
  }
  return true;
}

/** Built once, then only ever updated: see the note on yardFilters. */
function yardFilterBar(v, total, shown) {
  if (document.getElementById("yard-filters")) return;
  const bar = document.createElement("div");
  bar.id = "yard-filters";
  bar.className = "kv";

  const search = document.createElement("input");
  search.type = "search";
  search.value = yardFilters.text;
  search.placeholder = "search by name, sire or dam";
  search.setAttribute("data-filter", "text");
  search.addEventListener("input", () => {
    yardFilters.text = search.value;
    renderYardCards(view);
  });
  bar.append(search);

  for (const spec of YARD_FILTERS) {
    const select = document.createElement("select");
    select.setAttribute("data-filter", spec.key);
    select.title = `filter by ${spec.label}`;
    for (const [value, text] of spec.options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = `${spec.label}: ${text}`;
      if (yardFilters[spec.key] === value) option.selected = true;
      select.append(option);
    }
    select.addEventListener("change", () => {
      yardFilters[spec.key] = select.value;
      renderYardCards(view);
    });
    bar.append(select);
  }

  const clear = document.createElement("button");
  clear.className = "tiny";
  clear.textContent = "clear";
  clear.addEventListener("click", () => {
    Object.assign(yardFilters, {
      text: "",
      sex: "any",
      age: "any",
      wins: "any",
      value: "any",
      sort: "default",
    });
    for (const node of bar.querySelectorAll("[data-filter]")) {
      // Each control's first option is its neutral value, so clearing cannot miss one that
      // gets added later.
      if (node.tagName === "SELECT") node.value = node.options[0].value;
      else node.value = "";
    }
    renderYardCards(view);
  });
  bar.append(clear);

  const count = document.createElement("span");
  count.id = "yard-count";
  count.className = "hint";
  bar.append(count);
  count.textContent = `showing ${shown} of ${total}`;

  const table = el("herd") && el("herd").closest("table");
  if (table && table.parentElement) table.parentElement.insertBefore(bar, table);
}

function renderYardCards(v) {
  const herd = el("herd");
  const table = herd && herd.closest("table");
  if (!table || !table.parentElement) return;
  const old = document.getElementById("yard-cards");
  if (old) old.remove();
  table.hidden = v.horses.length > 0; // the cards are the Yard now

  const cards = document.createElement("div");
  cards.id = "yard-cards";

  // The filters narrow what is DRAWN. Nothing is hidden from the rules, and the count says
  // so rather than leaving a player to wonder where a horse went.
  const shown = v.horses.filter((horse) => yardMatches(horse, v));
  // Ordering happens on the list that survived the filters: sorting the whole barn and then
  // filtering would leave the top of the yard at the top of nothing. Ties fall back to the
  // name, so two horses of the same age never swap places between redraws.
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const order = yardFilters.sort;
  if (order === "young") shown.sort((a, b) => (a.age ?? 0) - (b.age ?? 0) || byName(a, b));
  if (order === "old") shown.sort((a, b) => (b.age ?? 0) - (a.age ?? 0) || byName(a, b));
  if (order === "wins") shown.sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || byName(a, b));
  if (order === "value") shown.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || byName(a, b));
  if (order === "name") shown.sort(byName);

  yardFilterBar(v, v.horses.length, shown.length);
  const count = document.getElementById("yard-count");
  if (count) count.textContent = `showing ${nf(shown.length)} of ${nf(v.horses.length)}`;

  if (!shown.length) {
    const none = document.createElement("p");
    none.className = "hint";
    none.textContent = "No horse matches those filters - clear them above to see the yard again.";
    cards.append(none);
  }

  for (const horse of shown) {
    const card = document.createElement("div");
    card.className = "lot";
    if (horse.id === selectedHorse) card.classList.add("selected");

    const head = document.createElement("div");
    head.className = "name";
    head.append(horseArt(horse.lineage, horse.age));
    const coat = document.createElement("span");
    coat.className = "coat-inline";
    coat.innerHTML = coatSvg(appearanceFor(horse));
    coat.title = appearanceFor(horse).label;
    head.append(coat);
    const title = document.createElement("span");
    title.textContent = horse.name;
    head.append(title);
    const tags = [
      [horse.sex === "M" ? "colt" : "filly", ""],
      [`age ${nf(horse.age)}`, ""],
      [horse.stakes ? "stakes" : null, "stakes"],
      [horse.retired ? "retired" : null, "retired"],
      [horse.soulbound ? "soulbound" : null, "brass"],
      [horse.inFoal ? "in foal" : null, "brass"],
    ];
    for (const [text, cls] of tags) {
      if (!text) continue;
      const tag = document.createElement("span");
      tag.className = `tag ${cls}`.trim();
      tag.textContent = text;
      head.append(tag);
    }
    card.append(head);

    // The record. It is the one block a player reads to remember the horse by.
    const record = document.createElement("div");
    record.className = "kv";
    const times = (count, one, many) => `${nf(count)} ${count === 1 ? one : many}`;
    record.textContent = horse.starts
      ? `${times(horse.starts, "run", "runs")} · ${times(horse.wins, "win", "wins")} · ` +
        `${times(horse.places, "placing", "placings")} · ₲ ${nf(horse.earnings)} earned` +
        (horse.best
          ? ` · best: ${nf(horse.best.place)} of ${nf(horse.best.of)}, season ${nf(horse.best.season)}`
          : "")
      : "Unraced: nothing on his card yet.";
    card.append(record);

    const ratio = v.field && v.field.mean ? horse.value / v.field.mean : 1;
    const stats = document.createElement("div");
    stats.className = "kv";
    stats.textContent =
      `value ${nf(horse.value, 2)} = ${nf(ratio, 2)}x the field` +
      (horse.condition ? ` · ${horse.condition}` : "") +
      ` · upkeep ₲ ${nf(horse.upkeep)}`;
    card.append(stats);

    if (horse.traits) card.append(traitBars(horse.traits));

    const actions = document.createElement("div");
    actions.className = "kv";
    const entered = v.stable.entries.includes(horse.id);
    const action = (kind, label, off, why) => {
      const node = document.createElement("button");
      node.className = "tiny";
      node.textContent = label;
      node.disabled = Boolean(off);
      node.title = why;
      node.setAttribute("data-horse-act", kind);
      node.setAttribute("data-horse-id", horse.id);
      return node;
    };
    actions.append(
      action(
        "enter",
        entered ? "entered" : "enter",
        horse.age < 2 || horse.retired,
        entered ? "Withdraw from this meeting." : "Enter this meeting.",
      ),
      action(
        "breed",
        "breed",
        horse.sex !== "F" || !selectedStraw || Boolean(horse.inFoal),
        horse.sex !== "F"
          ? "Only a mare can be covered."
          : horse.inFoal
            ? "She is in foal: the foal arrives when the season turns."
            : !selectedStraw
              ? v.straws.length
                ? "Pick a covering first."
                : "You hold no covering - take the first covering in your account, or buy one in the Stud market."
              : "Cover her: the covering is spent and the foal arrives when the season turns.",
      ),
      action(
        "sell",
        horse.soulbound ? "soulbound" : "sell",
        horse.soulbound,
        horse.soulbound
          ? "A gift horse: she can never be sold or consigned, but her foals can."
          : "Sell to the house at once.",
      ),
      action(
        "consign",
        "consign",
        v.horses.length <= 1 || Boolean(horse.soulbound),
        horse.soulbound
          ? "Soulbound: she cannot be consigned, but her foals can."
          : v.horses.length <= 1
            ? "This is your last horse: sell or breed another before consigning her."
            : `Offer her in the ring for ₲ ${nf(Math.max(25, horse.suggestedPrice ?? 100))}.`,
      ),
    );
    card.append(actions);
    cards.append(card);
  }

  table.parentElement.insertBefore(cards, table);
}

/**
 * The closing moment. A season hands the player bills, births, sales and results as separate
 * log lines; this says the whole of it in one breath, above the herd, and stays there as the
 * recap of where the yard stands.
 */
/**
 * The paddock. The runners used to appear only in the result, so a player read "finished 7 of 10"
 * without ever seeing the nine. This is the field as declared: who runs, for which stable, how he
 * stands against this field, what he has done, and the instruction he is likely to run with.
 */
/**
 * The stable's firsts. A yard is mostly told what it IS - bank, horses, values - and rarely what
 * it has DONE for the first time. This is the part of progress that never shows in a balance.
 */
function renderFirsts(v) {
  const herd = el("herd");
  const table = herd && herd.closest("table");
  if (!table || !table.parentElement) return;
  const old = document.getElementById("firsts");
  if (old) old.remove();
  const firsts = v.firsts;
  if (!firsts) return;

  const lines = [];
  if (firsts.win) lines.push(`first win — season ${nf(firsts.win.season)}, ${firsts.win.where}, with ${firsts.win.horse}`);
  if (firsts.place) lines.push(`first placing — ${firsts.place.at === 2 ? "2nd" : "3rd"} in season ${nf(firsts.place.season)}, ${firsts.place.where}`);
  if (firsts.foal) lines.push(`first foal — season ${nf(firsts.foal.season)}, ${firsts.foal.name}`);
  if (firsts.stakes) lines.push(`first stakes horse — ${firsts.stakes.name}, season ${nf(firsts.stakes.season)}`);

  const strip = document.createElement("div");
  strip.id = "firsts";
  // The strip ALWAYS renders. A stable with no firsts yet is not a stable with nothing to say:
  // the empty state is where the aim belongs, and an aim is exactly what the opening seasons
  // were missing - they offered a balance and no goal. It also makes the check for this
  // feature deterministic, because the strip's presence no longer depends on luck.
  const body = lines.length
    ? lines.join(" · ")
    : "none yet — win a meeting, or breed your first foal";
  strip.innerHTML =
    `<div class="kv"><b>FIRSTS${lines.length ? ` · ${nf(lines.length)}` : ""}</b><span>${esc(body)}</span></div>`;
  table.parentElement.insertBefore(strip, table);
}

function renderPaddock(v) {
  const box = el("meeting");
  if (!box || !box.parentElement) return;
  const old = document.getElementById("paddock");
  if (old) old.remove();
  const rows = Array.isArray(v.paddock) ? v.paddock : [];
  if (!rows.length) return;

  const mean = v.field && v.field.mean ? v.field.mean : 0;
  const wrap = document.createElement("div");
  wrap.id = "paddock";
  wrap.className = "field-card";
  // A runner table: name and line, stable and record, form against this field as a bar, and
  // the instruction he is likely to run with. The same facts as before, readable at a glance.
  const tactic = (value) => (["push", "steady", "hold"].includes(value) ? value : "steady");
  wrap.innerHTML =
    `<div class="field-head"><h3>The field</h3><span class="count">${nf(rows.length)} declared</span>` +
    `<p>who runs, before the off: study the rival now, not at the finish line</p></div>` +
    `<ol class="field-list">` +
    rows
      .map((row) => {
        const ratio = mean ? row.value / mean : 0;
        const width = Math.max(4, Math.min(100, Math.round((ratio / 1.6) * 100)));
        const against = mean ? `${nf(ratio, 2)}x the field` : `value ${nf(row.value, 2)}`;
        const record = row.runs ? `${nf(row.runs)} runs, ${nf(row.wins)} won` : "unraced";
        const line = String(row.name ?? "").match(/^(.*?)\s*\((L\d+)\)$/);
        const name = line ? line[1] : row.name;
        return (
          `<li class="runner${row.mine ? " mine" : ""}">` +
          `<span class="runner-name">${row.mine ? "<em>your runner</em>" : ""}${esc(name)}${line ? `<small>${esc(line[2])}</small>` : ""}</span>` +
          `<span class="runner-stable">${esc(row.stable)}<span>${record}</span></span>` +
          `<span class="runner-form"><span>${against}</span><i style="--form:${width}%"></i></span>` +
          `<span class="runner-tags"><span class="tag">${tactic(row.tactic)}</span>` +
          `${row.stakes ? `<span class="tag elite">stakes class</span>` : ""}</span></li>`
        );
      })
      .join("") +
    `</ol>`;
  box.parentElement.insertBefore(wrap, box);
}

function renderSeasonReport(v) {
  const herd = el("herd");
  const table = herd && herd.closest("table");
  if (!table || !table.parentElement) return;
  const old = document.getElementById("season-report");
  if (old) old.remove();
  const report = v.seasonReport;
  if (!report) return;

  const strip = document.createElement("div");
  strip.id = "season-report";
  strip.className = "kv";
  const money =
    report.bank >= 0 ? `₲ ${nf(report.bank)} up` : `₲ ${nf(-report.bank)} down`;
  const foals = report.born.length === 1 ? "foal" : "foals";
  strip.innerHTML =
    `<div class="kv"><b>Season ${nf(report.season)} closed</b><span>` +
    `the yard finished ${money} · ${nf(report.runs)} runs, ${nf(report.wins)} won, ` +
    `${nf(report.places)} placed, ₲ ${nf(report.prizes)} in prizes` +
    (report.born.length ? ` · ${nf(report.born.length)} ${foals} born: ${esc(report.born.join(", "))}` : "") +
    (report.retired ? ` · ${nf(report.retired)} retired` : "") +
    (report.forced ? ` · ${nf(report.forced)} sold to pay debts` : "") +
    `</span></div>`;
  table.parentElement.insertBefore(strip, table);
}

function renderOpening(v) {
  const herd = el("herd");
  const anchor = herd && herd.closest("table");
  if (!anchor || !anchor.parentElement) return;
  const old = document.getElementById("opening");
  if (old) old.remove();

  const round = v.round ?? 1;
  if (round > 1 || (v.season ?? 1) > 1) return; // the opening is over

  const covering = v.straws.length;
  const taken = Boolean(v.starterOffer && v.starterOffer.taken);
  const mare = v.horses.find((horse) => horse.sex === "F" && !horse.retired);
  const inFoal = Boolean(mare && mare.inFoal);
  const price = v.starterOffer ? v.starterOffer.price : 20;

  const strip = document.createElement("div");
  strip.id = "opening";
  strip.innerHTML =
    `<div class="kv"><b>Getting started</b><span>One mare, no covering. The covering is what ` +
    `makes her a breeding stable, and her foal is the first horse you may sell.</span></div>`;

  const steps = [
    {
      done: taken || covering > 0,
      label: taken || covering > 0 ? "a covering is in the barn" : `take the first covering in your account · ₲ ${nf(price)}`,
      why: "Once per stable, at the cheapest price you will ever see.",
      run: () => act({ type: "takeStarterOffer" }),
    },
    {
      done: inFoal,
      label: inFoal ? "she is in foal: the foal arrives when the season turns" : "cover her with it",
      why: "The covering is spent and the foal is due next season.",
      run: () => showScreen("breeding"),
    },
    {
      done: false,
      label: `run meeting ${nf(round)} of ${nf(v.meetingsPerSeason ?? 4)}`,
      why: "The meeting pays the yard, and upkeep is charged when the season turns.",
      // this button says "run": it runs, instead of walking the player to a screen that looks the same
      run: () => {
        if (view?.stable?.entries?.length) {
          act({ type: "advance" });
          showScreen("racing");
        } else {
          showScreen("racing");
          toast("enter a runner first — the enter button sits on each row", true);
        }
      },
    },
  ];

  steps.forEach((step, index) => {
    const row = document.createElement("div");
    row.className = "kv";
    const mark = document.createElement("b");
    mark.textContent = step.done ? "✓" : `${index + 1}.`;
    row.append(mark);
    if (step.done) {
      const text = document.createElement("span");
      text.textContent = step.label;
      row.append(text);
    } else {
      const button = document.createElement("button");
      button.className = "tiny";
      button.textContent = step.label;
      button.title = step.why;
      button.addEventListener("click", step.run);
      const why = document.createElement("span");
      why.className = "hint";
      why.textContent = step.why;
      row.append(button, why);
    }
    strip.append(row);
  });

  anchor.parentElement.insertBefore(strip, anchor);
}

/** The weakest trait a horse has: what conditioning should fix first. */
function weakestTrait(traits) {
  const entries = Object.entries(traits ?? {});
  if (!entries.length) return "speed";
  return entries.sort((a, b) => a[1] - b[1])[0][0];
}

function shopTarget(v) {
  const id = selectedHorse ?? v.horses.find((horse) => !horse.retired)?.id ?? null;
  return v.horses.find((horse) => horse.id === id) ?? null;
}

/** A horse you do not own: what a catalogue page is actually for. */
function marketTarget(v) {
  const lot = (v.listings ?? []).find((entry) => entry.kind === "horse" && !entry.mine);
  return lot ? { id: lot.horseId, name: lot.horseName, traits: lot.horseTraits } : null;
}

const SHOP_ICONS = {
  catalogue:
    '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 9c4-2 8-2 12 1v22c-4-3-8-3-12-1z"/><path d="M32 9c-4-2-8-2-12 1v22c4-3 8-3 12-1z"/><path d="M11 15h5M11 20h5M24 15h5M24 20h5"/></svg>',
  feed:
    '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 12h16l3 20H9z"/><path d="M14 12c0-3 2-5 6-5s6 2 6 5"/><path d="M15 20c3 2 7 2 10 0M16 26c2 1.5 6 1.5 8 0"/></svg>',
  pass:
    '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 13h26v5a3 3 0 0 0 0 6v5H7v-5a3 3 0 0 0 0-6z"/><path d="M24 13v16" stroke-dasharray="2 3"/><path d="M12 19h7M12 23h5"/></svg>',
};

function renderShop(v) {
  const box = el("shop");
  if (box) {
    box.innerHTML = "";
    for (const item of v.items ?? []) {
      const card = document.createElement("div");
      card.className = "lot shop-item";
      // a drawn mark for each thing on the shelf: the catalogue page, the feed sack, the pass
      const icon = document.createElement("span");
      icon.className = "shop-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = SHOP_ICONS[item.key] ?? SHOP_ICONS.catalogue;
      card.append(icon);
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = item.name;
      const blurb = document.createElement("div");
      blurb.className = "hint";
      blurb.textContent = item.blurb;
      const price = document.createElement("div");
      price.className = "kv";
      price.innerHTML = `<span>price</span><b>${nf(item.price)} ₲</b>`;
      const held = document.createElement("div");
      held.className = "kv";
      held.innerHTML = `<span>in the barn</span><b>${nf(item.held)}</b>`;
      const row = document.createElement("div");
      row.className = "row";
      const buy = document.createElement("button");
      buy.className = "tiny brass";
      buy.textContent = `buy · ${nf(item.price)} ₲`;
      buy.addEventListener("click", () => act({ type: "buyItem", item: item.key }));
      const use = document.createElement("button");
      use.className = "tiny";
      use.textContent = "use";
      use.disabled = !(item.held > 0);
      use.addEventListener("click", () => {
        if (item.key === "pass") {
          act({ type: "useItem", item: "pass" });
          return;
        }
        const horse = item.key === "catalogue" ? marketTarget(v) : shopTarget(v);
        if (!horse) {
          return toast(item.key === "catalogue" ? "open it on a lot in the horse market" : "pick a horse in the yard first", true);
        }
        act({ type: "useItem", item: item.key, horseId: horse.id, trait: weakestTrait(horse.traits) });
      });
      row.append(buy, use);
      card.append(name, blurb, price, held, row);
      box.append(card);
    }
  }

  const yard = el("yearlings");
  if (!yard) return;
  yard.innerHTML = "";
  const young = (v.horses ?? []).filter((horse) => horse.age <= 1 && !horse.retired);
  const head = document.createElement("h3");
  head.textContent = young.length ? "Yearlings: bring one on" : "No yearlings in the yard";
  yard.append(head);
  if (!young.length) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "A foal arrives when the season turns. Cover a mare and wait for it.";
    yard.append(hint);
    return;
  }
  for (const horse of young) {
    const row = document.createElement("div");
    row.className = "entry";
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `${horse.name} · age ${nf(horse.age)}`;
    const prep = document.createElement("button");
    prep.className = "tiny";
    prep.textContent = `prep ${weakestTrait(horse.traits)} · ${nf(v.prepCost)} ₲`;
    prep.addEventListener("click", () => act({ type: "prepFoal", horseId: horse.id, trait: weakestTrait(horse.traits) }));
    row.append(who, prep);
    yard.append(row);
  }
}


/** The catalogue that spans rooms: only meaningful when there is a server. */
let worldLots = null;
let worldError = null;

async function loadWorldMarket() {
  if (!CLOUD() || !socket?.call) return;
  try {
    const out = await cloudApi("/api/market", {});
    const here = view?.room?.id;
    worldLots = (out.lots ?? []).filter((lot) => lot.roomId !== here);
    worldError = null;
  } catch (error) {
    worldError = error.message;
  }
  renderWorldMarket();
  renderTokens();
}

function renderWorldMarket() {
  const box = el("world-market");
  if (!box) return;
  box.innerHTML = "";
  if (!CLOUD()) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Offline: the world market needs the server. Play online to trade across rooms.";
    box.append(hint);
    return;
  }
  if (worldError) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = `Could not read the catalogue: ${worldError}`;
    box.append(hint);
    return;
  }
  if (!worldLots) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "reading the catalogue…";
    box.append(hint);
    loadWorldMarket();
    return;
  }
  if (!worldLots.length) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "No lots from other rooms just now.";
    box.append(hint);
    return;
  }
  // the same lot many times over (a room listing five doses of one stallion at one price) is one
  // card with a count, as in the local catalogue
  const grouped = new Map();
  for (const lot of worldLots) {
    const key = [lot.kind, lot.horseName, lot.roomId, lot.sellerName, lot.price].join("|");
    const entry = grouped.get(key);
    if (entry) entry.count += 1;
    else grouped.set(key, { lot, count: 1 });
  }
  for (const { lot, count } of [...grouped.values()].slice(0, 24)) {
    const card = document.createElement("div");
    card.className = "lot";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = lot.horseName;
    if (count > 1) {
      const badge = document.createElement("span");
      badge.className = "tag";
      badge.textContent = `${nf(count)} doses`;
      name.append(" ", badge);
    }
    const meta = document.createElement("div");
    meta.className = "kv";
    meta.innerHTML = `<span>${esc(lot.kind)} · room ${esc(lot.roomCode)} · ${esc(lot.sellerName)}</span><b>₲ ${nf(lot.price)}</b>`;
    const row = document.createElement("div");
    row.className = "row";
    const buy = document.createElement("button");
    buy.className = "tiny brass";
    buy.textContent = `buy · ${nf(lot.price)} ₲`;
    buy.addEventListener("click", async () => {
      buy.disabled = true;
      try {
        await cloudApi("/api/market/buy", {
          method: "POST",
          token: tokenStore.get(),
          body: { roomId: lot.roomId, listingId: lot.listingId },
        });
        toast(`bought ${lot.horseName}`);
        worldLots = null;
        socket.send(JSON.stringify({ type: "join" })); // refresh the yard
        loadWorldMarket();
      } catch (error) {
        buy.disabled = false;
        toast(error.message, true);
      }
    });
    row.append(buy);
    card.append(name, meta, row);
    box.append(card);
  }
}


/** Your tokens: what the server holds, and the one button that puts it on chain. */
let tokenRows = null;
let tokenError = null;

async function loadTokens() {
  if (!CLOUD()) return;
  try {
    const out = await cloudApi("/api/mints", { token: tokenStore.get() });
    tokenRows = out.mints ?? [];
    tokenError = null;
  } catch (error) {
    tokenError = error.message;
  }
  renderTokens();
}

function renderTokens() {
  const box = el("tokens");
  if (!box) return;
  box.innerHTML = "";
  // the first thing read in this section: nothing here is on a real chain
  const sim = document.createElement("p");
  sim.className = "sim-banner";
  sim.innerHTML = `<b>SIMULATED</b><span>No token here exists on a real blockchain. Tokens, receipts and claims are a demonstration; nothing can be sold for real money.</span>`;
  box.append(sim);

  if (!CLOUD()) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "Tokens need the server. Play online to hold horses on chain.";
    box.append(note);
    return;
  }
  if (tokenError) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = `Could not read your tokens: ${tokenError}`;
    box.append(note);
    return;
  }
  if (!tokenRows) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "reading…";
    box.append(note);
    loadTokens();
    return;
  }
  if (!tokenRows.length) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "No horses yet. Cover a mare and wait for the foal.";
    box.append(note);
    return;
  }

  const table = document.createElement("table");
  table.setAttribute("aria-label", "Your tokens");
  table.innerHTML =
    `<thead><tr><th scope="col">horse</th><th scope="col">status</th>` +
    `<th scope="col">token</th><th scope="col">receipt</th><th scope="col"></th></tr></thead>`;
  const body = document.createElement("tbody");
  for (const row of tokenRows) {
    const tr = document.createElement("tr");
    tr.className = row.status === "minted" ? "entered" : "";
    const chip = row.status === "minted" ? "minted" : row.status === "pending" ? "pending" : "unclaimed";
    tr.innerHTML =
      `<td>${esc(row.name ?? row.horseId)}<div class="hint">sage ${nf(row.bornSeason ?? 0)} · ${row.sex === 0 ? "mare" : "colt"}</div></td>` +
      `<td><span class="tag ${chip === "minted" ? "stakes" : ""}">${esc(chip)}</span></td>` +
      `<td class="num">${row.tokenId ? "#" + nf(row.tokenId) : "—"}</td>` +
      `<td class="hint">${esc(String(row.txHash ?? "—").slice(0, 18))}</td>`;
    const cell = document.createElement("td");
    if (row.status === "pending") {
      const mint = document.createElement("button");
      mint.type = "button";
      mint.className = "tiny brass";
      mint.textContent = "mint";
      mint.addEventListener("click", async () => {
        mint.disabled = true;
        try {
          await cloudApi("/api/mints/sign", {
            method: "POST",
            token: tokenStore.get(),
            body: { nullifier: row.nullifier },
          });
          await cloudApi("/api/mints/confirm", {
            method: "POST",
            token: tokenStore.get(),
            body: { nullifier: row.nullifier },
          });
          toast(`${row.name} is on chain`);
          tokenRows = null;
          loadTokens();
        } catch (error) {
          mint.disabled = false;
          toast(error.message, true);
        }
      });
      cell.append(mint);
    } else if (row.status === "unclaimed") {
      const note = document.createElement("span");
      note.className = "hint";
      note.textContent = "bind a wallet";
      cell.append(note);
    }
    tr.append(cell);
    body.append(tr);
  }
  table.append(body);
  box.append(table);

  const boundWallet = tokenRows.map((row) => row.address).find(Boolean) ?? null;
  if (boundWallet) {
    const line = document.createElement("div");
    line.className = "row wallet-row";
    const shown = document.createElement("span");
    shown.className = "hint";
    shown.textContent = `wallet ${boundWallet.slice(0, 6)}…${boundWallet.slice(-4)}`;
    const change = document.createElement("button");
    change.type = "button";
    change.className = "tiny";
    change.textContent = "change";
    change.addEventListener("click", () => {
      line.replaceWith(bindForm(tokenRows, "bind a different wallet:"));
    });
    line.append(shown, change);
    box.append(line);
  }

  // Anyone still unclaimed gets the one field that fixes it.
  if (tokenRows.some((row) => row.status === "unclaimed")) {
    box.append(bindForm(tokenRows, "bind a wallet to claim them:"));
  }
}

/** The address field, used both to bind the first wallet and to change it. */
function bindForm(rows, labelText) {
    const row = document.createElement("div");
    row.className = "row wallet-row";
    const label = document.createElement("span");
    label.className = "hint";
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "0x…";
    input.maxLength = 42;
    input.spellcheck = false;
    input.setAttribute("aria-label", "Wallet address");
    const bind = document.createElement("button");
    bind.type = "button";
    bind.className = "tiny brass";
    bind.textContent = "bind";
    bind.addEventListener("click", async () => {
      const address = input.value.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        toast("that is not an address: 0x and 40 hex characters", true);
        return;
      }
      bind.disabled = true;
      try {
        await cloudApi("/api/wallet", {
          method: "POST",
          token: tokenStore.get(),
          body: { address },
        });
        toast("wallet bound — your horses are claimable");
        tokenRows = null;
        loadTokens();
      } catch (error) {
        bind.disabled = false;
        toast(error.message, true);
      }
    });
    row.append(label, input, bind);
    return row;
}

function renderRanking(v) {
  const box = el("ranking");
  if (!box) return;
  box.tabIndex = 0;
  box.setAttribute("role", "region");
  box.setAttribute("aria-label", "Stable rankings; scroll horizontally on small screens");
  box.innerHTML = "";
  // the podium: the top three as medals, gold in the middle, before the full table
  const top = (v.ranking ?? []).slice(0, 3);
  if (top.length) {
    const podium = document.createElement("div");
    podium.className = "podium";
    const order = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i);
    for (const index of order) {
      const row = top[index];
      const step = document.createElement("div");
      step.className = `podium-step place-${index + 1}` + (row.id === v.stable?.id ? " mine" : "");
      const medal = document.createElement("span");
      medal.className = "podium-medal";
      medal.textContent = String(index + 1);
      const name = document.createElement("b");
      name.className = "podium-name";
      name.textContent = row.name;
      const who = document.createElement("span");
      who.className = "podium-who";
      who.textContent = row.id === v.stable?.id ? "you" : row.rival ? "house" : "rival";
      const prize = document.createElement("span");
      prize.className = "podium-prize";
      prize.textContent = `₲ ${nf(row.prizes)}`;
      const line = document.createElement("span");
      line.className = "podium-line";
      for (const [i, text] of [`${nf(row.wins)} wins`, `best ${nf(row.best, 2)}`].entries()) {
        if (i) line.append(document.createTextNode(" · "));
        const part = document.createElement("span");
        part.textContent = text;
        line.append(part);
      }
      const block = document.createElement("span");
      block.className = "podium-block";
      step.append(medal, name, who, prize, line, block);
      podium.append(step);
    }
    box.append(podium);
  }
  const table = document.createElement("table");
  table.setAttribute("aria-label", "Stables ranked by prize money");
  table.innerHTML =
    `<thead><tr><th scope="col">#</th><th scope="col">stable</th><th scope="col">wins</th>` +
    `<th scope="col">prizes</th><th scope="col">best horse</th><th scope="col">horses</th></tr></thead>`;
  const body = document.createElement("tbody");
  (v.ranking ?? []).forEach((row, index) => {
    const tr = document.createElement("tr");
    if (row.id === v.stable?.id) tr.className = "entered";
    tr.innerHTML =
      `<td class="num">${index + 1}</td>` +
      `<td>${esc(row.name)}${row.rival ? ' <span class="hint">house</span>' : ""}</td>` +
      `<td class="num">${nf(row.wins)}</td>` +
      `<td class="num">₲ ${nf(row.prizes)}</td>` +
      `<td class="num">${nf(row.best, 2)}</td>` +
      `<td class="num">${nf(row.horses)}</td>`;
    body.append(tr);
  });
  table.append(body);
  box.append(table);

  const board = v.honours ?? [];
  if (board.length) {
    const head = document.createElement("h3");
    head.textContent = "Champions";
    head.className = "board-head";
    box.append(head);
    const list = document.createElement("ul");
    list.className = "board";
    list.innerHTML = board
      .map(
        (row) =>
          `<li><b>S${nf(row.season)}</b> ${esc(row.name)} <span class="hint">· ₲ ${nf(row.prizes)} · ${nf(row.wins)} won</span></li>`,
      )
      .join("");
    box.append(list);
  }
}


/** The stable as a wall of animals, not a spreadsheet: the Axie lesson, taken seriously. */

/** Clicking a horse should show the horse: a plate, the pedigree, the record, the decision. */
function openHorse(horseId) {
  const horse = (view?.horses ?? []).find((h) => h.id === horseId);
  const box = el("horseview");
  const card = el("horseview-card");
  if (!horse || !box || !card) return;

  card.innerHTML = "";

  const appearance = appearanceFor(horse);
  const portrait = document.createElement("img");
  portrait.className = "hv-portrait";
  portrait.alt = "";
  paintCoat(portrait, portraitOf(horse.lineage, horse.age), appearance);
  card.append(portrait);

  const coat = document.createElement("div");
  coat.className = "hv-coat";
  coat.innerHTML = `<i class="coat-swatch" style="background:${appearance.bodyColor}"></i>`;
  const coatName = document.createElement("span");
  coatName.textContent = appearance.labelPt;
  coat.append(coatName);
  card.append(coat);

  const stamp = document.createElement("span");
  stamp.className = "stamp" + (horse.stakes ? " high" : "");
  stamp.textContent = horse.stakes ? "stakes class" : horse.band ?? "ordinary";
  card.append(stamp);

  const name = document.createElement("h3");
  name.textContent = horse.name;
  card.append(name);

  const verdict = document.createElement("p");
  verdict.className = "hint";
  verdict.textContent = horse.verdict ?? "";
  card.append(verdict);

  const facts = document.createElement("div");
  facts.className = "lines";
  const rows = [
    ["sex · age", `${horse.sex === "M" ? "colt" : "filly"} · ${nf(horse.age)}`],
    ["value", `₲ ${nf(horse.value, 2)}`],
    ["inbreeding", `${horse.fLabel ?? "—"}`],
    ["record", horse.starts ? `${nf(horse.starts)} runs · ${nf(horse.wins)} won · ${nf(horse.places)} placed` : "unraced"],
    ["upkeep", `₲ ${nf(horse.upkeep)} a season`],
    ["sire × dam", `${horse.sireName ?? "founder"} × ${horse.damName ?? "founder"}`],
  ];
  if (horse.inFoal) rows.push(["in foal", `due season ${nf(horse.inFoal.dueSeason)}`]);
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    const left = document.createElement("span");
    left.className = "k";
    left.textContent = label;
    const right = document.createElement("span");
    right.textContent = value;
    row.append(left, right);
    facts.append(row);
  }
  card.append(facts);

  if (horse.traits) {
    const bars = traitBars(horse.traits);
    bars.className += " hv-traits";
    card.append(bars);
  }

  const close = document.createElement("button");
  close.className = "tiny";
  close.style.marginTop = "0.8rem";
  close.textContent = "close";
  close.addEventListener("click", () => {
    box.hidden = true;
  });
  card.append(close);

  box.hidden = false;
  close.focus();
}

function openHorse3D(horseId) {
  const horse = view?.horses?.find((h) => h.id === horseId);
  if (!horse) return toast("Select a horse first", true);
  const url = new URL("horse-3d.html", location.href);
  url.searchParams.set("horse", horse.id);
  if (!view.cloud) {
    url.searchParams.set("offline", "1");
    try { sessionStorage.setItem("studbook:3d-selection", JSON.stringify({ id: horse.id, name: horse.name, age: horse.age, sex: horse.sex, lineage: horse.lineage })); } catch {}
  }
  location.href = url.href;
}

el("open3d")?.addEventListener("click", () => openHorse3D(selectedHorse ?? view?.horses?.[0]?.id));

/** Where a value sits against the field: the same bands the engine uses for horses. */
function bandOf(value, stakes, field) {
  if (stakes) return "stakes";
  if (field?.eliteCut && value >= field.eliteCut * 0.85) return "near elite";
  if (value >= (field?.mean ?? 0)) return "above the field";
  return "below the field";
}

/**
 * A market lot as a catalogue card: the animal in its coat, a value meter against the field
 * average and the elite cut, the price, and the actions. `count` > 1 groups identical doses.
 */
function lotCard(lot, v, count) {
  const isHorse = lot.kind === "horse";
  const id = isHorse ? lot.horseId : lot.sireId;
  const lineage = isHorse ? lot.horseLineage : lot.sireLineage;
  const value = isHorse ? lot.horseValue : lot.sireValue;
  const stakes = isHorse ? lot.horseStakes : lot.sireStakes;
  const band = bandOf(value, stakes, v.field);
  const card = document.createElement("div");
  card.className = `lot mlot band-${band.replace(/ /g, "-")}` + (lot.mine ? " mine" : "") + (lot.select ? " select-lot" : "");

  // the animal, repainted in its own coat
  const stage = document.createElement("div");
  stage.className = "mlot-stage";
  const photo = document.createElement("img");
  photo.alt = "";
  photo.loading = "lazy";
  photo.decoding = "async";
  const appearance = appearanceFor({ id, lineage });
  paintCoat(photo, portraitOf(lineage, isHorse ? lot.horseAge : 4), appearance);
  stage.append(photo);
  if (count > 1) {
    const doses = document.createElement("span");
    doses.className = "mlot-count";
    doses.textContent = `${nf(count)} doses`;
    stage.append(doses);
  }
  if (band === "stakes" || band === "near elite") {
    const tag = document.createElement("span");
    tag.className = "mlot-tag";
    tag.textContent = band === "stakes" ? "stakes class" : "near elite";
    stage.append(tag);
  }
  card.append(stage);

  const head = document.createElement("div");
  head.className = "name";
  head.textContent = isHorse ? lot.horseName : lot.sireName;
  card.append(head);
  const coat = document.createElement("div");
  coat.className = "mlot-coat";
  coat.innerHTML = `<i style="background:${appearance.bodyColor}"></i>`;
  const coatText = document.createElement("span");
  coatText.textContent = appearance.labelPt;
  coat.append(coatText);
  card.append(coat);
  if (isHorse) {
    const who = document.createElement("div");
    who.className = "mlot-who";
    who.textContent = `${lot.horseSex === "M" ? "colt" : "filly"} · age ${lot.horseAge}`;
    card.append(who);
  }

  // value against the field: the elite cut sits at 80% of the bar
  const meter = document.createElement("div");
  meter.className = "mlot-meter";
  const cut = v.field?.eliteCut || Math.max(1, value);
  const scale = (n) => Math.max(0, Math.min(100, (n / (cut * 1.25)) * 100));
  meter.innerHTML =
    `<div class="mlot-bar"><i style="width:${scale(value).toFixed(1)}%"></i>` +
    `<b class="mean" style="left:${scale(v.field?.mean ?? 0).toFixed(1)}%" title="field average"></b>` +
    `<b class="cut" style="left:${scale(cut).toFixed(1)}%" title="elite cut"></b></div>`;
  const label = document.createElement("div");
  label.className = "kv";
  label.innerHTML = `<span>${isHorse ? "value" : "sire value"}</span><b>${nf(value, 2)}</b>`;
  meter.append(label);
  card.append(meter);

  const price = document.createElement("div");
  price.className = "mlot-price";
  price.innerHTML = `<b>${nf(lot.price)} ₲</b><span>${esc(lot.sellerName)} · ${isHorse ? "horse lot" : "season " + lot.vintage}${lot.age >= 1 ? " · price cut each season it sits" : ""}</span>`;
  card.append(price);

  if (lot.select) {
    const badge = document.createElement("div");
    badge.className = "select";
    badge.textContent = `select sale: the house's best stallion, this season only · ${nf(lot.price)} ₲`;
    card.append(badge);
  }
  const shownTraits = isHorse ? lot.horseTraits : lot.sireTraits;
  if (shownTraits) {
    card.append(traitBars(shownTraits));
  } else {
    const locked = document.createElement("div");
    locked.className = "hint";
    locked.textContent = `traits are certified — ${nf(v.certifyCost)} ₲ to read this card`;
    card.append(locked);
  }
  if (!isHorse && lot.sireGenotype) {
    const geno = document.createElement("div");
    geno.className = "hint";
    geno.textContent = Object.entries(lot.sireGenotype)
      .map(([locus, pair]) => `${locus}:${pair.join("")}`)
      .join(" ");
    card.append(geno);
  }
  const row = document.createElement("div");
  row.className = "row";
  if (lot.mine) {
    const withdraw = document.createElement("button");
    withdraw.className = "tiny";
    withdraw.textContent = "withdraw";
    withdraw.addEventListener("click", () => act({ type: "unlistStraw", listingId: lot.id }));
    row.append(withdraw);
  } else {
    const buy = document.createElement("button");
    buy.className = "tiny brass";
    buy.textContent = isHorse ? `buy horse ${nf(lot.price)}₲` : `buy ${nf(lot.price)}₲`;
    buy.disabled = v.stable.guineas < lot.price;
    buy.title =
      v.stable.guineas < lot.price
        ? `Costs ₲ ${nf(lot.price)} and you hold ₲ ${nf(v.stable.guineas)}.`
        : "Buy this lot.";
    buy.addEventListener("click", () => act({ type: isHorse ? "buyHorse" : "buyStraw", listingId: lot.id }));
    row.append(buy);
    if (!isHorse && !lot.sireGenotype) {
      const certify = document.createElement("button");
      certify.className = "tiny";
      certify.textContent = "certify";
      certify.disabled = v.stable.guineas < v.certifyCost;
      certify.title =
        v.stable.guineas < v.certifyCost
          ? `Revealing a genotype costs ₲ ${nf(v.certifyCost)}.`
          : "Reveal this stallion's genotype and his hidden carriers.";
      certify.addEventListener("click", () => act({ type: "certify", horseId: lot.sireId }));
      row.append(certify);
    }
  }
  card.append(row);
  return card;
}

/**
 * The covering, shown: the chosen stallion in his coat beside a short read of what he brings.
 * Sits above the care choices; with no covering chosen it says where to find one.
 */
function renderSireBoard(v, host) {
  const straw = v.straws.find((entry) => entry.id === v.selectedStraw) ?? null;
  const board = document.createElement("div");
  board.className = "sireboard" + (straw ? "" : " empty");
  const stage = document.createElement("div");
  stage.className = "sireboard-stage";
  const photo = document.createElement("img");
  photo.alt = "";
  if (straw) {
    paintCoat(photo, portraitOf(straw.sireLineage, 4), appearanceFor({ id: straw.sire, lineage: straw.sireLineage }));
  } else {
    photo.src = "assets/art/plate-stallion.webp";
  }
  stage.append(photo);
  board.append(stage);
  const copy = document.createElement("div");
  copy.className = "sireboard-copy";
  const name = document.createElement("h3");
  name.textContent = straw ? straw.sireName : "no covering selected";
  copy.append(name);
  const sub = document.createElement("p");
  sub.className = "hint";
  sub.textContent = straw
    ? `collected in season ${straw.vintage}${straw.sireRetired ? " · retired" : ""}`
    : "pick one above";
  copy.append(sub);
  if (straw) {
    const band = bandOf(straw.sireValue, straw.sireStakes, v.field);
    const meter = document.createElement("div");
    meter.className = "mlot-meter";
    const cut = v.field?.eliteCut || Math.max(1, straw.sireValue);
    const scale = (n) => Math.max(0, Math.min(100, (n / (cut * 1.25)) * 100));
    meter.innerHTML =
      `<div class="mlot-bar"><i style="width:${scale(straw.sireValue).toFixed(1)}%"></i>` +
      `<b class="mean" style="left:${scale(v.field?.mean ?? 0).toFixed(1)}%" title="field average"></b>` +
      `<b class="cut" style="left:${scale(cut).toFixed(1)}%" title="elite cut"></b></div>`;
    const label = document.createElement("div");
    label.className = "kv";
    label.innerHTML = `<span>sire value</span><b>${nf(straw.sireValue, 2)}</b>`;
    meter.append(label);
    copy.append(meter);
    if (band === "stakes" || band === "near elite") {
      const tag = document.createElement("span");
      tag.className = "mlot-tag inline";
      tag.textContent = band === "stakes" ? "stakes class" : "near elite";
      copy.append(tag);
    }
  }
  board.append(copy);
  host.append(board);
}

/**
 * The mares as cards: each in her coat, facing the stallion, with what the cross would bring
 * (vigour from a new lineage, or the warning of the same one, and both parents' inbreeding)
 * and the button that covers her. The table stays in the page for small screens' sake as a
 * fallback, hidden while the cards are shown.
 */
function renderMareCards(v) {
  const body = el("mares");
  const table = body && body.closest("table");
  if (!table) return;
  const holder = table.parentElement;
  document.getElementById("mare-cards")?.remove();
  const mares = v.horses.filter((row) => row.sex === "F" && !row.retired);
  holder.hidden = mares.length > 0;
  if (!mares.length) return;
  const cards = document.createElement("div");
  cards.id = "mare-cards";
  const strawId = v.selectedStraw ?? null;
  for (const horse of mares) {
    const card = document.createElement("div");
    card.className = "mare" + (horse.inFoal ? " in-foal" : "");
    const stage = document.createElement("div");
    stage.className = "mare-stage";
    const photo = document.createElement("img");
    photo.alt = "";
    photo.loading = "lazy";
    paintCoat(photo, portraitOf(horse.lineage, horse.age), appearanceFor(horse));
    stage.append(photo);
    card.append(stage);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = horse.name;
    card.append(name);
    const meta = document.createElement("div");
    meta.className = "mare-meta";
    // separate pieces, so each is translated on its own
    for (const [i, text] of [`age ${nf(horse.age)}`, `value ${nf(horse.value, 2)}`, horse.band].entries()) {
      if (i) meta.append(document.createTextNode(" · "));
      const part = document.createElement("span");
      part.textContent = text;
      meta.append(part);
    }
    card.append(meta);

    const chips = document.createElement("div");
    chips.className = "mare-chips";
    const chip = (text, cls) => {
      const node = document.createElement("span");
      node.className = `chip ${cls}`;
      node.textContent = text;
      chips.append(node);
    };
    if (horse.inFoal) {
      chip("in foal", "gold");
    } else if (horse.pairing) {
      const p = horse.pairing;
      if (p.crossLineage) chip(`+${Math.round(p.vigour * 100)}% vigour`, "gold");
      else chip("same lineage", "warn");
      const worst = Math.max(p.sireF, p.damF);
      chip(`inbreeding ${nf(worst, 3)}`, worst > 0.2 ? "warn" : "calm");
      chip(`${nf(p.foalsLeft)} foals left`, "calm");
    } else {
      chip(horse.fLabel ?? `F ${nf(horse.f ?? 0, 3)}`, "calm");
    }
    card.append(chips);

    const breed = document.createElement("button");
    breed.className = "brass";
    breed.textContent = horse.inFoal ? "in foal" : "breed";
    breed.disabled = Boolean(horse.inFoal) || !strawId;
    breed.title = horse.inFoal
      ? "She is in foal: the foal arrives when the season turns."
      : !strawId
        ? v.straws.length
          ? "Pick a covering first."
          : "You hold no covering - take the first covering in your account, or buy one in the Stud market."
        : "Cover her: the covering is spent and the foal arrives when the season turns.";
    breed.setAttribute("data-horse-act", "breed");
    breed.setAttribute("data-horse-id", horse.id);
    card.append(breed);
    cards.append(card);
  }
  holder.parentElement.insertBefore(cards, holder);
}

/**
 * The living stable (assets/paddock-scene.js): the herd out in the paddock, each in its coat.
 * Loaded on first draw and kept between redraws, so a horse keeps walking where it was.
 */
let pasture = null;
let pastureLoading = null;
function renderPasture(herd) {
  const host = el("pasture");
  if (!host) return;
  host.hidden = !herd.length;
  const list = herd.map((horse) => ({
    id: horse.id,
    name: horse.name,
    age: horse.age,
    src: portraitOf(horse.lineage, horse.age),
    appearance: appearanceFor(horse),
    elite: Boolean(horse.stakes) || horse.band === "near elite",
  }));
  if (pasture) return pasture.set(list);
  pastureLoading ??= import("./paddock-scene.js?v=0.54.0").then(({ Paddock }) => {
    // ?pasture=dusk or ?pasture=day pins the light (previews); otherwise it follows the clock
    const pinned = new URLSearchParams(location.search).get("pasture");
    pasture = new Paddock(host, {
      reducedMotion: REDUCED_MOTION,
      dusk: pinned === "dusk" ? true : pinned === "day" ? false : undefined,
      onPick: (id) => {
        selectedHorse = id;
        openHorse(id);
        draw();
      },
    });
    pasture.start();
    return pasture;
  });
  pastureLoading.then((scene) => scene.set(list)).catch(() => { host.hidden = true; });
}

function renderGallery(v) {
  const box = el("gallery");
  if (!box) return;
  box.innerHTML = "";
  const herd = (v.horses ?? []).filter((horse) => !horse.retired).slice(0, 8);
  renderPasture(herd);
  for (const horse of herd) {
    const card = document.createElement("button");
    card.type = "button";
    const tier = horse.stakes
      ? "stakes"
      : horse.band === "near elite"
        ? "exceptional"
        : horse.band === "above the field"
          ? "promising"
          : "ordinary";
    card.className = `gcard tier-${tier}` + (horse.id === selectedHorse ? " picked" : "");
    card.setAttribute("aria-pressed", String(horse.id === selectedHorse));
    card.addEventListener("click", () => {
      selectedHorse = horse.id;
      openHorse(horse.id);
      draw();
    });
    if (tier === "stakes" || tier === "exceptional") {
      // foil: a sheen that sweeps on its own, and a light that follows the pointer with a tilt
      const shine = document.createElement("span");
      shine.className = "gshine";
      shine.setAttribute("aria-hidden", "true");
      card.append(shine);
      if (!REDUCED_MOTION) {
        card.addEventListener("pointermove", (event) => {
          const r = card.getBoundingClientRect();
          const x = (event.clientX - r.left) / r.width, y = (event.clientY - r.top) / r.height;
          card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
          card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
          card.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
          card.style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
        });
        card.addEventListener("pointerleave", () => {
          for (const k of ["--mx", "--my", "--rx", "--ry"]) card.style.removeProperty(k);
        });
      }
    }

    const appearance = appearanceFor(horse);
    const portrait = document.createElement("span");
    portrait.className = "gportrait";
    portrait.title = appearance.labelPt;
    const photo = document.createElement("img");
    photo.alt = "";
    photo.loading = "lazy";
    paintCoat(photo, portraitOf(horse.lineage, horse.age), appearance);
    portrait.append(photo);
    const seal = document.createElement("span");
    seal.className = "gseal";
    seal.title = "Selo de demonstração do Studbook — não é certificado on-chain";
    seal.innerHTML = `<b>SB</b><small>SEAL</small>`;
    portrait.append(seal);
    card.append(portrait);

    const strip = document.createElement("span");
    strip.className = "coat-strip";
    strip.innerHTML = `<i style="background:${appearance.bodyColor}"></i>`;
    const stripText = document.createElement("span");
    stripText.textContent = appearance.labelPt;
    strip.append(stripText);
    card.append(strip);

    const pedigree = document.createElement("span");
    pedigree.className = "gped";
    pedigree.textContent = `${horse.sireName ?? "founder"} × ${horse.damName ?? "founder"} · ${horse.lineage}`;
    card.append(pedigree);

    const name = document.createElement("span");
    name.className = "gname";
    name.textContent = horse.name;
    card.append(name);

    const meta = document.createElement("span");
    meta.className = "gmeta";
    meta.textContent = `${horse.sex === "M" ? "colt" : "filly"} · age ${nf(horse.age)}${horse.inFoal ? " · in foal" : ""}`;
    card.append(meta);

    const value = document.createElement("span");
    value.className = "gval";
    value.textContent = `₲ ${nf(horse.suggestedPrice)}`;
    card.append(value);

    if (horse.verdict) {
      const verdict = document.createElement("span");
      verdict.className = "gverdict";
      verdict.textContent = horse.verdict;
      card.append(verdict);
    }
    box.append(card);
  }
  if (!herd.length) {
    const empty = document.createElement("p");
    empty.className = "hint empty-state";
    empty.textContent = "No horses in training. Buy one in the horse market, or cover a mare.";
    box.append(empty);
  }
}


/** One instruction, one button. The tutorial that never ends, fed by the engine's own advice. */
const STEP_LABEL = {
  covering: "take it",
  select: "select it",
  breed: "cover her",
  enter: "enter runners",
  run: "run the meeting",
  buy: "to the market",
  rebuild: "buy it",
};

/** A deadline said the way a person reads it. */
function remaining(closesAt) {
  const ms = Math.max(0, Number(closesAt) - Date.now());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** The meeting clock: brass in the last minute, a red pulse in the last fifteen seconds. */
function tickCountdowns() {
  for (const node of document.querySelectorAll(".countdown")) {
    const left = Number(node.dataset.closes) - Date.now();
    node.textContent = remaining(node.dataset.closes);
    node.classList.toggle("soon", left <= 60_000 && left > 15_000);
    node.classList.toggle("urgent", left <= 15_000);
  }
}
setInterval(tickCountdowns, 1000);

function renderNextStep(v) {
  const box = el("nextstep");
  if (!box) return;
  box.innerHTML = "";
  const step = v.nextStep;
  if (!step || !step.text) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const text = document.createElement("p");
  text.className = "nextstep-text";
  text.textContent = step.text;
  box.append(text);
  // In a room the clock runs the meeting: the player gets a countdown, not a button.
  const clockRunsIt = Boolean(v.room) && step.action?.type === "advance";
  if (step.action && !clockRunsIt) {
    const go = document.createElement("button");
    go.type = "button";
    go.id = "nextstep-go";
    go.className = "brass";
    go.textContent = STEP_LABEL[step.key] ?? "do it";
    go.addEventListener("click", () => act(step.action));
    box.append(go);
  }
  if (v.room) {
    const line = document.createElement("div");
    line.className = "roomline";
    line.innerHTML =
      `<b>room ${esc(v.room.code)}</b> · ${nf(v.room.seats)} seat${v.room.seats === 1 ? "" : "s"} · ` +
      `meeting ${nf(v.room.meeting)} closes in <span class="countdown" data-closes="${v.room.closesAt}" role="timer">${remaining(v.room.closesAt)}</span>`;
    box.append(line);
    if (v.room.seats === 1) {
      const row = document.createElement("div");
      row.className = "row";
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 6;
      input.placeholder = "room code";
      input.setAttribute("aria-label", "Room code");
      const join = document.createElement("button");
      join.className = "tiny";
      join.textContent = "join a friend";
      join.addEventListener("click", async () => {
        const code = input.value.trim();
        if (!code) return;
        try {
          await socket.joinRoom(code);
        } catch (error) {
          toast(error.message, true);
        }
      });
      row.append(input, join);
      box.append(row);
    }
  }
  // An account that has not confirmed its address says so, once, where the eye already is.
  if (v.cloud && v.account && v.account.verified === false) {
    const line = document.createElement("div");
    line.className = "roomline";
    line.innerHTML = `<b>unverified</b> · check ${esc(v.account.email ?? "your inbox")} for a six-digit code`;
    const row = document.createElement("div");
    row.className = "row";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 6;
    input.placeholder = "code";
    input.setAttribute("aria-label", "Verification code");
    const confirm = document.createElement("button");
    confirm.className = "tiny";
    confirm.textContent = "verify";
    confirm.addEventListener("click", async () => {
      if (!input.value.trim()) return;
      try {
        await socket.verify(input.value.trim());
        toast("address confirmed");
      } catch (error) {
        toast(error.message, true);
      }
    });
    row.append(input, confirm);
    box.append(line, row);
  }

  if (v.seasonGoals?.length) {
    const goals = document.createElement("div");
    goals.className = "goals";
    goals.innerHTML = v.seasonGoals
      .map((goal) => `<span class="${goal.done ? "done" : ""}">${goal.done ? "✓" : "○"} ${esc(goal.text)}</span>`)
      .join("");
    box.append(goals);
  }
  const luck = (v.luck ?? []).slice(0, 5);
  if (luck.length) {
    const strip = document.createElement("div");
    strip.className = "luck";
    strip.innerHTML = luck
      .map(
        (row) =>
          `<span class="${row.hit ? "hit" : "miss"}">${esc(row.kind)} · ${nf(Math.round(row.odds * 100))}% · ${
            row.hit ? "hit" : "miss"
          }${row.detail ? ` — ${esc(row.detail)}` : ""}</span>`,
      )
      .join("");
    box.append(strip);
  }
}

function draw() {
  const v = view;
  if (!v || !v.stable) return;
  // The server owns the selection. Mirroring it here stops the card saying "selected" while the
  // breed button believes nothing is selected — the drift that made breeding do nothing.
  selectedStraw = v.selectedStraw ?? null;
  // the balance rolls to its new value, with coins on a real gain (assets/micro.js)
  bank(el("guineas"), v.stable.guineas, { format: (n) => nf(n), soundOn });
  eliteStamp(v.horses, (node) => showToast(node, 4200));
  el("season").textContent = nf(v.season);
  el("condition").textContent = v.conditionLabel ?? v.condition;
  el("condition2").textContent = v.conditionLabel ?? v.condition;
  // the old single "stakes cut" pill was replaced by the richer field pill
  if (el("cut")) el("cut").textContent = nf(v.eliteCut, 2);
  if (el("field-mean")) el("field-mean").textContent = nf(v.field.mean, 2);
  if (el("field-cut")) el("field-cut").textContent = nf(v.field.eliteCut, 2);
  if (el("field-stakes")) el("field-stakes").textContent = nf(v.field.stakesCount);
  const advice = el("advice");
  if (advice) {
    advice.hidden = !v.advice;
    advice.textContent = v.advice ?? "";
  }
  // the tab bar, with the count that makes each screen worth visiting
  const badge = (id, value) => {
    const node = el(id);
    if (node) node.textContent = value;
  };
  const horseLots = v.listings.filter((lot) => lot.kind === "horse");
  badge("badge-yard", nf(v.horses.filter((horse) => !horse.retired).length));
  badge("badge-racing", nf(v.stable.entries.length));
  badge("badge-breeding", nf(v.horses.filter((horse) => horse.sex === "F" && !horse.retired).length));
  badge("badge-studs", nf(v.straws.length));
  badge("badge-horses", nf(horseLots.length));
  badge("horse-count", nf(horseLots.length));
  if (document.body.dataset.screen !== screen) showScreen(screen);
  if (el("sound")) el("sound").textContent = `sound: ${soundOn ? "on" : "off"}`;
  renderCovering(v);
  renderFoaling(v);
  renderFoals(v);
  renderGoings(v);
  tickClock();
  renderPlayers(v);
  renderShop(v);
  renderRanking(v);
  renderGallery(v);
  renderNextStep(v);
  renderWorldMarket();
  renderTokens(); // offline too: the section says what it is, instead of standing empty
  maybeReveal(v);
  el("entry-fee").textContent = nf(v.entryFee);
  const advanceButton = el("advance");
  if (advanceButton) advanceButton.dataset.run = "1";
  if (advanceButton) advanceButton.textContent = `Run meeting ${nf(v.round ?? 1)} of ${nf(v.meetingsPerSeason ?? 1)}`;
  el("herd-count").textContent = nf(v.horses.filter((h) => !h.retired).length);
  el("straw-count").textContent = v.strawStorage ? `${nf(v.straws.length)} of ${nf(v.strawStorage)}` : nf(v.straws.length);
  el("listing-count").textContent = nf(v.listings.length);

  // herd rows: built once, drawn by the Yard and by the Breeding screen's mares
  function herdRow(horse) {
    const tr = document.createElement("tr");
    const entered = v.stable.entries.includes(horse.id);
    tr.className = (entered ? "entered" : "") + (horse.id === selectedHorse ? " selected" : "");

    const name = document.createElement("td");
    const nameline = document.createElement("div");
    nameline.className = "nameline";
    nameline.append(horseArt(horse.lineage, horse.age));
    const coat = document.createElement("span");
    coat.className = "coat-inline";
    coat.innerHTML = coatSvg(appearanceFor(horse));
    coat.title = appearanceFor(horse).label;
    nameline.append(coat);
    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = horse.name;
    nameline.append(nameSpan);
    name.append(nameline);
    if (horse.inFoal) {
      const dueLine = document.createElement("div");
      dueLine.className = "pairing";
      dueLine.textContent = `in foal to ${horse.inFoal.sireName} — due ${
        horse.inFoal.seasonsLeft <= 1 ? "next season" : `in ${horse.inFoal.seasonsLeft} seasons`
      }`;
      name.append(dueLine);
      if (horse.inFoal.fate) name.append(fateTag(horse.inFoal.fate, horse.inFoal.fateNote));
    }
    if (horse.sireName || horse.damName) {
      const lineageLine = document.createElement("div");
      lineageLine.className = "lineage";
      lineageLine.textContent = `by ${horse.sireName ?? "unknown"} out of ${horse.damName ?? "unknown"}${horse.bornTier ? ` · landed ${horse.bornTier}` : ""}`;
      name.append(lineageLine);
    }
    if (horse.pairing && !horse.inFoal) {
      const pair = document.createElement("div");
      const risky = horse.pairing.sameLineage || Math.max(horse.pairing.sireF, horse.pairing.damF) > 0.2;
      pair.className = "pairing" + (risky ? " risk" : "");
      pair.textContent =
        `with ${horse.pairing.sireName}: ${horse.pairing.crossLineage ? "cross lineage +" + Math.round(horse.pairing.vigour * 100) + "% vigour" : "same lineage, no vigour"}` +
        ` · inbreeding: sire ${nf(horse.pairing.sireF, 3)}, mare ${nf(horse.pairing.damF, 3)}` +
        ` · ${horse.pairing.foalsLeft} foals left`;
      name.append(pair);
    }
    if (horse.stakes) {
      const tag = document.createElement("span");
      tag.className = "tag stakes";
      tag.textContent = "stakes";
      name.append(tag);
    }
    if (horse.retired) {
      const tag = document.createElement("span");
      tag.className = "tag retired";
      tag.textContent = "retired";
      name.append(tag);
    }

    const sex = document.createElement("td");
    sex.className = "hide-sm";
    sex.textContent = horse.sex === "M" ? "colt" : "filly";

    const age = document.createElement("td");
    age.textContent = nf(horse.age);

    const value = document.createElement("td");
    value.className = "num";
    value.textContent = nf(horse.value, 2);
    const band = document.createElement("span");
    band.className = "band" + (horse.band === "stakes" ? " stakes" : "");
    band.textContent = horse.band;
    value.append(band);

    const f = document.createElement("td");
    f.className = "hide-sm num";
    f.textContent = nf(horse.f, 3);
    const fLabel = document.createElement("span");
    fLabel.className = "band";
    fLabel.textContent = horse.fLabel;
    f.append(fLabel);

    const form = document.createElement("td");
    form.className = "hide-sm";
    form.append(traitBars(horse.traits));

    const upkeep = document.createElement("td");
    upkeep.className = "num";
    upkeep.textContent = nf(horse.upkeep);

    const buttons = document.createElement("td");
    const row = document.createElement("div");
    row.className = "row";
    if (!horse.retired) {
      const enter = document.createElement("button");
      enter.className = "tiny" + (entered ? " brass" : "");
      enter.textContent = entered ? "entered" : "enter";
      enter.disabled = horse.age < 2;
      enter.title = entered
        ? "Withdraw from this meeting."
        : horse.age < 2
          ? "Too young to race: horses run from two."
          : "Enter this meeting.";
      enter.addEventListener("click", () => {
        const next = entered
          ? v.stable.entries.filter((id) => id !== horse.id)
          : [...v.stable.entries, horse.id].slice(0, 3);
        act({ type: "enter", horseIds: next });
      });
      row.append(enter);

      const breed = document.createElement("button");
      breed.className = "tiny good";
      breed.textContent = "breed";
      breed.disabled = horse.sex !== "F" || !selectedStraw || Boolean(horse.inFoal);
      // A dead button with no reason is the worst kind of dead end: it is the one thing a
      // new stable will click first, holding no covering at all.
      breed.title =
        horse.sex !== "F"
          ? "Only a mare can be covered."
          : horse.inFoal
            ? "She is in foal: the foal arrives when the season turns."
            : !selectedStraw
              ? v.straws.length
                ? "Pick a covering above, then breed her."
                : "You hold no covering — take the first covering in your account, or buy one in the Stud market."
              : "Cover her: the covering is spent and the foal arrives when the season turns.";
      breed.dataset.breed = horse.id;
      breed.addEventListener("click", () => {
        const strawId = selectedStraw ?? view?.selectedStraw ?? null;
        if (!strawId) return toast("pick a covering first", true);
        act({ type: "breed", mareId: horse.id, strawId, care: careChoice });
      });
      row.append(breed);

      const sell = document.createElement("button");
      sell.className = "tiny bad";
      sell.textContent = horse.soulbound ? "soulbound" : "sell";
      sell.disabled = Boolean(horse.soulbound);
      sell.title = horse.soulbound
        ? "A gift horse: she can never be sold or consigned, but her foals can."
        : "Sell to the house at once.";
      sell.addEventListener("click", () => confirmSale(sell, horse));
      row.append(sell);

      const consign = document.createElement("button");
      consign.className = "tiny";
      consign.textContent = "consign";
      consign.disabled = v.horses.length <= 1 || Boolean(horse.soulbound);
      consign.title = horse.soulbound
        ? "Soulbound: she cannot be consigned, but her foals can."
        : v.horses.length <= 1
          ? "This is your last horse: sell or breed another before consigning her."
          : "Offer her in the ring at your price.";
      consign.addEventListener("click", () =>
        act({
          type: "listHorse",
          horseId: horse.id,
          price: Math.max(25, horse.suggestedPrice ?? 100),
        }),
      );
      row.append(consign);
    }
    buttons.append(row);

    tr.append(name, sex, age, value, f, form, upkeep, buttons);
    return tr;
  }

  // herd
  const herd = el("herd");
  if (herd) {
    herd.innerHTML = "";
    for (const horse of v.horses) herd.append(herdRow(horse));
  }
  renderOpening(v);
  renderYardCards(v);
  renderSeasonReport(v);
  renderFirsts(v);

  // the breeding screen shows only the mares, each carrying the pairing line the
  // rules sent for the covering currently selected
  const mares = el("mares");
  if (mares) {
    mares.innerHTML = "";
    for (const horse of v.horses.filter((row) => row.sex === "F" && !row.retired)) {
      mares.append(herdRow(horse));
    }
  }
  renderMareCards(v);

  // the racing screen: who is running, and the instruction each one carries
  const entries = el("race-entries");
  if (entries) {
    entries.innerHTML = "";
    const running = v.stable.entries
      .map((id) => v.horses.find((horse) => horse.id === id))
      .filter(Boolean);
    if (!running.length) {
      const empty = document.createElement("p");
      empty.className = "hint empty-state";
      empty.textContent = "No runners entered. Pick up to three on the Yard screen — the enter button sits on each row.";
      entries.append(empty);
    }
    for (const horse of running) {
      const card = document.createElement("div");
      card.className = "entry";
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = `${horse.name} · value ${nf(horse.value, 2)} · ${horse.band}`;
      card.append(who);
      const group = document.createElement("div");
      group.className = "tactic";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", `Instruction for ${horse.name}`);
      for (const tactic of ["push", "steady", "hold"]) {
        const button = document.createElement("button");
        button.className = "tiny" + (horse.tactic === tactic ? " brass" : "");
        button.textContent = tactic;
        if (tactic !== "steady" && horse.tacticFit) {
          const fit = horse.tacticFit[tactic];
          const note = document.createElement("span");
          note.className = "fit";
          note.textContent = ` ${fit > 0 ? "+" : ""}${nf(fit, 2)}`;
          button.append(note);
        }
        button.title =
          tactic === "push"
            ? "Go early: rewards a fast horse in a race that rewards speed"
            : tactic === "hold"
              ? "Save for the finish: rewards a stayer in a race that rewards stamina"
              : "Run plain, no instruction";
        button.addEventListener("click", () => act({ type: "setTactic", horseId: horse.id, tactic }));
        group.append(button);
      }
      card.append(group);
      entries.append(card);
    }
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = `Entries are open for meeting ${nf(v.round ?? 1)} of ${nf(v.meetingsPerSeason ?? 1)}. ${v.room || v.cloud ? "Add or swap runners before the server deadline — the meeting runs automatically." : "Add or swap runners as long as you like — they run when you run the meeting."} ${v.goingNote}`;
    entries.append(note);

    const when = document.createElement("div");
    when.className = "row";
    // Manual entry windows exist only in offline games; the server owns online deadlines.
    when.hidden = Boolean(v.room || v.cloud);
    when.style.marginTop = "0.4rem";
    const openWindow = document.createElement("button");
    openWindow.className = "tiny";
    openWindow.textContent = `Put entries on a ${nf(v.windowSeconds ?? 90)}s clock`;
    openWindow.disabled = Boolean(v.clock && v.clock.open);
    openWindow.title =
      v.clock && v.clock.open
        ? "The entries are already on the clock."
        : `Entries close by themselves after ${nf(v.windowSeconds ?? 90)} seconds.`;
    openWindow.addEventListener("click", () => send({ type: "clock", seconds: v.windowSeconds ?? 90 }));
    when.append(openWindow);
    const countdown = document.createElement("span");
    countdown.className = "hint";
    countdown.id = "clock-count";
    countdown.textContent =
      v.clock && v.clock.open
        ? "entries are on the clock"
        : "or just run the meeting when you are ready";
    when.append(countdown);
    entries.append(when);
  }

  // straws
  const straws = el("straws");
  straws.innerHTML = "";
  if (v.strawStorage && v.straws.length >= v.strawStorage) {
    const warn = document.createElement("p");
    warn.className = "hint";
    warn.textContent = `Barn full at ${nf(v.strawStorage)}. When the season turns the oldest coverings leave for the market at the floor — sell or use some first, and an elite covering is never the one dropped.`;
    straws.append(warn);
  }
  if (!v.straws.length) {
    const empty = document.createElement("p");
    empty.className = "hint empty-state";
    // A yard with no covering cannot grow at all: it can cover no mare and it breeds no
    // foal. So the empty state names the next step, where it is and what it costs.
    const starter =
      v.starterOffer && v.starterOffer.available
        ? `the first covering in your account at ₲ ${nf(v.starterOffer.price)}`
        : null;
    empty.textContent =
      "No coverings held — without one no mare can be covered and the yard cannot grow. " +
      (starter
        ? `Start with ${starter}, or buy a rival's covering from the Stud market.`
        : "Buy a rival's covering from the Stud market.");
    straws.append(empty);
  }
  for (const straw of v.straws.slice(0, 24)) {
    const card = document.createElement("div");
    card.className = "lot" + (straw.id === (v.selectedStraw ?? selectedStraw) ? " mine" : "");
    // The card itself is the target. Clicking it looked like it should pick the covering and
    // did nothing, so a player had to hunt for a small button inside it. It lives at the card's
    // own declaration, which also keeps it out of the next element's block.
    card.style.cursor = "pointer";
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      const current = v.selectedStraw ?? selectedStraw;
      selectedStraw = straw.id === current ? null : straw.id;
      act({ type: "selectStraw", strawId: selectedStraw });
      draw();
    });
    const head = document.createElement("div");
    head.className = "name";
    head.textContent = straw.sireName;
    card.append(head);
    const meta = document.createElement("div");
    meta.className = "kv";
    meta.innerHTML = `<span>sire value</span><b>${nf(straw.sireValue, 2)}</b>`;
    card.append(meta);
    const meta2 = document.createElement("div");
    meta2.className = "kv";
    meta2.innerHTML = `<span>collected in season ${straw.vintage}</span><b>${straw.sireStakes ? "stakes winner" : "—"}</b>`;
    card.append(meta2);
    if (straw.elite) {
      const tag = document.createElement("div");
      tag.className = "select";
      tag.textContent = "elite covering — the house's best stallion, sold once a season";
      card.append(tag);
    }
    const row = document.createElement("div");
    row.className = "row";
    const select = document.createElement("button");
    select.className = "tiny" + (straw.id === selectedStraw ? " brass" : "");
    select.textContent = straw.id === selectedStraw ? "selected" : "select";
    select.addEventListener("click", () => {
      const current = v.selectedStraw ?? selectedStraw;
      selectedStraw = straw.id === current ? null : straw.id;
      // the rules need the selection too: the pairing preview on each mare comes
      // from the server, which is the only place that knows the pedigree
      act({ type: "selectStraw", strawId: selectedStraw });
      draw();
    });
    row.append(select);
    const list = document.createElement("button");
    list.className = "tiny";
    list.textContent = `list ${nf(Math.max(25, straw.suggestedValue))}₲`;
    list.addEventListener("click", () =>
      act({ type: "listStraw", strawId: straw.id, price: Math.max(25, straw.suggestedValue) }),
    );
    row.append(list);
    const cheap = document.createElement("button");
    cheap.className = "tiny";
    cheap.textContent = "quick 60%";
    cheap.addEventListener("click", () =>
      act({
        type: "listStraw",
        strawId: straw.id,
        price: Math.max(20, Math.round((straw.suggestedValue ?? 40) * 0.6)),
      }),
    );
    row.append(cheap);
    card.append(row);
    straws.append(card);
  }

  // the two markets sit on their own screens, split by what the lot actually is
  const studLots = v.listings.filter((lot) => lot.kind !== "horse");
  const horseMarket = v.listings.filter((lot) => lot.kind === "horse");
  const listings = el("listings");
  if (listings) {
    listings.innerHTML = "";
    if (!studLots.length) {
      const empty = document.createElement("p");
      empty.className = "hint empty-state";
      empty.textContent = "The catalogue is empty right now — rivals list coverings each season.";
      listings.append(empty);
    }
  }
  const horseCards = el("horse-lots");
  if (horseCards) {
    horseCards.innerHTML = "";
    if (!horseMarket.length) {
      const empty = document.createElement("p");
      empty.className = "hint empty-state";
      empty.textContent =
        "No horses in the ring. Rivals consign each season, and you can consign your own from the Yard.";
      horseCards.append(empty);
    }
  }
  // Identical coverings (same stallion, seller and price) are one card with a dose count: five
  // copies of the same lot said nothing a number cannot.
  const groups = new Map();
  for (const lot of studLots) {
    const key = [lot.sireId, lot.seller, lot.price, lot.select, lot.mine, lot.vintage].join("|");
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { lot, count: 1 });
  }
  for (const { lot, count } of [...groups.values()].slice(0, 30)) listings?.append(lotCard(lot, v, count));
  for (const lot of horseMarket.slice(0, 30)) horseCards?.append(lotCard(lot, v, 1));

  // Requests: the demand side of the market, where you name the genetics you want.
  const wantCount = el("want-count");
  if (wantCount) wantCount.textContent = nf(v.wants.length);
  const wants = el("wants");
  if (wants) {
    wants.innerHTML = "";
    for (const want of v.wants) {
      const card = document.createElement("div");
      card.className = "lot" + (want.mine ? " mine" : "");
      const head = document.createElement("div");
      head.className = "name";
      head.textContent = want.mine ? "your request" : want.stableName;
      card.append(head);
      const meta = document.createElement("div");
      meta.className = "kv";
      meta.innerHTML = `<span>${esc(want.lineage || "any lineage")} · open ${want.age} season(s)</span><b>${nf(want.price)} ₲</b>`;
      card.append(meta);
      if (want.mine) {
        const row = document.createElement("div");
        row.className = "row";
        const cancel = document.createElement("button");
        cancel.className = "tiny";
        cancel.textContent = "cancel";
        cancel.addEventListener("click", () => act({ type: "cancelWanted", wantId: want.id }));
        row.append(cancel);
        card.append(row);
      }
      wants.append(card);
    }
  }

  // meeting
  renderPaddock(v);
  const meeting = el("meeting");
  meeting.innerHTML = "";
  // While the off is on screen the result waits, so the start gets its own moment. The race has
  // already been decided by the rules; this only decides when the player reads it.
  if (offAt && Date.now() - offAt < OFF_MILLISECONDS) {
    theOffBlock(v);
  } else if (v.meeting) {
    const line = document.createElement("div");
    line.innerHTML = `<span class="winner">${esc(v.meeting.winner)}</span> took the ${v.meeting.condition} — pot ${nf(v.meeting.pot)} ₲ from ${nf(v.meeting.runners)} runners`;
    meeting.append(line);
    // The margin, then your own horses: the result used to name one winner and leave a player to
    // guess what happened to the rest of them.
    if (typeof v.meeting.margin === "number" && v.meeting.margin > 0) {
      const margin = document.createElement("div");
      margin.className = "hint";
      margin.textContent = `won by ${v.meeting.marginLengths ?? nf(v.meeting.margin, 2)} clear of the runner-up`;
      meeting.append(margin);
    }
    const mine = (Array.isArray(v.meeting.table) ? v.meeting.table : []).filter((row) => row.mine);
    for (const row of mine) {
      const own = document.createElement("div");
      own.className = "kv";
      const placing =
        row.place === 1 ? "won" : row.place === 2 ? "2nd" : row.place === 3 ? "3rd" : `${nf(row.place)}th`;
      own.textContent =
        `${placing} · ${row.name} — ` +
        (row.place === 1 ? `took ${nf(row.prize)} ₲` : `beaten ${nf(row.behind, 2)}, won ${nf(row.prize)} ₲`) +
        (row.tactic ? ` · ran ${row.tactic}` : "");
      meeting.append(own);
    }
    for (const placed of v.meeting.places) {
      const row = document.createElement("div");
      row.className = "kv";
      row.innerHTML = `<span>${placed.place}. ${esc(placed.name)} <span class="hint">(${esc(placed.stable)})</span></span><b>${esc(placed.behindLengths ?? nf(placed.score, 2))}</b>`;
      meeting.append(row);
    }
    for (const entry of v.log.filter((row) => row.kind === "race" && row.season === v.meeting.season).slice(0, 4)) {
      const why = document.createElement("div");
      why.className = "why";
      why.textContent = entry.text;
      meeting.append(why);
    }
  } else {
    const line = document.createElement("div");
    line.className = "hint";
    line.textContent =
      "No meeting has run yet. Enter runners and run the meeting — or put the entries on a clock and it runs itself.";
    meeting.append(line);
  }

  // the race itself. The lanes are rebuilt only when the meeting changes, so an
  // animation in progress is not wiped out by a redraw.
  const track = el("track");
  if (track) {
    const replay = v.meeting && v.meeting.replay ? v.meeting.replay : null;
    if (!replay) {
      if (track.dataset.stamp !== "none") {
        track.innerHTML = "";
        const empty = document.createElement("p");
        empty.className = "hint empty-state";
        empty.textContent = "Run the season and the running appears here.";
        track.append(empty);
        track.dataset.stamp = "none";
      }
    } else {
      const lanes = replay[replay.length - 1].order;
      const stamp = `${v.meeting.season}.${v.meeting.round ?? 1}:${lanes.map((row) => row.horseId).join(",")}`;
      if (track.dataset.stamp !== stamp) {
        track.innerHTML = "";
        track.dataset.stamp = stamp;
        const mineNow = new Set(v.horses.map((horse) => horse.id));
        for (const row of lanes) {
          const lane = document.createElement("div");
          lane.className = "lane" + (mineNow.has(row.horseId) ? " mine" : "");
          lane.dataset.horse = row.horseId;
          const label = document.createElement("span");
          label.textContent = row.name;
          const rail = document.createElement("div");
          rail.className = "rail";
          const runner = document.createElement("i");
          runner.className = "runner";
          runner.append(horseArt(row.lineage));
          rail.append(runner);
          lane.append(label, rail);
          track.append(lane);
        }
      }
      playReplay(replay, false);
    }
  }

  // the account panel: what this save is, and the tools for starting it again
  const account = el("account");
  if (account) {
    account.innerHTML = "";
    const facts = document.createElement("div");
    facts.className = "lot mine";
    facts.innerHTML =
      `<div class="name">Your stable</div>` +
      `<div class="kv"><span>guineas</span><b>₲ ${nf(v.stable.guineas)}</b></div>` +
      (v.starterOffer && v.starterOffer.available
        ? `<div class="kv"><span>first covering</span><button class="tiny" data-starter-offer ` +
          `title="A covering from the best stallion in the world, once per stable. This is what coins are for.">` +
          `take it · ₲ ${nf(v.starterOffer.price)}</button></div>`
        : v.starterOffer && v.starterOffer.taken
          ? `<div class="kv"><span>first covering</span><b>taken</b></div>`
          : "") +
      (Array.isArray(v.coinPacks) && v.coinPacks.length
        ? `<div class="kv"><span>coins</span><span>` +
          v.coinPacks
            .map(
              (entry) =>
                `<button class="tiny" data-coin-pack="${entry.pack}" ` +
                `title="Adds coins. On this build the payment is a sandbox: no money moves.">` +
                `${nf(entry.coins)}</button>`,
            )
            .join(" ") +
          `</span></div><div class="hint">Sandbox payments: no card, no chain, no charge. ` +
          `A real wallet would be asked for here and here only.</div>`
        : "") +
      `<div class="kv"><span>season</span><b>${nf(v.season)}</b></div>` +
      `<div class="kv"><span>horses</span><b>${nf(v.horses.length)}</b></div>` +
      `<div class="kv"><span>forced sales</span><b>${nf(v.stable.forcedSales)}</b></div>`;
    account.append(facts);

    const tools = document.createElement("div");
    tools.className = "lot";
    const head = document.createElement("div");
    head.className = "name";
    head.textContent = "Testing tools";
    tools.append(head);
    if (v.cloud || v.room) {
      // Online the stable is permanent: horses, balance and pedigree are kept, so there is no
      // start-over button here (the server refuses it). The demo offline keeps the tool.
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent =
        "Online your stable is permanent: horses, guineas and pedigrees are kept, so there is no starting over. To replay the opening, use the offline demo. If your yard runs out of horses, the next step above names the cheapest way back in.";
      tools.append(note);
      account.append(tools);
    } else {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent =
      "For replaying the opening. Pick the bank you want to start on, then start over. Funds are a testing grant rather than an earning, and every use is written into the week, so they cannot hide inside a real balance.";
    tools.append(hint);
    if (!v.bankChoices.includes(bankChoice)) bankChoice = v.bankChoices[0];
    const labels = ["standard", "testing", "big"];
    const pickRow = document.createElement("div");
    pickRow.className = "tactic";
    v.bankChoices.forEach((choice, index) => {
      const button = document.createElement("button");
      button.className = "tiny" + (choice === bankChoice ? " brass" : "");
      button.setAttribute("aria-pressed", String(choice === bankChoice));
      button.textContent = `${labels[index] ?? ""} ${nf(choice)} ₲`.trim();
      button.addEventListener("click", () => {
        bankChoice = choice;
        writeStore(BANK_KEY, String(choice));
        draw();
      });
      pickRow.append(button);
    });
    tools.append(pickRow);

    const row = document.createElement("div");
    row.className = "row";
    const restart = document.createElement("button");
    restart.className = "tiny bad";
    restart.textContent = `start over · ${nf(bankChoice)} ₲`;
    restart.addEventListener("click", () => {
      if (!confirm(`Start the whole game again from season one with ${nf(bankChoice)} ₲? This save is replaced.`)) return;
      selectedStraw = null;
      selectedHorse = null;
      playedSeason = null;
      act({ type: "startOver", bank: bankChoice });
      toast(`starting over with ${nf(bankChoice)} ₲`);
    });
    row.append(restart);
    const grant = document.createElement("button");
    grant.className = "tiny brass";
    grant.textContent = `add ${nf(bankChoice)} ₲`;
    grant.addEventListener("click", () => act({ type: "testGrant", amount: bankChoice }));
    if (v.testGrant > 0) row.append(grant);
    tools.append(row);
    account.append(tools);
    }
  }

  // standings
  const standings = el("standings");
  standings.innerHTML = "";
  for (const horse of v.standings) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = horse.name;
    if (horse.stakes) {
      const tag = document.createElement("span");
      tag.className = "tag stakes";
      tag.textContent = "stakes";
      name.append(tag);
    }
    const stable = document.createElement("td");
    stable.textContent = horse.stable;
    const value = document.createElement("td");
    value.className = "num";
    value.textContent = nf(horse.value, 2);
    tr.append(name, stable, value);
    standings.append(tr);
  }

  // rivals
  const rivals = el("rivals");
  rivals.innerHTML = "";
  for (const rival of v.rivals) {
    const tr = document.createElement("tr");
    const did = rival.lastSeason
      ? `${nf(rival.lastSeason.runs)} runs, ${nf(rival.lastSeason.wins)} won, ` +
        (rival.lastSeason.bank >= 0
          ? `₲ ${nf(rival.lastSeason.bank)} up last season`
          : `₲ ${nf(-rival.lastSeason.bank)} down last season`)
      : "no season closed yet";
    tr.innerHTML =
      `<td>${esc(rival.name)}<div class="hint">${rival.intent ?? ""} · ${did}</div></td>` +
      `<td class="num">${nf(rival.guineas)}</td><td class="num">${nf(rival.horses)}</td>` +
      `<td class="num">${nf(rival.best, 2)}</td>`;
    rivals.append(tr);
  }

  // log
  const log = el("log");
  log.innerHTML = "";
  for (const entry of v.log) {
    const li = document.createElement("li");
    li.textContent = `S${entry.season} · ${entry.text}`;
    log.append(li);
  }
}

let selectedHorse = null;

const wantButton = el("want-post");
if (wantButton) {
  wantButton.addEventListener("click", () => {
    const price = Number(el("want-price")?.value ?? 0);
    const lineage = el("want-lineage")?.value || null;
    if (!Number.isFinite(price) || price < 20) return toast("offer at least 20 GNS", true);
    act({ type: "postWanted", price, lineage });
    toast("request posted — rivals answer next season");
  });
}


const watchButton = el("watch");
const soundButton = el("sound");
if (soundButton) {
  soundButton.addEventListener("click", () => {
    soundOn = !soundOn;
    writeStore(SOUND_KEY, soundOn ? "on" : "off");
    soundButton.textContent = `sound: ${soundOn ? "on" : "off"}`;
    if (soundOn) chime(2, true);
  });
}

const revealBox = el("reveal");
if (revealBox) {
  revealBox.addEventListener("click", (event) => {
    if (event.target === revealBox) closeReveal();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeReveal();
    if (event.key !== "Tab") return;
    // a dialog that lets Tab walk out behind it is not modal, whatever role it carries
    const box = el("reveal");
    if (!box || box.hidden) return;
    const focusable = [...box.querySelectorAll("button, input, a[href]")].filter((node) => !node.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !box.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !box.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });
}

if (watchButton) {
  watchButton.addEventListener("click", () => {
    playedSeason = null;
    if (view && view.meeting) playReplay(view.meeting.replay, true);
  });
}

for (const tab of document.querySelectorAll(".tab")) {
  tab.setAttribute(
    "aria-keyshortcuts",
    String([...document.querySelectorAll(".tab")].indexOf(tab) + 1),
  );
  tab.addEventListener("click", () => {
    showScreen(tab.dataset.screen);
    draw();
  });
}

// 1..6 switch screens, and a dialog owns the keyboard while it is open.
window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  // typing a digit into a field (a stable name, a 6-digit code, a price) is typing, not a shortcut
  const field = event.target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
  if (field || event.isComposing) return;
  const index = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].indexOf(event.key);
  if (index < 0 || index >= SCREENS.length) return;
  const box = el("reveal");
  if (box && !box.hidden) return;
  const target = document.querySelector(`.tab[data-screen="${SCREENS[index]}"]`);
  if (!target) return;
  event.preventDefault();
  showScreen(SCREENS[index]);
  draw();
});
showScreen(screen);

/* ------------------------------------------------------------------ accounts */

/** The gate that stands in front of a cloud stable. */
/** The opening card leaves once there is something to show: a stable, or the account gate. */
function appReady() {
  if (document.body.classList.contains("ready")) return;
  document.body.classList.add("ready");
  // fade out, then leave the page for good: nothing should ever sit over the game again
  const splash = document.getElementById("splash");
  if (splash) setTimeout(() => splash.remove(), REDUCED_MOTION ? 0 : 480);
}

function accountGate(base, message = "") {
  appReady();
  document.querySelectorAll(".gate").forEach((node) => node.remove());
  const gate = document.createElement("div");
  gate.className = "gate";
  gate.setAttribute("role", "dialog");
  gate.setAttribute("aria-modal", "true");
  gate.setAttribute("aria-labelledby", "gate-title");

  const card = document.createElement("form");
  card.className = "gate-card";
  card.innerHTML =
    `<div class="gate-mark">STUD<span>BOOK</span></div>` +
    `<h2 id="gate-title">Seu estábulo. Sua história.</h2>` +
    `<p class="hint">Entre para continuar com seus cavalos e progresso salvo. ` +
    `A demonstração offline fica somente neste navegador.</p>` +
    `<label>email<input name="email" type="email" autocomplete="email" required /></label>` +
    `<label>password<input name="password" type="password" minlength="8" autocomplete="current-password" required /></label>` +
    `<label class="gate-stable">stable name <small>(to create a stable · optional)</small><input name="stable" type="text" maxlength="24" autocomplete="organization" /></label>` +
    `<p class="gate-error" role="alert">${esc(message)}</p>` +
    `<div class="row"><button class="good" name="login" type="submit">Entrar</button>` +
    `<button name="register" type="button">Criar estábulo</button>` +
    `<button class="tiny" name="offline" type="button">Demonstração offline</button></div>` +
    `<p class="hint"><a href="welcome.html">Página inicial</a> · <a href="horse-3d.html">Explorar prévia 3D</a></p>`;

  const say = (text) => {
    const node = card.querySelector(".gate-error");
    if (node) node.textContent = text;
  };

  const enter = async (path) => {
    const email = card.querySelector('[name="email"]').value.trim();
    const password = card.querySelector('[name="password"]').value;
    if (!email || password.length < 8) {
      say("an email and a password of at least 8 characters");
      return;
    }
    const buttons = [...card.querySelectorAll("button")];
    buttons.forEach((b) => (b.disabled = true));
    try {
      const stable = (card.querySelector('[name="stable"]')?.value ?? "").trim().replace(/\s+/g, " ");
      if (path === "/api/register" && stable && (stable.length < 2 || stable.length > 24)) {
        say("a stable name is 2 to 24 characters");
        buttons.forEach((b) => (b.disabled = false));
        return;
      }
      const out = await apiCall(base, path, { method: "POST", body: { email, password } });
      tokenStore.set(out.token);
      // a new stable starts with the name its owner chose, instead of finding the field later
      if (path === "/api/register" && stable) {
        await apiCall(base, "/api/action", { method: "POST", token: out.token, body: { action: { type: "nameStable", name: stable } } }).catch(() => {});
      }
      gate.remove();
      mountWho(out.user);
      connect(() => new CloudSocket(base, out.token));
    } catch (error) {
      say(error.message);
      buttons.forEach((b) => (b.disabled = false));
    }
  };

  card.addEventListener("submit", (event) => {
    event.preventDefault();
    enter("/api/login");
  });
  card.querySelector('[name="register"]').addEventListener("click", () => enter("/api/register"));
  card.querySelector('[name="offline"]').addEventListener("click", () => {
    gate.remove();
    cloudBase = null;
    connect();
  });

  card.querySelector('[name="forgot"]')?.addEventListener("click", () => {
    gate.remove();
    resetGate(base);
  });

  gate.append(card);
  document.body.append(gate);
  card.querySelector("input")?.focus();
}

/** Who is signed in, and the way out. */
function mountWho(user) {
  document.querySelectorAll(".whoami").forEach((node) => node.remove());
  if (!user) return;
  const pill = document.createElement("span");
  pill.className = "whoami";
  pill.innerHTML = `<span class="hint">${esc(user.email ?? "")}</span>`;
  const out = document.createElement("button");
  out.className = "tiny";
  out.textContent = "sign out";
  out.addEventListener("click", async () => {
    try {
      await cloudApi("/api/logout", { method: "POST", token: tokenStore.get() });
    } catch {
      /* the token is going away either way */
    }
    tokenStore.set(null);
    location.reload();
  });
  pill.append(out);
  (document.querySelector(".bar") ?? document.body).append(pill);
}


/** Locked out: a code by mail, and a new password. */
function resetGate(base) {
  document.querySelectorAll(".gate").forEach((node) => node.remove());
  const gate = document.createElement("div");
  gate.className = "gate";
  gate.setAttribute("role", "dialog");
  gate.setAttribute("aria-modal", "true");
  const card = document.createElement("form");
  card.className = "gate-card";
  card.innerHTML =
    `<div class="gate-mark">STUD<span>BOOK</span></div>` +
    `<h2>Get back in</h2>` +
    `<p class="hint">Send a six-digit code to the address on the account, then choose a new password.</p>` +
    `<label>email<input name="email" type="email" autocomplete="email" required /></label>` +
    `<div class="row"><button class="tiny" name="send" type="button">send a code</button>` +
    `<span class="hint" name="sent"></span></div>` +
    `<label>code<input name="code" inputmode="numeric" maxlength="6" required /></label>` +
    `<label>new password<input name="password" type="password" minlength="8" required /></label>` +
    `<p class="gate-error" role="alert"></p>` +
    `<div class="row"><button class="good" type="submit">set the password</button>` +
    `<button class="tiny" name="back" type="button">back</button></div>`;

  const say = (text) => {
    const node = card.querySelector(".gate-error");
    if (node) node.textContent = text;
  };

  card.querySelector('[name="send"]').addEventListener("click", async () => {
    const email = card.querySelector('[name="email"]').value.trim();
    if (!email) return say("an email first");
    try {
      const out = await apiCall(base, "/api/recover", { method: "POST", body: { email } });
      card.querySelector('[name="sent"]').textContent = out.devCode
        ? `code ${out.devCode} (no mail provider in this build)`
        : "code sent";
    } catch (error) {
      say(error.message);
    }
  });

  card.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = card.querySelector('[name="email"]').value.trim();
    const code = card.querySelector('[name="code"]').value.trim();
    const password = card.querySelector('[name="password"]').value;
    try {
      const out = await apiCall(base, "/api/reset", { method: "POST", body: { email, code, password } });
      tokenStore.set(out.token);
      gate.remove();
      mountWho(out.user);
      connect(() => new CloudSocket(base, out.token));
    } catch (error) {
      say(error.message);
    }
  });

  card.querySelector('[name="back"]').addEventListener("click", () => {
    gate.remove();
    accountGate(base);
  });

  gate.append(card);
  document.body.append(gate);
  card.querySelector("input")?.focus();
}

async function start() {
  const detected = HAS_QUERY_SERVER ? SERVER_URL : await detectServer();
  const base = HAS_QUERY_SERVER ? SERVER_URL : detected;
  if (base === null) {
    connect();
    return;
  }
  serverBase = base;
  cloudBase = base;
  const token = tokenStore.get();
  if (!token) {
    accountGate(base);
    return;
  }
  try {
    const me = await apiCall(base, "/api/me", { token });
    mountWho(me.user);
    connect(() => new CloudSocket(base, token));
  } catch (error) {
    if (error.status === 401) {
      tokenStore.set(null);
      accountGate(base, "that session expired — sign in again");
    } else {
      accountGate(base, "Não foi possível carregar sua conta. Tente entrar novamente; seu progresso online não foi substituído.");
    }
  }
}


/* ------------------------------------------------------------------ diagnosis */

// A click that does nothing is the worst bug report there is. Anything that throws, here or in a
// rejected promise, is written on screen instead of into a console nobody has open.
function surfaceError(where, error) {
  const text = `${where}: ${error && error.message ? error.message : String(error)}`;
  const status = el("status");
  if (status) {
    status.textContent = text;
    status.classList.add("bad");
  }
  // a diagnostic stays long enough to be read (30 s), can be closed, and does not stack
  const node = document.createElement("div");
  node.className = "toast bad";
  const body = document.createElement("span");
  body.textContent = text;
  node.append(body);
  showToast(node, 30000);
}

// One listener for the whole document: buttons are rebuilt on every draw, and a handler bound to a
// node that has been replaced is a click that goes nowhere. This is the fix for that whole class.
document.addEventListener("click", (event) => {
  const run = event.target.closest?.("[data-run]");
  if (run) {
    if (run.disabled || view?.room || view?.cloud) return;
    act({ type: "advance" });
    return;
  }
  const button = event.target.closest?.("[data-breed]");
  if (!button) return;
  const strawId = selectedStraw ?? view?.selectedStraw ?? null;
  if (!strawId) return toast("pick a covering first", true);
  act({ type: "breed", mareId: button.dataset.breed, strawId, care: careChoice });
});

window.addEventListener("error", (event) => surfaceError("error", event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => surfaceError("promise", event.reason));

start();

/* ------------------------------------------------------------------ live race (exhibition) */

/**
 * The declared field, run through the causal engine and shown as a race. An exhibition: it never
 * changes a result, a balance or a record. Online the server simulates it (the genotypes stay
 * there); offline this tab already holds the whole save and runs the same module locally.
 */
function randomSeed() {
  const bytes = new Uint8Array(16);
  (globalThis.crypto ?? window.crypto).getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The exhibition and, when one of the player's own runners is in it, the way to ride it:
 * `send(inputs)` re-runs the same race with the rider's orders. Online that is the server (the
 * traits never leave it); offline it is this browser, which already owns the save.
 */
async function loadExhibition() {
  if (CLOUD()) {
    const out = await cloudApi("/api/race/exhibition", { token: tokenStore.get() });
    const race = out.race;
    const key = race.runners.find((row) => row.mine)?.key ?? null;
    const send = (inputs) =>
      cloudApi("/api/race/ride", { method: "POST", token: tokenStore.get(), body: { session: race.session, key, inputs } }).then((answer) => answer.race);
    return { race, ride: key ? { key, send } : null };
  }
  const { prepareExhibition, runExhibition } = await import("./race/exhibition.js");
  const state = socket?.game?.state;
  if (!state) throw new Error("the stable is still loading");
  const prep = prepareExhibition(state, { seed: randomSeed() });
  if (!prep) throw new Error("declare at least two runners first");
  const race = runExhibition(prep);
  const key = race.runners.find((row) => row.mine)?.key ?? null;
  return { race, ride: key ? { key, send: async (inputs) => runExhibition(prep, { ride: { key, inputs } }) } : null };
}

async function openLiveRace() {
  const button = el("live-race");
  if (button) button.disabled = true;
  try {
    // the broadcast camera (side view) is the default; the aerial view remains as its base class
    const [{ race, ride }, { SideRaceScene }] = await Promise.all([loadExhibition(), import("./race/side-scene.js")]);
    document.querySelectorAll(".race-stage").forEach((node) => node.remove());
    const overlay = document.createElement("div");
    overlay.className = "race-stage";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Corrida ao vivo");
    const host = document.createElement("div");
    host.className = "race-stage-host";
    overlay.append(host);
    document.body.append(overlay);
    document.body.classList.add("stage-open");
    const close = () => {
      overlay.remove();
      document.body.classList.remove("stage-open");
      document.removeEventListener("keydown", onKey);
      button?.focus();
    };
    const onKey = (event) => { if (event.key === "Escape") scene.close(); };
    document.addEventListener("keydown", onKey);
    const scene = new SideRaceScene(host, race, {
      reducedMotion: REDUCED_MOTION,
      sound: soundOn,
      onClose: close,
      ride, // your own runner takes your orders: A poupar, S ritmo, D arrancar, ← → raias
      onRideError: (error) => toast(translateMessage(error?.message ?? String(error)), true),
    });
    window.__studbookRace = { race, scene }; // inspection hook for tests and support
    // start once the painted course and runners are ready; a failed load still runs the race
    scene.loaded.catch(() => {}).finally(() => { if (overlay.isConnected) scene.play(); });
    overlay.querySelector("button")?.focus();
  } catch (error) {
    toast(translateMessage(error.message ?? String(error)), true);
  } finally {
    if (button) button.disabled = false;
  }
}

/** Errors arrive in English from the engine and server; the i18n layer owns their wording. */
function translateMessage(message) {
  return window.__studbookI18n?.translateError?.(message) ?? message;
}

el("live-race")?.addEventListener("click", openLiveRace);
// the race card's own button is rebuilt on every draw, so it is reached by delegation
document.addEventListener("click", (event) => {
  if (event.target.closest?.("[data-live-race]")) openLiveRace();
});
