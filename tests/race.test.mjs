#!/usr/bin/env node
/** F4 — causal race engine: physics causes the result, determinism, fairness, bots, seeds. */
import assert from "node:assert/strict";
import { runRace, createRng, PARAMS_V1, BOTS, digest } from "../assets/race/causal.js";
import { deriveRaceSeed, newRaceNonce, seedCommitment } from "../server/race-seed.mjs";

let n = 0;
const test = (label, fn) => { fn(); n += 1; console.log(`PASS ${label}`); };
const SEED = "0123456789abcdef0123456789abcdef";
const seedOf = (i) => digest(`seed-${i}`) + digest(`more-${i}`);
const avg = { speed: 6, stamina: 6, accel: 6, recovery: 6, temperament: 6, soundness: 6 };
const field = (traitsList) => traitsList.map((traits, i) => ({ key: `h${i}`, traits: { ...avg, ...traits } }));
const winRate = (make, key, races = 60) => {
  let wins = 0;
  for (let i = 0; i < races; i += 1) if (runRace(make(seedOf(i))).placings[0].key === key) wins += 1;
  return wins / races;
};

/* ---------- F4-01: logical clock and versioned params ---------- */
test("params are frozen and versioned", () => {
  assert.ok(Object.isFrozen(PARAMS_V1) && Object.isFrozen(PARAMS_V1.orders.kick));
  assert.equal(PARAMS_V1.version, "params/1");
});
test("the race never reads Math.random", () => {
  const original = Math.random;
  Math.random = () => { throw new Error("Math.random used"); };
  try {
    runRace({ distance: 1200, seed: SEED, runners: field([{}, {}, {}]) }, { policies: { h0: BOTS.closer, h1: BOTS.stalker, h2: BOTS.frontRunner } });
  } finally { Math.random = original; }
});
test("the seeded PRNG is uniform enough and rejects weak seeds", () => {
  const rng = createRng(SEED);
  let sum = 0;
  for (let i = 0; i < 20000; i += 1) sum += rng();
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.01);
  assert.throws(() => createRng("1234"));
});

/* ---------- F4-02: movement, fatigue, going ---------- */
test("realistic pace: an average horse runs 2000 m in 120–140 s", () => {
  const r = runRace({ distance: 2000, seed: SEED, runners: field([{}, {}]) });
  for (const p of r.placings) assert.ok(p.time > 120 && p.time < 140, String(p.time));
});
test("speed wins sprints, stamina wins staying races", () => {
  const sprint = (seed) => ({ distance: 1000, seed, runners: field([{ speed: 11, stamina: 2 }, { speed: 3, stamina: 11 }]) });
  const stay = (seed) => ({ distance: 3600, seed, runners: field([{ speed: 11, stamina: 2 }, { speed: 3, stamina: 11 }]) });
  assert.ok(winRate(sprint, "h0") > 0.8, "speed horse at 1000 m");
  assert.ok(winRate(stay, "h1") > 0.8, "stamina horse at 3600 m");
});
test("going changes times and heavy ground hurts unsound horses more", () => {
  const time = (going, soundness) => runRace({ distance: 2000, going, seed: SEED, runners: field([{ soundness }, { soundness }]) }).placings[0].time;
  assert.ok(time("heavy", 6) > time("good", 6) && time("good", 6) > time("firm", 6));
  assert.ok(time("heavy", 0) - time("good", 0) > time("heavy", 12) - time("good", 12));
});
test("an outer lane on a bend covers more ground", () => {
  const spec = { distance: 1600, seed: SEED, lanes: 12, bends: [[200, 800]], runners: field([{}, {}]) };
  const rail = runRace(spec);
  const outside = rail.placings.reduce((a, b) => (b.gate > a.gate ? b : a)).key; // the one with nobody outside it
  const wide = runRace(spec, { inputs: [0, 25, 50, 75, 100, 125, 150, 175].map((tick) => ({ tick, key: outside, order: "out" })) });
  const time = (r) => r.placings.find((p) => p.key === outside).time;
  assert.ok(wide.receipts.filter((x) => x.key === outside && x.ok).length >= 4, "the horse actually moved out");
  assert.ok(time(wide) > time(rail) + 0.5, `${time(wide)} vs ${time(rail)}`);
});
test("energy fades a horse that is pushed too hard too early", () => {
  const hard = runRace({ distance: 3000, seed: SEED, runners: field([{}, {}]) },
    { inputs: [{ tick: 0, key: "h0", order: "kick" }, ...Array.from({ length: 40 }, (_, i) => ({ tick: 100 + i * 100, key: "h0", order: "kick" }))] });
  const h0 = hard.placings.find((p) => p.key === "h0");
  const h1 = hard.placings.find((p) => p.key === "h1");
  assert.ok(hard.placings[0].key === "h1" && h0.time - h1.time > 2, `${h0.time} vs ${h1.time}`);
});

