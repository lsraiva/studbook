#!/usr/bin/env node
/**
 * F0-02: how official results change when the causal engine decides them.
 *
 *   node tools/compare-race-engines.mjs [games=20] [seasons=6]
 *
 * Plays the same games twice, one on the legacy score and one on the causal race, with the
 * same seeds, and reports what a player would feel: how often the best horse wins, how well
 * value predicts placing, how often an outsider wins, how the money spreads, and how long a
 * meeting takes to resolve. Reads only the engine; writes nothing.
 */
import { setup, runRound, setRaceEngine, horseById } from "../assets/engine.js";

const games = Number(process.argv[2] ?? 20);
const seasons = Number(process.argv[3] ?? 6);

/** Spearman rank correlation between two equal-length arrays. */
function spearman(xs, ys) {
  const ranks = (arr) => {
    const sorted = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(arr.length);
    sorted.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  const rx = ranks(xs), ry = ranks(ys);
  const n = xs.length;
  const mean = (n - 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i += 1) {
    num += (rx[i] - mean) * (ry[i] - mean);
    dx += (rx[i] - mean) ** 2;
    dy += (ry[i] - mean) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

function play(engine, seed) {
  let state = setup(["sim"], `compare:${seed}`);
  setRaceEngine(state, engine);
  const meetings = [];
  let ms = 0;
  const target = seasons * 4;
  for (let i = 0; i < target; i += 1) {
    const t0 = performance.now();
    state = runRound(state, "");
    ms += performance.now() - t0;
    const race = state.lastRace;
    if (!race || !race.table || race.table.length < 2) continue;
    const key = `${race.season}:${race.meeting}`;
    if (meetings.length && meetings[meetings.length - 1].key === key) continue;
    const rows = race.table.map((row) => {
      const horse = horseById(state, row.horseId);
      return { ...row, value: horse?.value ?? 0, fit: horse?.conditions?.[race.condition] ?? 0 };
    });
    meetings.push({ key, rows, official: race.official?.engine ?? "legacy" });
  }
  return { meetings, ms, rounds: target, state };
}

function summarise(result) {
  let favWins = 0, top3Fav = 0, outsiderWins = 0, rhoSum = 0, fitSum = 0, fitFav = 0, n = 0, runners = 0;
  const prizeByStable = new Map();
  for (const meeting of result.meetings) {
    const rows = meeting.rows;
    const byValue = [...rows].sort((a, b) => b.value - a.value);
    const winner = rows.find((r) => r.place === 1);
    if (winner && winner.horseId === byValue[0].horseId) favWins += 1;
    if (winner && byValue.slice(0, 3).some((r) => r.horseId === winner.horseId)) top3Fav += 1;
    // an outsider: the winner was in the bottom half of the field by value
    if (winner && byValue.findIndex((r) => r.horseId === winner.horseId) >= Math.ceil(rows.length / 2)) outsiderWins += 1;
    rhoSum += spearman(rows.map((r) => r.value), rows.map((r) => -r.place));
    fitSum += spearman(rows.map((r) => r.fit), rows.map((r) => -r.place));
    const byFit = [...rows].sort((a, b) => b.fit - a.fit);
    if (winner && winner.horseId === byFit[0].horseId) fitFav += 1;
    runners += rows.length;
    for (const r of rows) prizeByStable.set(r.stableId, (prizeByStable.get(r.stableId) ?? 0) + (r.prize ?? 0));
    n += 1;
  }
  const prizes = [...prizeByStable.values()].sort((a, b) => b - a);
  const total = prizes.reduce((a, b) => a + b, 0) || 1;
  return {
    meetings: n,
    runners: n ? runners / n : 0,
    favWin: n ? favWins / n : 0,
    top3Win: n ? top3Fav / n : 0,
    outsider: n ? outsiderWins / n : 0,
    rho: n ? rhoSum / n : 0,
    fitRho: n ? fitSum / n : 0,
    fitFav: n ? fitFav / n : 0,
    topStableShare: prizes[0] / total,
    msPerMeeting: result.ms / result.rounds,
    engines: [...new Set(result.meetings.map((m) => m.official))],
  };
}

const totals = { legacy: [], causal: [] };
for (let g = 0; g < games; g += 1) {
  for (const engine of ["legacy", "causal"]) totals[engine].push(summarise(play(engine, g)));
}
const avg = (list, key) => list.reduce((a, s) => a + s[key], 0) / list.length;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const rows = [
  ["meetings resolved", (l) => avg(l, "meetings").toFixed(1)],
  ["runners per meeting", (l) => avg(l, "runners").toFixed(1)],
  ["best horse by value wins", (l) => pct(avg(l, "favWin"))],
  ["winner among top 3 by value", (l) => pct(avg(l, "top3Win"))],
  ["outsider wins (bottom half)", (l) => pct(avg(l, "outsider"))],
  ["value vs placing (Spearman)", (l) => avg(l, "rho").toFixed(3)],
  ["going fit vs placing (Spearman)", (l) => avg(l, "fitRho").toFixed(3)],
  ["best going fit wins", (l) => pct(avg(l, "fitFav"))],
  ["richest stable's prize share", (l) => pct(avg(l, "topStableShare"))],
  ["ms per meeting", (l) => avg(l, "msPerMeeting").toFixed(1)],
];
console.log(`${games} games × ${seasons} seasons, same seeds on both engines\n`);
console.log("metric".padEnd(32) + "legacy".padStart(10) + "causal".padStart(10));
for (const [label, fn] of rows) console.log(label.padEnd(32) + String(fn(totals.legacy)).padStart(10) + String(fn(totals.causal)).padStart(10));
const used = new Set(totals.causal.flatMap((s) => s.engines));
console.log(`\ncausal games decided by: ${[...used].join(", ")}`);
