#!/usr/bin/env node
/**
 * "Enquanto você esteve fora": the difference between two visits, from real game states.
 *
 *   node tests/recap.test.mjs
 */
import { setup, runRound, viewFor, applyAction, validateAction } from "../assets/engine.js";
import { snapshotOf, computeRecap, awayText } from "../assets/recap.js";

let bad = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) bad += 1;
};

let state = setup(["p"], "recap:test");
const act = (action) => { if (validateAction(state, "p", action).ok) state = applyAction(state, "p", action); };
const mare = viewFor(state, "p").horses.find((h) => h.age >= 2);
act({ type: "enter", horseIds: [mare.id] });
act({ type: "takeStarterOffer" });
const straw = viewFor(state, "p").straws[0];
act({ type: "selectStraw", strawId: straw.id });
act({ type: "breed", mareId: mare.id, strawId: straw.id, care: "plain" });

const before = snapshotOf(viewFor(state, "p"));
ok("nothing happened yet: no recap", computeRecap(before, snapshotOf(viewFor(state, "p"))) === null);
ok("no earlier visit: no recap", computeRecap(null, before) === null);

// a season and a half goes by while the owner is away
for (let i = 0; i < 6; i += 1) {
  state = runRound(state, "The clock ran out —");
  const v = viewFor(state, "p");
  if (!v.stable.entries.length) { const runner = v.horses.find((h) => h.age >= 2 && !h.retired); if (runner) act({ type: "enter", horseIds: [runner.id] }); }
}
const after = snapshotOf(viewFor(state, "p"));
after.at = before.at + 3 * 3600 * 1000;
const recap = computeRecap(before, after);

ok("six meetings are counted as one season and two meetings", recap.meetings === 6 && recap.seasons === 1 && recap.restMeetings === 2, JSON.stringify([recap.meetings, recap.seasons, recap.restMeetings]));
const view = viewFor(state, "p");
const total = (key) => view.horses.reduce((a, h) => a + (h[key] ?? 0), 0);
ok("races, wins and prizes are the difference in the horses' own records", recap.starts === total("starts") && recap.wins === total("wins") && recap.prizes === total("earnings"), JSON.stringify([recap.starts, recap.wins, recap.prizes]));
ok("the balance change is the bank's own difference", recap.balance === view.stable.guineas - before.guineas, String(recap.balance));
const foals = view.horses.filter((h) => !before.horses.some((b) => b.id === h.id));
ok("a foal born meanwhile is named", foals.length === 0 || recap.born.some((b) => b.id === foals[0].id), JSON.stringify(recap.born));
ok("the star is the horse that did best, or nobody", recap.star === null || (recap.star.wins + recap.star.places > 0 && view.horses.some((h) => h.id === recap.star.id)));
ok("three hours away is said as hours", awayText(recap.awayMs) === "3 horas" && awayText(20 * 60000) === "20 min" && awayText(3 * 86400000) === "3 dias");

// a horse that left, and one that retired
{
  const prev = { at: 0, clock: 4, per: 4, guineas: 100, horses: [{ id: "a", name: "A", starts: 2, wins: 0, places: 0, earnings: 0, retired: false, age: 9 }, { id: "b", name: "B", starts: 0, wins: 0, places: 0, earnings: 0, retired: false, age: 3 }] };
  const now = { at: 9e6, clock: 9, per: 4, guineas: 60, horses: [{ id: "a", name: "A", starts: 2, wins: 0, places: 0, earnings: 0, retired: true, age: 10 }, { id: "c", name: "C", starts: 0, wins: 0, places: 0, earnings: 0, retired: false, age: 4 }] };
  const r = computeRecap(prev, now);
  ok("a retirement, a departure and an arrival are told apart", r.retired[0]?.id === "a" && r.left[0]?.id === "b" && r.arrived[0]?.id === "c" && r.born.length === 0);
  ok("a falling balance is negative, and no races means no star", r.balance === -40 && r.star === null && r.starts === 0);
}

console.log(bad ? `\n${bad} recap case(s) failed.` : "\nrecap cases passed.");
process.exit(bad ? 1 : 0);
