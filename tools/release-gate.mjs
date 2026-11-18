#!/usr/bin/env node
/**
 * Studbook release gate — validates ONE build over HTTP, and runs the test suite
 * against exactly the files that were served.
 *
 *   node tools/release-gate.mjs index.html
 *   node tools/release-gate.mjs https://lsraiva.github.io/studbook/
 *
 * Gates: G1 served · G2 self-contained · G3 assets resolve · G4 syntax ·
 *        G5 suite (20/20) · G6 manifest hash matches the approved build
 */
import { readFile, mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const target = process.argv[2];
if (!target) {
  console.error("usage: node tools/release-gate.mjs <url|index.html> [--expect <sha256>]");
  process.exit(2);
}

const load = async (url) => {
  if (url.startsWith("file:")) {
    const path = fileURLToPath(url.split("?")[0]);
    const text = await readFile(path, "utf8");
    const ctype = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html";
    return { status: 200, ctype, text };
  }
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "studbook-release-gate" } });
  return { status: res.status, ctype: res.headers.get("content-type") ?? "", text: await res.text() };
};

/** Fetch the page plus every local module it needs, following import graph. */
async function manifest(entryUrl) {
  const page = await load(entryUrl);
  const assets = new Map();
  const queue = [...page.text.matchAll(/(?:src|href)\s*=\s*["']([^"'#]+\.(?:js|css)(?:\?[^"']*)?)["']/gi)].map((m) => new URL(m[1], entryUrl).href);
  while (queue.length) {
    const url = queue.shift();
    if (assets.has(url)) continue;
    const res = await load(url);
    if (res.status !== 200) throw new Error(`${url} → ${res.status}`);
    assets.set(url, res.text);
    if (new URL(url).pathname.endsWith(".js")) {
      for (const m of res.text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) queue.push(new URL(m[1], url).href);
    }
  }
  const digest = createHash("sha256");
  digest.update(page.text);
  for (const url of [...assets.keys()].sort()) digest.update(assets.get(url));
  return { page, assets, digest: digest.digest("hex") };
}

let failed = 0;
const gate = (label, cond, detail = "") => {
  if (!cond) failed += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
};

let served;
try {
  served = await manifest(/^https?:/i.test(target) ? target : new URL(`file://${join(process.cwd(), target)}`).href);
} catch (e) {
  gate("G1 served", false, e.message);
  console.log("\n1 failing gate — do not launch");
  process.exit(1);
}

const html = served.page.text;
gate("G1 served", served.page.status === 200 && /<html/i.test(html), `status ${served.page.status}, ${served.page.ctype}, ${html.length} bytes`);

const external = [
  ...html.matchAll(/<script[^>]+src\s*=\s*["'](https?:)?\/\//gi),
  ...html.matchAll(/<link[^>]+rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["'](https?:)?\/\//gi),
];
gate("G2 self-contained", external.length === 0, external.length ? `${external.length} external asset(s)` : "no third-party scripts or styles");

const refs = [...served.assets.keys()];
const thin = [...served.assets.entries()].filter(([, text]) => text.length < 100).length;
gate("G3 assets resolve", refs.length >= 3 && thin === 0, `${refs.length} file(s) loaded, ${thin} empty`);

let syntax = true;
const mods = refs.filter((u) => new URL(u).pathname.endsWith(".js"));
for (const url of mods) {
  const dir = await mkdtemp(join(tmpdir(), "studbook-syntax-"));
  const file = join(dir, "m.mjs");
  await writeFile(file, served.assets.get(url));
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) {
    syntax = false;
    console.log(`   ${url.split("/").pop()}: ${(check.stderr || "").split("\n")[1] ?? "parse error"}`);
  }
}
gate("G4 syntax", syntax, `${mods.length} module(s) parse`);

const dir = await mkdtemp(join(tmpdir(), "studbook-served-"));
await writeFile(join(dir, "index.html"), html);
for (const [url, text] of served.assets) {
  const name = new URL(url).pathname.split("/").pop();
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "assets", name), text);
}
const suite = spawnSync(process.execPath, [join(root, "tests/engine.test.mjs"), join(dir, "assets/engine.js")], {
  encoding: "utf8",
});
const pass = (suite.stdout.match(/^PASS /gm) ?? []).length;
const fail = (suite.stdout.match(/^FAIL /gm) ?? []).length;
gate("G5 suite", suite.status === 0 && fail === 0 && pass >= 20, `${pass} pass, ${fail} fail`);
if (fail) console.log(suite.stdout.split("\n").filter((l) => l.startsWith("FAIL")).map((l) => "   " + l).join("\n"));

const expectAt = process.argv.indexOf("--expect");
let expect = expectAt > 0 ? (process.argv[expectAt + 1] ?? "").toLowerCase() : "";
if (!expect) {
  expect = (await manifest(new URL(`file://${join(root, "index.html")}`).href)).digest;
}
gate(
  "G6 manifest hash",
  served.digest === expect,
  `${served.digest.slice(0, 16)}… ${served.digest === expect ? "matches" : "DOES NOT match"} ${expect.slice(0, 16)}…`,
);

console.log(failed ? `\n${failed} failing gate(s) — do not launch` : "\nall gates green — this build is releasable");
process.exit(failed ? 1 : 0);
