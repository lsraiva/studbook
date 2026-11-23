#!/usr/bin/env node
/**
 * The first click test. It boots the real page and the real screen module inside jsdom and
 * presses the buttons a player presses — no copies, no mocks of the app's own code.
 *
 *   node tests/ui.test.mjs
 *
 * jsdom is a dev dependency: npm i --no-save jsdom@24
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// jsdom may live in the repo or in the directory the test is run from (CI installs it next to
// the checkout); both are legitimate places to find a dev dependency.
let JSDOM;
for (const base of [process.cwd(), root]) {
  try {
    ({ JSDOM } = createRequire(join(base, "noop.js"))("jsdom"));
    break;
  } catch {
    /* try the next one */
  }
}
if (!JSDOM) {
  console.error("jsdom is not installed: npm i --no-save jsdom@24");
  process.exit(2);
}

let bad = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) bad += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
};

/** Boot the page exactly as the browser does, then hand back the handles we need. */
async function boot() {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://127.0.0.1:9999/studbook/", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;

  for (const key of Object.getOwnPropertyNames(window)) {
    if (!(key in globalThis)) {
      try {
        globalThis[key] = window[key];
      } catch {
        /* read-only globals are fine to skip */
      }
    }
  }
  globalThis.window = window;
  globalThis.document = window.document;
  const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.matchMedia = matchMedia;
  globalThis.matchMedia = matchMedia;

  const errors = [];
  window.addEventListener("error", (event) => errors.push(String(event.message)));
  window.addEventListener("unhandledrejection", (event) => errors.push(`rejection: ${event.reason?.message ?? event.reason}`));

  await import(pathToFileURL(join(root, "assets/ui.js")).href);

  const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50; i += 1) {
    if (Object.keys(window.localStorage).some((k) => k.startsWith("studbook:standalone"))) break;
    await wait(20);
  }
  await wait(80);

  const buttons = () => [...window.document.querySelectorAll("button")];
  const byText = (re) => buttons().find((button) => re.test(button.textContent ?? ""));

  /** The save is the engine's word: what the UI claims must match what actually happened. */
  const savedState = () => {
    const key = Object.keys(window.localStorage).find((k) => k.startsWith("studbook:standalone"));
    return key ? JSON.parse(window.localStorage.getItem(key)).state : null;
  };

  return { dom, window, document: window.document, errors, wait, buttons, byText, savedState };
}

const app = await boot();
const { window, document, errors, wait, byText, savedState } = app;

/* ---------- 1. the page is alive ---------- */
ok("the page boots without an error", errors.length === 0, errors.join(" | "));
ok("the hero shows the stable", /Studbook/.test(document.querySelector("h1")?.textContent ?? ""));
const startGuineas = savedState()?.stables?.[0]?.guineas;
ok("a fresh stable starts with 2000 guineas", startGuineas === 2000, String(startGuineas));

/* ---------- 1b. the guide: one instruction and the button that does it ---------- */
const guide = document.getElementById("nextstep");
ok("the next-step card is on screen", Boolean(guide) && !guide.hidden, guide?.textContent?.slice(0, 60));
ok("...and the season's four goals with it", /win a meeting/.test(guide?.textContent ?? "") && /cover a mare/.test(guide?.textContent ?? ""));
const go = document.getElementById("nextstep-go");
ok("...with a button that executes it", Boolean(go), go?.textContent);
go?.click();
await wait(160);
ok("...and the button bought the covering", savedState().stables[0].guineas === 1980, `${savedState().stables[0].guineas} GNS`);
ok("...the card moved on to the next step", /cover|pick|select|enter/i.test(document.getElementById("nextstep")?.textContent ?? ""),
  document.getElementById("nextstep")?.textContent?.slice(0, 80));

/* ---------- 2. the straw is in the barn (bought by the guide above) ---------- */
const afterCover = savedState();
ok("the covering is bought", afterCover.stables[0].guineas === 1980, `${afterCover.stables[0].guineas} GNS`);
ok("...and it is in the barn", afterCover.stables[0].straws.length === 1, `${afterCover.stables[0].straws.length} straw(s)`);

