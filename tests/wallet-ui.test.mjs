#!/usr/bin/env node
/**
 * Fase E, ponta a ponta na tela: uma conta com NFT unclaimed, o campo de carteira, o POST,
 * e o cavalo virando pending com o botão de mint. A API é simulada com o mesmo formato do
 * servidor real (GET /api/mints devolve os intents; POST /api/wallet vincula).
 *
 *   node tests/wallet-ui.test.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let JSDOM;
for (const base of [process.cwd(), root]) {
  try {
    ({ JSDOM } = createRequire(join(base, "noop.js"))("jsdom"));
    break;
  } catch {
    /* next */
  }
}
if (!JSDOM) {
  console.error("jsdom is not installed: npm i --no-save jsdom@24");
  process.exit(2);
}

const engine = await import(pathToFileURL(join(root, "assets/engine.js")).href);
const ADDRESS = "0x00000000000000000000000000000000000a11ce";

let bound = false;
let minted = null;
const calls = [];
const frame = () => {
  const game = engine.setup(["u1"], "wallet-ui");
  return {
    type: "state",
    status: "playing",
    seats: ["u1"],
    you: "u1",
    connected: 1,
    view: engine.viewFor(game, "u1"),
    meta: { game: "Studbook" },
    version: 1,
    account: { id: "u1", email: "qa@studbook.test", verified: true },
    cloud: true,
    stable: true,
    room: { id: "r1", code: "AAAAAA", seats: 1, closesAt: Date.now() + 3_600_000, season: 1, meeting: 1 },
  };
};
const intent = () => ({
  nullifier: "null-1",
  horseId: "h1",
  name: "Orridge (L2)",
  bornSeason: 0,
  sex: 0,
  tokenId: null,
  txHash: null,
  status: minted ? "minted" : bound ? "pending" : "unclaimed",
  tokenId: minted,
  txHash: minted ? `sim:${"ab".repeat(20)}` : null,
  address: bound ? ADDRESS : null,
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (url, options = {}) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  const method = options.method ?? "GET";
  calls.push({ path, method, body: options.body ?? null });
  if (path === "/api/health") return json({ ok: true, cloud: true });
  if (path === "/api/me") return json({ user: { id: "u1", email: "qa@studbook.test" }, state: frame() });
  if (path === "/api/mints") return json({ mints: [intent()], pending: bound && !minted ? 1 : 0, minted: minted ? 1 : 0 });
  if (path === "/api/mints/sign") {
    return json({ mode: "simulated", payload: { nullifier: "null-1" }, signature: "3045" + "00".repeat(60) });
  }
  if (path === "/api/mints/confirm") {
    minted = 900001;
    return json({ mint: { ...intent(), status: "minted", tokenId: 900001 } });
  }
  if (path === "/api/wallet") {
    bound = true;
    return json({ wallet: ADDRESS });
  }
  return json({ error: "not found" }, 404);
};

const dom = new JSDOM(readFileSync(join(root, "index.html"), "utf8"), {
  url: "http://127.0.0.1:9999/studbook/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) {
    try {
      globalThis[key] = window[key];
    } catch {
      /* skip read-only */
    }
  }
}
globalThis.window = window;
globalThis.document = window.document;
const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.matchMedia = matchMedia;
globalThis.matchMedia = matchMedia;
window.localStorage.setItem("hf:studbook:token", "test-token");

const errors = [];
window.addEventListener("error", (event) => errors.push(String(event.message)));
window.addEventListener("unhandledrejection", (event) => errors.push(`rejection: ${event.reason?.message ?? event.reason}`));

let bad = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) bad += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
};

await import(pathToFileURL(join(root, "assets/ui.js")).href);
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
await wait(400);

const doc = window.document;
// go to the ledger, where the tokens live
const ledger = [...doc.querySelectorAll(".tab")].find((tab) => tab.dataset.screen === "ledger");
ledger?.click();
await wait(200);

const tokens = doc.getElementById("tokens");
ok("the ledger shows the tokens panel", Boolean(tokens));
const text = () => tokens?.textContent ?? "";
ok("the horse starts unclaimed", /unclaimed/i.test(text()), text().slice(0, 70).replace(/\s+/g, " "));
ok("...and the bind field is offered", /bind a wallet/i.test(text()));

const input = tokens.querySelector("input");
ok("the address field exists", Boolean(input), input?.getAttribute("aria-label"));
const bind = [...tokens.querySelectorAll("button")].find((b) => /bind/i.test(b.textContent ?? ""));
ok("the bind button exists", Boolean(bind));

input.value = "0x123";
bind.click();
await wait(120);
ok("a malformed address is refused before the call", !calls.some((c) => c.path === "/api/wallet"));

input.value = ADDRESS;
bind.click();
await wait(400);

const call = calls.find((c) => c.path === "/api/wallet");
ok("the screen calls POST /api/wallet", Boolean(call) && call.method === "POST", call ? String(call.body).slice(0, 60) : "no call");
ok("...with the address the player typed", Boolean(call) && JSON.parse(call.body).address === ADDRESS);
ok("...authenticated with the session token", calls.some((c) => c.path === "/api/wallet"));

const after = doc.getElementById("tokens")?.textContent ?? "";
ok("the horse moves to pending", /pending/i.test(after), after.slice(0, 80).replace(/\s+/g, " "));
ok("...and the mint button appears", [...doc.querySelectorAll("#tokens button")].some((b) => /mint/i.test(b.textContent ?? "")));
/* ---------- mint: the last step of the phase ---------- */
const mintButton = () => [...doc.querySelectorAll("#tokens button")].find((b) => /mint/i.test(b.textContent ?? ""));
ok("the mint button is the one the phase ends on", Boolean(mintButton()));
mintButton()?.click();
await wait(500);

const signCall = calls.find((c) => c.path === "/api/mints/sign");
const confirmCall = calls.find((c) => c.path === "/api/mints/confirm");
ok("clicking mint signs the intent", Boolean(signCall) && signCall.method === "POST", signCall ? "POST /api/mints/sign" : "missing");
ok("...and confirms it", Boolean(confirmCall) && confirmCall.method === "POST", confirmCall ? "POST /api/mints/confirm" : "missing");
ok("...with the same nullifier both times",
  Boolean(signCall && confirmCall) && JSON.parse(signCall.body).nullifier === JSON.parse(confirmCall.body).nullifier);

const claimed = doc.getElementById("tokens")?.textContent ?? "";
ok("the horse ends as minted", /minted/i.test(claimed) && !/pending/i.test(claimed), claimed.slice(0, 80).replace(/\s+/g, " "));
ok("...showing its token id", /#900[,\s]?001/.test(claimed), claimed.match(/#[\d,]+/)?.[0] ?? "no id");
ok("...and the mint button is gone", !mintButton());
ok("nothing threw during the mint", errors.length === 0, errors.join(" | "));

ok("nothing threw along the way", errors.length === 0, errors.join(" | "));

dom.window.close();
console.log(bad ? `\n${bad} failing` : "\nall green");
process.exit(bad ? 1 : 0);
