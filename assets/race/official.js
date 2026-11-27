/**
 * Official results from the causal engine (F0-02).
 *
 * When a room's `raceEngine` is "causal", assets/engine.js asks this module for the finishing
 * order instead of scoring the field itself. The race is run by assets/race/causal.js from each
 * horse's genetic traits and its stable's riding instruction, on the meeting's course, with a
 * seed drawn from the room's own random stream. The seed, the engine and params versions and
 * the result hash are kept with the result, so the very race that decided the money can be
 * replayed frame for frame later.
 *
 * Pure module: no DOM, no game-engine import (the game engine imports this).
 */
import { runRace, BOTS, ENGINE_VERSION, RACE_PARAMS } from "./causal.js";
import { bendsFor } from "./track.js";

/** Each going as a racecourse: distance and ground. */
export const COURSE_FOR = Object.freeze({
  sprint: { distance: 1200, going: "firm" },
  flying: { distance: 1000, going: "good" },
  mile: { distance: 1600, going: "good" },
  classic: { distance: 2000, going: "good" },
  yielding: { distance: 2200, going: "soft" },
  heavy: { distance: 2000, going: "heavy" },
  staying: { distance: 2800, going: "good" },
});

/** A stable's instruction becomes a riding style. */
export const STYLE_FOR = Object.freeze({ push: "frontRunner", steady: "stalker", hold: "closer" });

/** The causal engine runs 2 to 16 runners; outside that the legacy scoring decides. */
export const MIN_RUNNERS = 2;
export const MAX_RUNNERS = 16;

/** Seconds per length at racing pace (a length is ~2.4 m at ~16 m/s). */
export const SECONDS_PER_LENGTH = 0.15;

/** Four draws from the room's stream as a 128-bit hex seed. */
export function seedFrom(draw) {
  let hex = "";
  for (let i = 0; i < 4; i += 1) hex += (Math.floor(draw() * 4294967296) >>> 0).toString(16).padStart(8, "0");
  return hex;
}

/**
 * @param {object} o
 *  - runners: [{ id, traits: {speed, stamina, accel, recovery, temperament, soundness}, tactic }]
 *  - condition: the meeting's going key (sprint, mile, …)
 *  - seed: 128-bit hex
 * @returns {{ order: string[], times: Record<string, number|null>, dnf: string[], record: object }}
 */
export function officialRace({ runners, condition, seed, params = RACE_PARAMS }) {
  if (!Array.isArray(runners) || runners.length < MIN_RUNNERS || runners.length > MAX_RUNNERS) {
    throw new Error(`the causal engine runs ${MIN_RUNNERS}–${MAX_RUNNERS} runners`);
  }
  const course = COURSE_FOR[condition] ?? COURSE_FOR.classic;
  // keys are anonymous and stable: by horse id, so the caller's order never matters
  const sorted = [...runners].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const keyOf = new Map(sorted.map((runner, index) => [runner.id, `r${index + 1}`]));
  const idOf = new Map(sorted.map((runner) => [keyOf.get(runner.id), runner.id]));
  const policies = {};
  for (const runner of sorted) policies[keyOf.get(runner.id)] = BOTS[STYLE_FOR[runner.tactic] ?? "stalker"];
  const result = runRace(
    {
      distance: course.distance,
      going: course.going,
      lanes: Math.max(8, sorted.length + 2),
      bends: bendsFor(course.distance),
      seed,
      runners: sorted.map((runner) => ({ key: keyOf.get(runner.id), traits: runner.traits })),
    },
    { policies, params },
  );
  const times = {};
  for (const runner of sorted) times[runner.id] = null;
  for (const placing of result.placings) times[idOf.get(placing.key)] = placing.time;
  // what happened to each runner, as the race itself counted it: the facts a loss is explained by
  const stats = {};
  for (const placing of result.placings) {
    stats[idOf.get(placing.key)] = {
      energyLeft: placing.energyLeft,
      boxedSeconds: placing.boxedSeconds,
      stumbles: placing.stumbles,
      kicks: placing.kicks,
    };
  }
  return {
    order: result.placings.map((placing) => idOf.get(placing.key)),
    times,
    stats,
    dnf: result.dnf.map((key) => idOf.get(key)),
    record: {
      engine: ENGINE_VERSION,
      params: params.version,
      seed,
      hash: result.hash,
      distance: course.distance,
      going: course.going,
      deadHeat: result.deadHeat,
    },
  };
}
