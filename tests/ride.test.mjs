#!/usr/bin/env node
/**
 * Riding the exhibition: the player's own runner takes orders, the same race is re-run.
 *
 *   node tests/ride.test.mjs
 */
import { setup, applyAction, validateAction, viewFor } from "../assets/engine.js";
import { prepareExhibition, runExhibition, cleanRide, exhibitionRace } from "../assets/race/exhibition.js";

let bad = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) bad += 1;
};

const SEED = "00112233445566778899aabbccddeeff";
let state = setup(["p"], "ride:test");
const mare = viewFor(state, "p").horses.find((h) => h.age >= 2);
const enter = { type: "enter", horseIds: [mare.id] };
if (validateAction(state, "p", enter).ok) state = applyAction(state, "p", enter);

const prep = prepareExhibition(state, { seed: SEED });
const key = prep.cards.find((c) => c.mine)?.key;
ok("the player's entered runner is in the field and marked as theirs", Boolean(key));

const watch = runExhibition(prep);
ok("watching is unchanged: same hash as the plain exhibition", watch.hash === exhibitionRace(state, { seed: SEED }).hash);
ok("a watched race carries no ride block and no energy", !watch.ride && watch.frames.every((f) => f.r.every((row) => row.length === 3)));

const idle = runExhibition(prep, { ride: { key, inputs: [] } });
ok("riding without an order is the autopilot's race", idle.hash === watch.hash);
ok("the ridden horse alone carries its energy", idle.frames.every((f) => f.r.every((row) => (row[0] === key ? row.length === 4 : row.length === 3))));

// one order, mid-race: everything before it is identical
const at = Math.floor((watch.frames.length * watch.snapshotEvery) / 2);
const kicked = runExhibition(prep, { ride: { key, inputs: [{ tick: at, order: "kick" }] } });
const before = Math.floor(at / watch.snapshotEvery) - 1;
const same = (a, b) => JSON.stringify(a.r.map((r) => r.slice(0, 3))) === JSON.stringify(b.r.map((r) => r.slice(0, 3)));
ok("frames before the order are exactly the frames already shown", watch.frames.slice(0, before).every((f, i) => same(f, kicked.frames[i])));
ok("the order is receipted", kicked.ride.receipts.length === 1 && kicked.ride.receipts[0].tick === at, JSON.stringify(kicked.ride.receipts));
ok("the same orders give the same race", runExhibition(prep, { ride: { key, inputs: [{ tick: at, order: "kick" }] } }).hash === kicked.hash);

// riding changes the outcome: holding all the way is not the autopilot's race
const held = runExhibition(prep, { ride: { key, inputs: [{ tick: 0, order: "hold" }] } });
ok("orders change the race", held.hash !== watch.hash);
const place = (race) => race.placings.find((p) => p.key === key).position;
ok("holding from the gate does not beat the autopilot", place(held) >= place(watch), `${place(held)} vs ${place(watch)}`);

// refusals are explained, not applied
const twice = runExhibition(prep, { ride: { key, inputs: [{ tick: 10, order: "kick" }, { tick: 12, order: "push" }] } });
const second = twice.ride.receipts.find((r) => r.tick === 12);
ok("an order inside the cooldown is refused with its reason", second && second.ok === false && second.reason === "cooldown", JSON.stringify(second));

// only your own runner, only known orders
const other = prep.cards.find((c) => !c.mine).key;
ok("another stable's runner cannot be ridden", cleanRide(prep, { key: other, inputs: [] }) === null);
const dirty = cleanRide(prep, { key, inputs: [{ tick: 5, order: "fly" }, { tick: -1, order: "kick" }, { tick: 2.5, order: "kick" }, { tick: 7, order: "out" }, "x", null] });
ok("unknown orders and bad ticks are dropped", dirty.inputs.length === 1 && dirty.inputs[0].order === "out");
ok("orders are capped", cleanRide(prep, { key, inputs: Array.from({ length: 500 }, (_, i) => ({ tick: i, order: "push" })) }).inputs.length === 120);
ok("no trait or genotype leaves a ridden race", !/traits|genome|"speed"|"stamina"/.test(JSON.stringify(kicked)));

console.log(bad ? `\n${bad} ride case(s) failed.` : "\nride cases passed.");
process.exit(bad ? 1 : 0);