/* ---------- 3. step two: select the straw ---------- */
const select = byText(/^select$/i);
ok("the straw can be selected", Boolean(select), select?.textContent?.trim());
select?.click();
await wait(140);
ok("the server knows the selection", Boolean(savedState().stables[0].selectedStraw), String(savedState().stables[0].selectedStraw));

/* ---------- 4. step three: breed ---------- */
const breed = document.querySelector("[data-breed]");
ok("the breed button exists and is enabled", Boolean(breed) && !breed.disabled, breed?.dataset?.breed);
breed?.click();
await wait(200);

const bred = savedState();
ok("the covering is spent", bred.stables[0].straws.length === 0, `${bred.stables[0].straws.length} left`);
// The covering catches about 92% of the time: the click must reach the engine either way, and the
// deterministic pregnancy is proved by the engine suite, which seeds the game.
const pregnant = (bred.foaling ?? []).length === 1;
ok("the breed reached the engine", pregnant || bred.lastFoal?.event === "miss",
  pregnant ? JSON.stringify(bred.foaling[0]) : `miss at ${bred.lastFoal?.chance}`);
ok("the selection is cleared, so the next breed works", bred.stables[0].selectedStraw === null || bred.stables[0].selectedStraw === undefined);
if (!pregnant) {
  console.log("   (the covering missed this run — the deterministic pregnancy is in the engine suite)");
}
const foalPanel = pregnant ? [...document.querySelectorAll("h2")]
  .filter((h) => /^In foal/i.test(h.textContent ?? ""))
  .map((h) => h.parentElement?.textContent ?? "")[0] ?? "" : "";
ok(
  "the in-foal panel lists the mare",
  !pregnant || (/In foal/i.test(foalPanel) && !/No mares in foal/i.test(foalPanel)),
  pregnant ? foalPanel.slice(0, 100).replace(/\s+/g, " ") : "no pregnancy this run",
);
ok("nothing threw along the way", errors.length === 0, errors.join(" | "));

/* ---------- 5. the guard: a mare already in foal cannot be covered again ---------- */
const again = document.querySelector("[data-breed]");
if (again) {
  const wasDisabled = again.disabled;
  again.click();
  await wait(150);
  const after = savedState();
  ok("a mare in foal cannot be covered twice", !pregnant || (after.foaling ?? []).length === 1,
    `button disabled=${wasDisabled}, rows=${(after.foaling ?? []).length}`);
}

/* ---------- 6. the run button: does a click advance the meeting? ---------- */
const runButton = document.getElementById("advance");
ok("the run button exists and carries its delegate marker", Boolean(runButton) && runButton.dataset.run === "1",
   runButton?.textContent?.trim());
const seasonBeforeRun = savedState().season;
const meetingBeforeRun = savedState().meeting ?? 1;
runButton?.click();
await wait(220);
const afterRun = savedState();
const expectedMeeting = meetingBeforeRun === 4 ? 1 : meetingBeforeRun + 1;
const expectedSeason = seasonBeforeRun + (meetingBeforeRun === 4 ? 1 : 0);
const advanced = (afterRun.meeting ?? 1) === expectedMeeting && afterRun.season === expectedSeason;
ok("one click advances exactly one meeting", advanced,
   `m${meetingBeforeRun} → m${afterRun.meeting ?? 1} (season ${seasonBeforeRun} → ${afterRun.season})`);
ok("the race was recorded", Boolean(afterRun.lastRace), afterRun.lastRace ? `${afterRun.lastRace.runners} runners` : "no lastRace");

/* Follow the remaining meetings through rollover: every click has one effect. */
for (let i = 0; i < 3; i += 1) {
  const previous = savedState();
  document.getElementById("advance")?.click();
  await wait(120);
  const current = savedState();
  const meeting = previous.meeting ?? 1;
  ok("one click stays exact across the season boundary", current.meeting === (meeting === 4 ? 1 : meeting + 1) && current.season === previous.season + (meeting === 4 ? 1 : 0));
}
const disabledRun = document.getElementById("advance");
const disabledBefore = savedState();
disabledRun.disabled = true;
disabledRun.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await wait(100);
ok("disabled run control has no delegated effect", savedState().meeting === disabledBefore.meeting && savedState().season === disabledBefore.season);

app.dom.window.close();
console.log(bad ? `\n${bad} failing` : "\nall green");
process.exit(bad ? 1 : 0);