/* ---------- F4-03: tactics, cooldowns, space ---------- */
test("order spam is receipted and refused by cooldown, not rewarded", () => {
  const spam = Array.from({ length: 400 }, (_, i) => ({ tick: i, key: "h0", order: i % 2 ? "kick" : "push" }));
  const r = runRace({ distance: 1600, seed: SEED, runners: field([{}, {}]) }, { inputs: spam });
  const accepted = r.receipts.filter((x) => x.key === "h0" && x.ok).length;
  assert.ok(accepted < 120, `${accepted} accepted`);
  assert.ok(r.receipts.some((x) => x.reason === "cooldown"));
  // a sensible ride at a mile: keep the default push, one kick in the last ~20% of a ~105 s race
  const calm = runRace({ distance: 1600, seed: SEED, runners: field([{}, {}]) }, { inputs: [{ tick: 1700, key: "h0", order: "kick" }] });
  const spamAll = runRace({ distance: 1600, seed: SEED, runners: field([{}, {}]) }, { inputs: Array.from({ length: 2400 }, (_, i) => ({ tick: i, key: "h0", order: ["kick", "push", "hold"][i % 3] })) });
  assert.ok(spamAll.placings.find((p) => p.key === "h0").time > calm.placings.find((p) => p.key === "h0").time, "whole-race spam is slower");
  assert.ok(calm.placings.find((p) => p.key === "h0").time <= r.placings.find((p) => p.key === "h0").time + 0.5);
});
test("horses never pass through each other in the same lane", () => {
  const r = runRace({ distance: 1600, seed: SEED, lanes: 2, runners: field([{ speed: 0 }, { speed: 12 }]) }, {
    inputs: [{ tick: 0, key: "h0", order: "hold" }],
  });
  // whichever is behind in a shared lane must stay at least a length back in every frame
  for (const f of r.frames) {
    const [a, b] = f.r;
    if (Math.abs(a[2] - b[2]) < 0.85) assert.ok(Math.abs(a[1] - b[1]) >= PARAMS_V1.bodyLength - 1e-9 || f.t <= 1, `frame ${f.t}`);
  }
});
test("in a full field horses get boxed in, and moving out gets them clear (at a cost)", () => {
  const runners = field(Array.from({ length: 8 }, (_, i) => ({ speed: i % 12, stamina: (i * 5) % 12 })));
  const policies = Object.fromEntries(runners.map((r, i) => [r.key, [BOTS.frontRunner, BOTS.closer, BOTS.stalker][i % 3]]));
  const spec = { distance: 2000, seed: SEED, lanes: 10, bends: [[300, 900], [1300, 1900]], runners };
  const base = runRace(spec, { policies });
  const boxed = base.placings.reduce((a, b) => (b.boxedSeconds > a.boxedSeconds ? b : a));
  assert.ok(boxed.boxedSeconds > 1, `most boxed ${boxed.key} ${boxed.boxedSeconds}s`);
  const { [boxed.key]: _bot, ...others } = policies;
  const escape = runRace(spec, { policies: others, inputs: Array.from({ length: 120 }, (_, i) => ({ tick: 20 + i * 20, key: boxed.key, order: "out" })) });
  const after = escape.placings.find((p) => p.key === boxed.key);
  assert.ok(after.boxedSeconds < boxed.boxedSeconds, `${boxed.boxedSeconds} -> ${after.boxedSeconds}`);
  // going wide is a real trade-off (more ground on the bends, no shelter): not asserted to be faster
});

/* ---------- F4-04: bots ---------- */
test("three bot styles produce different order sequences and respect cooldowns", () => {
  const r = runRace({ distance: 2000, seed: SEED, lanes: 8, bends: [[400, 1000]], runners: field([{}, {}, {}, {}, {}, {}]) },
    { policies: { h0: BOTS.frontRunner, h1: BOTS.closer, h2: BOTS.stalker, h3: BOTS.frontRunner, h4: BOTS.closer, h5: BOTS.stalker } });
  const seq = (key) => r.receipts.filter((x) => x.key === key && x.ok).map((x) => x.order).join(",");
  assert.notEqual(seq("h0"), seq("h1"));
  assert.notEqual(seq("h1"), seq("h2"));
  for (const x of r.receipts.filter((x) => x.bot && x.ok)) assert.ok(["hold", "push", "kick", "out", "in"].includes(x.order));
  const closers = new Set();
  for (let i = 0; i < 6; i += 1) {
    const rr = runRace({ distance: 2000, seed: seedOf(i), runners: field([{}, {}]) }, { policies: { h0: BOTS.closer, h1: BOTS.closer } });
    closers.add(rr.receipts.filter((x) => x.order === "kick" && x.ok).map((x) => `${x.key}@${x.tick}`).join());
  }
  assert.ok(closers.size > 1, "closers vary their kick point between races");
});
test("bots see no hidden traits of rivals", () => {
  let seen = null;
  runRace({ distance: 1000, seed: SEED, runners: field([{}, {}]) }, { policies: { h0: (view) => { seen ??= view; return null; } } });
  assert.ok(!JSON.stringify(seen).includes("stamina") && seen.ahead.every((a) => Object.keys(a).sort().join() === "gap,lane,v"));
});

