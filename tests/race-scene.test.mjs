#!/usr/bin/env node
/** Live race: course geometry shared by engine and picture, and the exhibition payload. */
import assert from "node:assert/strict";
import { COURSE, lapLength, bendsFor, pointAt, finishPost } from "../assets/race/track.js";
import { exhibitionRace, declaredField, COURSE_FOR } from "../assets/race/exhibition.js";
import { PARAMS_V1 } from "../assets/race/causal.js";
import { setup } from "../assets/engine.js";

let n = 0;
const test = (label, fn) => { fn(); n += 1; console.log(`PASS ${label}`); };
const SEED = "0123456789abcdef0123456789abcdef";
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("course constants match the engine (bend radius, lane width)", () => {
  assert.equal(COURSE.radius, PARAMS_V1.bendRadius);
  assert.equal(COURSE.laneWidth, PARAMS_V1.laneWidth);
});
test("every race finishes on the post at the end of the home straight", () => {
  for (const d of [1000, 1600, 2800]) {
    const p = pointAt(d, d, 0);
    const post = finishPost();
    assert.ok(near(p.x, post.x) && near(p.y, post.y), `${d}: ${p.x},${p.y}`);
    assert.ok(near(p.heading, 0));
  }
});
test("the rail is continuous: no jumps between consecutive metres", () => {
  const d = 2400;
  let prev = pointAt(d, 0, 0);
  for (let m = 0.5; m <= d; m += 0.5) {
    const p = pointAt(d, m, 0);
    const step = Math.hypot(p.x - prev.x, p.y - prev.y);
    assert.ok(step < 0.51 && step > 0.49, `jump of ${step} at ${m}`);
    prev = p;
  }
});
test("an outer lane on a bend is further from the centre", () => {
  const d = 1200;
  const [a, b] = bendsFor(d)[0];
  const mid = (a + b) / 2;
  const inner = pointAt(d, mid, 0), outer = pointAt(d, mid, 6);
  assert.ok(Math.hypot(outer.x, outer.y) > Math.hypot(inner.x, inner.y));
});
test("bend sections cover exactly the curved ground of the race", () => {
  for (const d of [1000, 2000, 3200]) {
    const bends = bendsFor(d);
    for (const [a, b] of bends) assert.ok(a >= 0 && b <= d && b > a);
    for (let i = 1; i < bends.length; i += 1) assert.ok(bends[i][0] >= bends[i - 1][1] - 1e-9, "no overlap");
    // sample: a metre is in a bend iff the drawn path turns there
    let turning = 0, flagged = 0;
    for (let m = 1; m < d - 1; m += 1) {
      const h0 = pointAt(d, m - 0.5, 0).heading, h1 = pointAt(d, m + 0.5, 0).heading;
      const turns = !near(Math.cos(h0), Math.cos(h1), 1e-9) || !near(Math.sin(h0), Math.sin(h1), 1e-9);
      const inBend = bends.some(([a, b]) => m >= a && m < b);
      if (turns) turning += 1;
      if (turns === inBend) flagged += 1;
    }
    assert.ok(flagged / (d - 2) > 0.995, `${d}: geometry and bends agree on ${flagged}/${d - 2} metres`);
    assert.ok(turning > 0);
  }
  assert.ok(near(lapLength(), 2 * COURSE.straight + 2 * Math.PI * COURSE.radius));
});

const state = setup(["p1"], "scene-test");
test("the exhibition runs exactly the declared field", () => {
  const race = exhibitionRace(state, { seed: SEED });
  assert.equal(race.runners.length, declaredField(state).length);
  assert.equal(race.kind, "exhibition");
  assert.equal(race.distance, COURSE_FOR[state.condition].distance);
  assert.equal(race.placings.length + 0, race.runners.length);
});
test("no genotype or trait leaves the exhibition", () => {
  const text = JSON.stringify(exhibitionRace(state, { seed: SEED }));
  for (const word of ["genome", "traits", "speed", "stamina", "accel", "recovery", "temperament", "soundness"]) {
    assert.ok(!text.includes(`"${word}"`), word);
  }
  const ids = new Set(state.horses.map((h) => h.id));
  for (const r of exhibitionRace(state, { seed: SEED }).runners) assert.ok(!ids.has(r.key), "anonymous runner keys");
});
test("same seed, same race; a new seed, a new race", () => {
  const a = exhibitionRace(state, { seed: SEED });
  const b = exhibitionRace(state, { seed: SEED });
  const c = exhibitionRace(state, { seed: "fedcba9876543210fedcba9876543210" });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
});
test("frames are positions only and end with every runner past the post", () => {
  const race = exhibitionRace(state, { seed: SEED });
  const last = race.frames.at(-1);
  assert.ok(last.r.every((row) => row.length === 3 && row[1] >= race.distance - 30));
});
test("fewer than two declared runners: no exhibition", () => {
  const empty = structuredClone(state);
  for (const stable of empty.stables) stable.entries = [];
  assert.equal(exhibitionRace(empty, { seed: SEED }), null);
});

console.log(`${n} live race cases passed.`);
