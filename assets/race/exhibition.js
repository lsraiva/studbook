/**
 * Exhibition race: the declared field of the next meeting, run through the causal engine.
 *
 * It does NOT decide results, money or records — official meetings are still resolved by
 * assets/engine.js until the league/live format decision (F0-02) wires the causal engine in.
 * It reads the state (where the genotypes live) and returns only what a spectator may see:
 * names, stables, coat colours and the simulated positions. Traits never leave this function.
 */
import { horseById, traitsOf, RACE_AGE, CONDITION_LABELS } from "../engine.js";
import { appearanceFor } from "../phenotype.js";
import { runRace, BOTS, ENGINE_VERSION, PARAMS_V1 } from "./causal.js";
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

/** A rival's declared instruction becomes a riding style. */
const STYLE_FOR = { push: "frontRunner", steady: "stalker", hold: "closer" };

/** The field exactly as the paddock declares it: up to three entries per stable. */
export function declaredField(state) {
  const field = [];
  for (const stable of state.stables ?? []) {
    for (const horseId of (stable.entries ?? []).slice(0, 3)) {
      const horse = horseById(state, horseId);
      if (!horse || horse.retired || horse.age < RACE_AGE) continue;
      field.push({ horse, stable });
    }
  }
  return field;
}

/**
 * @param state  full game state (server room or offline save)
 * @param seed   128-bit hex, drawn fresh by the caller for every exhibition
 * @returns null when fewer than two runners are declared
 */
export function exhibitionRace(state, { seed }) {
  const field = declaredField(state);
  if (field.length < 2) return null;
  const condition = COURSE_FOR[state.condition] ? state.condition : "classic";
  const { distance, going } = COURSE_FOR[condition];
  const runners = [];
  const policies = {};
  const cards = [];
  field.slice(0, 16).forEach(({ horse, stable }, index) => {
    const key = `r${index + 1}`; // anonymous key: no horse id, no hint of the genotype
    runners.push({ key, traits: traitsOf(horse.genome) });
    const tactic = (stable.tactics && stable.tactics[horse.id]) || "steady";
    policies[key] = BOTS[STYLE_FOR[tactic] ?? "stalker"];
    const look = appearanceFor(horse);
    cards.push({
      key,
      number: index + 1,
      name: horse.name,
      stable: stable.name,
      mine: Boolean(stable.player),
      tactic,
      coat: look.bodyColor,
      mane: look.maneColor,
      coatName: look.labelPt,
    });
  });
  const result = runRace({ distance, going, lanes: Math.max(8, runners.length + 2), bends: bendsFor(distance), seed, runners }, { policies });
  return {
    kind: "exhibition",
    engine: ENGINE_VERSION,
    params: PARAMS_V1.version,
    condition,
    label: CONDITION_LABELS[condition] ?? condition,
    distance,
    going,
    tickHz: PARAMS_V1.tickHz,
    snapshotEvery: PARAMS_V1.snapshotEvery,
    runners: cards,
    frames: result.frames.map((frame) => ({ t: frame.t, r: frame.r.map(([key, x, lane]) => [key, round2(x), round2(lane)]) })),
    placings: result.placings.map((p) => ({ key: p.key, position: p.position, time: round2(p.time) })),
    deadHeat: result.deadHeat,
    hash: result.hash,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
