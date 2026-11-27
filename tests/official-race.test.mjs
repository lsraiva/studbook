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

/* ---------- the loss is explained by the race itself ---------- */
{
  const { applyAction, viewFor } = await import("../assets/engine.js");
  let s2 = setup(["p"], "official:notes");
  setRaceEngine(s2, "causal");
  const mare = viewFor(s2, "p").horses.find((h) => h.age >= 2);
  s2 = applyAction(s2, "p", { type: "enter", horseIds: [mare.id] });
  const notes = [];
  for (let i = 0; i < 6; i += 1) {
    s2 = runRound(s2, "");
    for (const line of s2.log) { const text = line.text ?? line; if (/ finished \d+ of \d+ in the /.test(text)) notes.push(text); }
  }
  ok("a causal room explains a loss by what happened in the race", notes.length > 0 && notes.every((t) => /(s behind|did not finish) — (was outrun on the day|did not finish|stumbled|was boxed in|ran out of breath|finished with breath to spare)/.test(t)), notes[0]);
  ok("...and never by the form score's traits", notes.every((t) => !/lost it on/.test(t)));
  const { translate } = (await import("../assets/i18n.js")).default ?? (await import("../assets/i18n.js"));
  if (typeof translate === "function") ok("...in Portuguese on screen", /chegou em \d+º de \d+ na /.test(translate(notes[0])), translate(notes[0]));
}

/* ---------- params/2: form on the day ---------- */
{
  const { PARAMS_V1, PARAMS_V2, RACE_PARAMS, runRace } = await import("../assets/race/causal.js");
  ok("new races run on params/2, and the result says so", RACE_PARAMS === PARAMS_V2 && race.official.params === "params/2");
  ok("params/2 is params/1 plus form on the day, nothing else", Object.keys(PARAMS_V2).filter((k) => PARAMS_V2[k] !== PARAMS_V1[k]).sort().join() === "formSpread,version");
  const spec = { distance: 1600, going: "good", seed: "0123456789abcdef0123456789abcdef", runners: Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, traits: { speed: 6, stamina: 6, accel: 6, recovery: 6, temperament: i * 2, soundness: 6 } })) };
  const v1 = runRace(spec, { params: PARAMS_V1 });
  ok("a params/1 race still replays exactly (no form is drawn)", runRace(spec).hash === v1.hash);
  const v2 = runRace(spec, { params: PARAMS_V2 });
  ok("form on the day changes a race, and replays exactly from its seed", v2.hash !== v1.hash && runRace(spec, { params: PARAMS_V2 }).hash === v2.hash);
}

console.log(bad ? `\n${bad} official-race case(s) failed.` : "\nofficial-race cases passed.");
process.exit(bad ? 1 : 0);
