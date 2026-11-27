#!/usr/bin/env node
/**
 * F0-02: official results from the causal engine, behind a per-room flag.
 *
 *   node tests/official-race.test.mjs
 */
import { setup, runRound, setRaceEngine, horseById } from "../assets/engine.js";
import { officialRace, seedFrom, COURSE_FOR } from "../assets/race/official.js";

let bad = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) bad += 1;
};

/* ---------- the flag */
{
  const s = setup(["p"], "official:flag");
  ok("a new room still decides results the legacy way", s.raceEngine === undefined);
  const before = s.log?.length ?? 0;
  setRaceEngine(s, "causal");
  setRaceEngine(s, "causal");
  ok("switching to causal is recorded once, with the meeting it applies from",
    s.raceEngine === "causal" && s.raceEngineSince?.season === s.season && (s.log?.length ?? 0) === before + 1);
  setRaceEngine(s, "nonsense");
  ok("an unknown engine name falls back to legacy", s.raceEngine === "legacy");
}

/* ---------- legacy rooms are untouched */
{
  const a = runRound(setup(["p"], "official:legacy"), "");
  const b = runRound(setup(["p"], "official:legacy"), "");
  ok("a legacy meeting is unchanged and says how it was decided",
    JSON.stringify(a.lastRace.table) === JSON.stringify(b.lastRace.table) && a.lastRace.official?.engine === "legacy");
}

/* ---------- a causal meeting */
const play = (tag) => {
  const s = setup(["p"], `official:${tag}`);
  setRaceEngine(s, "causal");
  return runRound(s, "");
};
const one = play("causal");
const race = one.lastRace;
ok("a causal meeting records the engine, params, seed and hash",
  race.official?.engine === "race-causal/1" && /^[0-9a-f]{32}$/.test(race.official.seed) && typeof race.official.hash === "string",
  JSON.stringify(race.official));
ok("the same room and seed give the same race, to the hash", play("causal").lastRace.official.hash === race.official.hash);
ok("another room gives another race", play("causal-2").lastRace.official.seed !== race.official.seed);

// the placings are exactly the causal finishing order, replayed from the recorded seed
{
  const runners = race.table.map((row) => {
    const horse = horseById(one, row.horseId);
    return { id: row.horseId, traits: null, tactic: row.tactic, horse };
  });
  const { traitsOf } = await import("../assets/engine.js");
  const replay = officialRace({
    condition: race.condition,
    seed: race.official.seed,
    runners: runners.map((r) => ({ id: r.id, traits: traitsOf(r.horse.genome), tactic: r.tactic })),
  });
  ok("replaying the recorded seed reproduces the official race", replay.record.hash === race.official.hash);
  const finishers = race.table.filter((row) => !replay.dnf.includes(row.horseId)).map((row) => row.horseId);
  ok("the table follows the causal finishing order", JSON.stringify(finishers) === JSON.stringify(replay.order));
  ok("places run 1..n with no gaps", race.table.every((row, i) => row.place === i + 1));
}

// the money follows the new order
{
  const paid = race.table.filter((row) => row.prize > 0).map((row) => row.place);
  ok("prizes go to the top places of the causal order", paid.length > 0 && paid.every((place, i) => place === i + 1));
  const winner = horseById(one, race.table[0].horseId);
  ok("the causal winner is credited with the win", winner.wins >= 1);
}

/* ---------- the module on its own */
{
  const seed = seedFrom(() => 0.5);
  ok("a seed is 128-bit hex", /^[0-9a-f]{32}$/.test(seed));
  let threw = false;
  try { officialRace({ condition: "mile", seed, runners: [{ id: "a", traits: {}, tactic: "steady" }] }); } catch { threw = true; }
  ok("fewer than two runners is refused", threw);
  ok("every going has a course", ["sprint", "flying", "mile", "classic", "yielding", "heavy", "staying"].every((k) => COURSE_FOR[k]));
}

console.log(bad ? `\n${bad} official-race case(s) failed.` : "\nofficial-race cases passed.");
process.exit(bad ? 1 : 0);