/* ---------- F4-05: finish, ties, determinism ---------- */
test("same inputs give the same hash; input and runner order do not matter", () => {
  const runners = field([{ speed: 7 }, { stamina: 9 }, { accel: 10 }, {}]);
  const inputs = [{ tick: 300, key: "h1", order: "kick" }, { tick: 100, key: "h2", order: "out" }, { tick: 300, key: "h0", order: "kick" }];
  const policies = { h3: BOTS.stalker };
  const a = runRace({ distance: 1800, seed: SEED, lanes: 6, runners }, { inputs, policies });
  const b = runRace({ distance: 1800, seed: SEED, lanes: 6, runners: [...runners].reverse() }, { inputs: [...inputs].reverse(), policies });
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.placings, b.placings);
  const c = runRace({ distance: 1800, seed: "fedcba9876543210fedcba9876543210", lanes: 6, runners }, { inputs, policies });
  assert.notEqual(a.hash, c.hash);
});
test("identical horses with identical luck dead-heat, regardless of array order", () => {
  const params = { ...PARAMS_V1, startDelayMax: 0, stumbleRate: 0 };
  const r = runRace({ distance: 1000, seed: SEED, lanes: 2, runners: field([{}, {}]) }, { params });
  assert.equal(r.deadHeat, true);
  assert.deepEqual(r.placings.map((p) => p.position), [1, 1]);
});
test("finish times are interpolated inside the tick", () => {
  const r = runRace({ distance: 1000, seed: SEED, runners: field([{}, { speed: 7 }]) });
  assert.ok(r.placings.some((p) => Math.abs(p.time * 20 - Math.round(p.time * 20)) > 1e-6));
});
test("the replay frames end at the result and match it", () => {
  const r = runRace({ distance: 1200, seed: SEED, runners: field([{ speed: 9 }, {}, { stamina: 9 }]) });
  const last = r.frames.at(-1);
  assert.ok(last.r.every(([, x]) => x >= 1200 - 25));
  assert.ok(r.frames.length >= (r.ticks / PARAMS_V1.snapshotEvery) - 1);
});

/* ---------- F4-06: seeds and benchmark ---------- */
test("seeds come from a server secret, not from public ids", () => {
  const secret = "test-only-secret-not-a-real-credential-0001";
  const nonce = newRaceNonce();
  const s1 = deriveRaceSeed({ secret, raceId: "race-1", nonce });
  assert.match(s1, /^[0-9a-f]{32}$/);
  assert.equal(s1, deriveRaceSeed({ secret, raceId: "race-1", nonce }));
  assert.notEqual(s1, deriveRaceSeed({ secret: secret + "x", raceId: "race-1", nonce }));
  assert.notEqual(s1, deriveRaceSeed({ secret, raceId: "race-1", nonce: newRaceNonce() }));
  assert.throws(() => deriveRaceSeed({ secret: "short", raceId: "race-1", nonce }));
  assert.equal(seedCommitment(s1).length, 64);
});
test("benchmark: a 16-runner 2400 m race with bots runs well under real time", () => {
  const runners = field(Array.from({ length: 16 }, (_, i) => ({ speed: i % 12, stamina: (i * 5) % 12 })));
  const policies = Object.fromEntries(runners.map((r, i) => [r.key, [BOTS.frontRunner, BOTS.closer, BOTS.stalker][i % 3]]));
  const started = performance.now();
  const r = runRace({ distance: 2400, seed: SEED, lanes: 16, bends: [[300, 900], [1500, 2100]], runners }, { policies });
  const ms = performance.now() - started;
  console.log(`   benchmark: ${r.ticks} ticks, ${r.placings.length} finishers in ${ms.toFixed(1)} ms`);
  assert.equal(r.placings.length, 16);
  assert.ok(ms < 1500);
});

console.log(`${n} race engine cases passed.`);
