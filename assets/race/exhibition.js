/**
 * Exhibition race: the declared field of the next meeting, run through the causal engine.
 *
 * It does NOT decide results, money or records. Official meetings are resolved by assets/engine.js,
 * which uses the causal engine only in rooms switched to it (F0-02, assets/race/official.js).
 * It reads the state (where the genotypes live) and returns only what a spectator may see:
 * names, stables, coat colours and the simulated positions. Traits never leave this function.
 */
import { horseById, traitsOf, RACE_AGE, CONDITION_LABELS } from "../engine.js";
import { appearanceFor } from "../phenotype.js";
import { runRace, BOTS, ENGINE_VERSION, RACE_PARAMS } from "./causal.js";
import { bendsFor } from "./track.js";
import { COURSE_FOR, STYLE_FOR } from "./official.js";

export { COURSE_FOR } from "./official.js"; // one course table for exhibitions and official results

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

/** Orders a rider may give, and how many one ride may carry (a race is a few hundred ticks). */
export const RIDE_ORDERS = Object.freeze(["hold", "push", "kick", "out", "in"]);
export const RIDE_MAX_INPUTS = 120;

/**
 * Everything needed to run (and re-run) one exhibition: the field as it stood, with its traits.
 * This object holds traits, so it stays where the state lives (the server's memory, or the
 * offline browser that already owns the save); only runExhibition's answer goes to a screen.
 *
 * @param state  full game state (server room or offline save)
 * @param seed   128-bit hex, drawn fresh by the caller for every exhibition
 * @param mine   optional stable id whose runners the caller may ride (defaults to player stables)
 * @returns null when fewer than two runners are declared
 */
export function prepareExhibition(state, { seed, mine = null }) {
  const field = declaredField(state);
  if (field.length < 2) return null;
  const condition = COURSE_FOR[state.condition] ? state.condition : "classic";
  const { distance, going } = COURSE_FOR[condition];
  const runners = [];
  const styles = {};
  const cards = [];
  field.slice(0, 16).forEach(({ horse, stable }, index) => {
    const key = `r${index + 1}`; // anonymous key: no horse id, no hint of the genotype
    runners.push({ key, traits: traitsOf(horse.genome) });
    const tactic = (stable.tactics && stable.tactics[horse.id]) || "steady";
    styles[key] = STYLE_FOR[tactic] ?? "stalker";
    const look = appearanceFor(horse);
    cards.push({
      key,
      number: index + 1,
      name: horse.name,
      stable: stable.name,
      mine: mine ? stable.id === mine : Boolean(stable.player),
      tactic,
      coat: look.bodyColor,
      mane: look.maneColor,
      coatName: look.labelPt,
    });
  });
  return {
    condition,
    label: CONDITION_LABELS[condition] ?? condition,
    spec: { distance, going, lanes: Math.max(8, runners.length + 2), bends: bendsFor(distance), seed, runners },
    styles,
    cards,
  };
}

/** A rider's orders, cleaned: known orders, whole ticks, in range, capped. Never throws. */
export function cleanRide(prep, ride) {
  if (!ride || typeof ride.key !== "string") return null;
  const card = prep.cards.find((row) => row.key === ride.key);
  if (!card || !card.mine) return null;
  const inputs = (Array.isArray(ride.inputs) ? ride.inputs : [])
    .filter((row) => row && Number.isInteger(row.tick) && row.tick >= 0 && row.tick < 20000 && RIDE_ORDERS.includes(row.order))
    .slice(0, RIDE_MAX_INPUTS)
    .map((row) => ({ tick: row.tick, key: ride.key, order: row.order }));
  return { key: ride.key, inputs };
}

/**
 * Run a prepared exhibition. With `ride`, the caller's own runner takes the rider's orders:
 * its stable's style rides it until the first order, and from that tick the rider alone does.
 * The race is deterministic, so running again with one more order replays everything before
 * that order exactly and changes only what follows it.
 */
export function runExhibition(prep, { ride = null } = {}) {
  const rider = cleanRide(prep, ride);
  const policies = {};
  for (const [key, style] of Object.entries(prep.styles)) policies[key] = BOTS[style];
  let inputs = [];
  if (rider) {
    inputs = rider.inputs;
    const handover = inputs.length ? Math.min(...inputs.map((row) => row.tick)) : Infinity;
    const auto = policies[rider.key];
    policies[rider.key] = (view) => (view.tick >= handover ? null : auto(view));
  }
  const result = runRace(prep.spec, { policies, inputs, params: RACE_PARAMS });
  const out = {
    kind: "exhibition",
    engine: ENGINE_VERSION,
    params: RACE_PARAMS.version,
    condition: prep.condition,
    label: prep.label,
    distance: prep.spec.distance,
    going: prep.spec.going,
    tickHz: RACE_PARAMS.tickHz,
    snapshotEvery: RACE_PARAMS.snapshotEvery,
    runners: prep.cards,
    // positions only; the ridden horse alone also carries its energy, which its rider would feel
    frames: result.frames.map((frame) => ({
      t: frame.t,
      r: frame.r.map(([key, x, lane, , energy]) => (rider && key === rider.key ? [key, round2(x), round2(lane), round2(energy)] : [key, round2(x), round2(lane)])),
    })),
    placings: result.placings.map((p) => ({ key: p.key, position: p.position, time: round2(p.time) })),
    deadHeat: result.deadHeat,
    hash: result.hash,
  };
  if (rider) {
    out.ride = {
      key: rider.key,
      // what became of each order: taken, or refused and why (cooldown, empty, blocked, rail)
      receipts: result.receipts.filter((row) => row.key === rider.key && !row.bot).map((row) => ({ tick: row.tick, order: row.order, ok: row.ok, reason: row.reason ?? null })),
      cooldowns: { hold: RACE_PARAMS.orders.hold.cooldown, push: RACE_PARAMS.orders.push.cooldown, kick: RACE_PARAMS.orders.kick.cooldown, lane: RACE_PARAMS.laneChangeCooldown },
      kickMinEnergy: RACE_PARAMS.orders.kick.minEnergy,
    };
  }
  return out;
}

/** One exhibition, watched: prepare and run. */
export function exhibitionRace(state, { seed }) {
  const prep = prepareExhibition(state, { seed });
  return prep ? runExhibition(prep) : null;
}

const round2 = (n) => Math.round(n * 100) / 100;
