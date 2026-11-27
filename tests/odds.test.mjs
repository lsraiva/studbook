#!/usr/bin/env node
/**
 * Odds before the off: each runner's chance from running the meeting with the deciding rule.
 *
 *   node tests/odds.test.mjs
 */
import { setup, runRound, viewFor, fieldOdds, setRaceEngine, applyAction, validateAction } from "../assets/engine.js";

let bad = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) bad += 1;
};
const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);

/* ---------- the legacy rule ---------- */
const s = setup(["p"], "odds:test");
const before = JSON.stringify(s);
const odds = fieldOdds(s);
ok("asking for the odds changes nothing in the room, not even its random stream", JSON.stringify(s) === before);
ok("every declared runner has odds", odds.rows.length === viewFor(s, "p").paddock.length && odds.rows.length > 3);
ok("the chances of winning add up to one", Math.abs(sum(odds.rows, "win") - 1) < 0.03, String(sum(odds.rows, "win")));
ok("paid places add up to the places paid", Math.abs(sum(odds.rows, "paid") - Math.min(4, odds.rows.length)) < 0.01, String(sum(odds.rows, "paid")));
ok("the same field gives the same odds", JSON.stringify(fieldOdds(setup(["p"], "odds:test"))) === JSON.stringify(odds));
ok("the legacy rule is the one simulated", odds.engine === "legacy" && odds.sims === 400);

// the odds predict: over many meetings the favourite wins about as often as its odds say
{
  let said = 0, won = 0, n = 0;
  for (let g = 0; g < 10; g += 1) {
    let state = setup(["sim"], `odds:calib:${g}`);
    for (let i = 0; i < 8; i += 1) {
      const o = fieldOdds(state);
      const fav = [...o.rows].sort((a, b) => b.win - a.win)[0];
      state = runRound(state, "");
      const winner = state.lastRace?.table?.[0]?.horseId;
      if (!fav || !winner) continue;
      said += fav.win; won += winner === fav.horseId ? 1 : 0; n += 1;
    }
  }
  ok("favourites win about as often as their odds say", Math.abs(said / n - won / n) < 0.15, `said ${(said / n).toFixed(2)}, won ${(won / n).toFixed(2)} over ${n} meetings`);
}

// the view carries them, and an instruction moves them
{
  let state = setup(["p"], "odds:view");
  const mare = viewFor(state, "p").horses.find((h) => h.age >= 2);
  const act = (action) => { if (validateAction(state, "p", action).ok) state = applyAction(state, "p", action); };
  act({ type: "enter", horseIds: [mare.id] });
  const row = (st) => viewFor(st, "p").paddock.find((r) => r.horseId === mare.id);
  const steady = row(state);
  ok("the player's runner shows its chance, its paid chance and its expected prize", typeof steady.win === "number" && typeof steady.paid === "number" && typeof steady.prize === "number", JSON.stringify([steady.win, steady.paid, steady.prize]));
  act({ type: "setTactic", horseId: mare.id, tactic: "push" });
  const push = row(state);
  act({ type: "setTactic", horseId: mare.id, tactic: "hold" });
  const hold = row(state);
  ok("changing the instruction moves the odds", new Set([steady.paid, push.paid, hold.paid, steady.prize, push.prize, hold.prize]).size > 2, JSON.stringify([steady.prize, push.prize, hold.prize]));
}

/* ---------- the causal rule ---------- */
{
  const c = setup(["p"], "odds:test");
  setRaceEngine(c, "causal");
  const rng = c.rng;
  const o = fieldOdds(c);
  ok("a room on the causal engine gets odds from the causal race", o.engine === "causal" && o.sims === 24);
  ok("...without touching the room's random stream", c.rng === rng);
  ok("...that add up to one", Math.abs(sum(o.rows, "win") - 1) < 0.06, String(sum(o.rows, "win")));
  ok("...and differ from the legacy odds of the same field", JSON.stringify(o.rows.map((r) => r.win)) !== JSON.stringify(odds.rows.map((r) => r.win)));
}

console.log(bad ? `\n${bad} odds case(s) failed.` : "\nodds cases passed.");
process.exit(bad ? 1 : 0);
