/**
 * Studbook causal race engine (F4) — the race is simulated, not scripted.
 *
 * Position, speed, energy and lane are integrated on a fixed logical clock; the finish line
 * decides the result. Orders (player or bot) arrive as timestamped inputs and are judged by
 * the same rules for everyone. The same params + field + seed + inputs always produce the
 * same final hash, on the server and in any browser:
 *
 *  - fixed tick (TICK_HZ), never the client's frame rate
 *  - only IEEE-754 basic operations (+ − × ÷, sqrt, min/max, floor): no Math.exp/pow/sin,
 *    whose last bits differ between JS engines
 *  - a seeded 32-bit PRNG; Math.random is never read
 *  - no dependence on the order of the input array: runners are processed by a total order
 *    (distance, then a hash of the runner key), and ties at the line are dead heats
 *
 * Pure ES module with no imports: the server will run it authoritatively and the 3D
 * client may run it for prediction/replay. It is not yet wired into the live game.
 */

export const ENGINE_VERSION = "race-causal/1";

/** F4-01: every tunable number lives here, frozen and versioned. Units: m, s, m/s, m/s². */
export const PARAMS_V1 = Object.freeze({
  version: "params/1",
  tickHz: 20,
  laneWidth: 1.2, // m
  bodyLength: 2.6, // m nose to tail, used for spacing
  bendRadius: 100, // m, inner rail
  maxSeconds: 400, // safety stop
  topSpeedBase: 15.0, // m/s with speed trait 0
  topSpeedGain: 4.0, // extra m/s at speed trait 12
  accelBase: 2.2, // m/s² with accel trait 0
  accelGain: 3.2,
  decel: 3.5,
  // Critical-speed model. Stamina sets the AEROBIC speed a horse can hold for free; speed sets
  // its top speed and its anaerobic RESERVE, measured in metres it can run above aerobic pace.
  // Above aerobic pace the reserve (0–1) drains at excess × (1 + convexity × excess) ÷ capacity
  // per second: going too fast early empties it and leaves the horse crawling, going too slow
  // leaves reserve unspent at the line. The right pace depends on distance, horse and ground.
  reserveBase: 200, // m of anaerobic work with speed trait 0
  reserveGain: 200, // extra m at speed trait 12
  convexity: 0.25, // per m/s: makes even pacing cheaper than surges
  // A spent horse fades toward a floor just under its aerobic speed (not toward a share of its
  // own top speed): this is what lets stamina beat speed over a distance.
  aerobicBase: 13.2, // m/s with stamina 0
  aerobicGain: 1.6, // extra m/s at stamina 12
  recoverBelow: 0.85, // share of the aerobic speed under which the reserve refills (barely, in a race)
  recoverBase: 0.002, // per second while easing below that
  recoverGain: 0.004,
  fadeBelow: 0.25, // reserve under which top speed fades toward the exhausted floor
  exhaustedFactor: 0.8, // an empty horse drops BELOW its aerobic speed: overspending has a price
  // Sitting in behind another horse (same lane, 1–4 lengths back) saves energy: the reason to
  // ride a waiting race and the reason the rail is crowded.
  draftLengths: 4,
  draftSaving: 0.2,
  // pace: where the order sits between the horse's aerobic speed (0) and its fresh top speed (1).
  orders: Object.freeze({
    hold: Object.freeze({ pace: 0.2, drain: 1.0, cooldown: 1.0 }),
    push: Object.freeze({ pace: 0.6, drain: 1.0, cooldown: 1.0 }),
    kick: Object.freeze({ pace: 1.0, drain: 1.0, cooldown: 4.0, minEnergy: 0.12 }),
  }),
  laneChangeCooldown: 1.0, // s
  lateralSpeed: 1.0, // lanes per second
  boxedFightDrain: 0.05, // energy/s lost by a hot-headed horse stuck behind another
  startDelayMax: 0.6, // s, gate break spread for temperament 0
  stumbleRate: 0.0008, // per second for soundness 0 on firm
  stumbleSpeedLoss: 0.18,
  goings: Object.freeze({
    firm: Object.freeze({ speed: 1.0, drain: 0.95, risk: 1.0 }),
    good: Object.freeze({ speed: 0.985, drain: 1.0, risk: 1.0 }),
    soft: Object.freeze({ speed: 0.955, drain: 1.12, risk: 1.4 }),
    heavy: Object.freeze({ speed: 0.92, drain: 1.25, risk: 1.8 }),
  }),
  snapshotEvery: 5, // ticks between replay frames (4 per second)
});

const TRAIT_MAX = 12;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);


/* ------------------------------------------------------------------ hashing and randomness */

/** FNV-1a 32-bit over a string. Two differently-seeded passes give a 64-bit digest. */
function fnv1a(text, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
export function digest(text) {
  const a = fnv1a(text).toString(16).padStart(8, "0");
  const b = fnv1a(text, 0x01234567 ^ text.length).toString(16).padStart(8, "0");
  return a + b;
}

/** sfc32: small, fast, deterministic across engines (Math.imul / >>> only). */
export function createRng(seedHex) {
  if (typeof seedHex !== "string" || !/^[0-9a-f]{32}$/.test(seedHex)) throw new Error("race seed must be 128-bit hex");
  let a = parseInt(seedHex.slice(0, 8), 16) >>> 0;
  let b = parseInt(seedHex.slice(8, 16), 16) >>> 0;
  let c = parseInt(seedHex.slice(16, 24), 16) >>> 0;
  let d = parseInt(seedHex.slice(24, 32), 16) >>> 0;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i += 1) next(); // discard warm-up
  return next;
}

/* ------------------------------------------------------------------ setup */

/**
 * @param {object} spec
 *  - distance: metres (800–4000)
 *  - going: firm|good|soft|heavy
 *  - lanes: number of lanes (≥ runners)
 *  - bends: [[fromMetre, toMetre], …] sections where outer lanes travel further
 *  - runners: [{ key, traits: {speed, stamina, accel, recovery, temperament, soundness} (0–12) }]
 *  - seed: 128-bit hex (server-derived, see server/race-seed.mjs)
 */
export function createRace(spec, params = PARAMS_V1) {
  const { distance, going = "good", runners, seed } = spec;
  if (!Number.isFinite(distance) || distance < 800 || distance > 4000) throw new Error("distance must be 800–4000 m");
  if (!params.goings[going]) throw new Error(`unknown going ${going}`);
  if (!Array.isArray(runners) || runners.length < 2 || runners.length > 16) throw new Error("2–16 runners");
  const keys = new Set();
  for (const r of runners) {
    if (typeof r.key !== "string" || !r.key || keys.has(r.key)) throw new Error("runner keys must be unique strings");
    keys.add(r.key);
  }
  const lanes = Math.max(spec.lanes ?? runners.length, runners.length);
  const bends = (spec.bends ?? []).map(([a, b]) => [Number(a), Number(b)]).filter(([a, b]) => b > a);
  const rng = createRng(seed);
  // Canonical runner order: by key hash, so the caller's array order never matters.
  const ordered = [...runners].sort((x, y) => rank(x.key) - rank(y.key) || (x.key < y.key ? -1 : 1));
  // The draw (gate) is seeded: a Fisher–Yates over the canonical order.
  const gates = ordered.map((_, i) => i);
  for (let i = gates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [gates[i], gates[j]] = [gates[j], gates[i]];
  }
  const tick = 1 / params.tickHz;
  const state = ordered.map((r, i) => {
    const t = {};
    for (const name of ["speed", "stamina", "accel", "recovery", "temperament", "soundness"]) t[name] = clamp01(Number(r.traits?.[name] ?? 0) / TRAIT_MAX);
    const delayTicks = Math.floor((rng() * params.startDelayMax * (1 - 0.8 * t.temperament)) / tick);
    return {
      key: r.key, order: rank(r.key), t,
      top: params.topSpeedBase + params.topSpeedGain * t.speed,
      accel: params.accelBase + params.accelGain * t.accel,
      reserve: params.reserveBase + params.reserveGain * t.speed,
      aerobic: params.aerobicBase + params.aerobicGain * t.stamina,
      x: 0, v: 0, energy: 1, lane: gates[i], targetLane: gates[i], gate: gates[i],
      startTick: delayTicks, tactic: "push", cooldownUntil: 0, laneCooldownUntil: 0,
      boxedTicks: 0, stumbles: 0, finishTime: null, kicks: 0,
    };
  });
  return {
    engine: ENGINE_VERSION, params, distance, going, lanes, bends, rng, tick,
    ticks: 0, runners: state, frames: [], log: [], finished: false,
  };
}

function rank(key) {
  return fnv1a(`runner:${key}`);
}

/* ------------------------------------------------------------------ orders */

const ORDER_TYPES = new Set(["hold", "push", "kick", "out", "in"]);

/** Applies one order at the current tick. Returns { ok, reason }. Never throws on bad input. */
function applyOrder(race, runner, type) {
  const now = race.ticks * race.tick;
  if (!ORDER_TYPES.has(type)) return { ok: false, reason: "unknown" };
  if (runner.finishTime !== null) return { ok: false, reason: "finished" };
  if (type === "out" || type === "in") {
    if (now < runner.laneCooldownUntil) return { ok: false, reason: "cooldown" };
    const target = runner.targetLane + (type === "out" ? 1 : -1);
    if (target < 0 || target >= race.lanes) return { ok: false, reason: "rail" };
    if (!laneClear(race, runner, target)) return { ok: false, reason: "blocked" };
    runner.targetLane = target;
    runner.laneCooldownUntil = now + race.params.laneChangeCooldown;
    return { ok: true };
  }
  if (now < runner.cooldownUntil) return { ok: false, reason: "cooldown" };
  const order = race.params.orders[type];
  if (type === "kick" && runner.energy < order.minEnergy) return { ok: false, reason: "empty" };
  runner.tactic = type;
  runner.cooldownUntil = now + order.cooldown;
  if (type === "kick") runner.kicks += 1;
  return { ok: true };
}

/** A lane is clear when no runner overlaps the mover's length there (half a length of air). */
function laneClear(race, runner, lane) {
  const gap = race.params.bodyLength + 0.5;
  for (const other of race.runners) {
    if (other === runner || other.finishTime !== null) continue;
    if (Math.abs(other.lane - lane) < 0.85 && Math.abs(other.x - runner.x) < gap) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ physics */

function onBend(race, x) {
  for (const [a, b] of race.bends) if (x >= a && x < b) return true;
  return false;
}

function step(race) {
  const p = race.params;
  const dt = race.tick;
  const g = p.goings[race.going];
  const prev = new Map(race.runners.map((r) => [r, { x: r.x, v: r.v }]));
  // Who is sheltered this tick, decided from the previous positions only (order-independent).
  const drafting = new Set();
  for (const r of race.runners) {
    if (r.finishTime !== null) continue;
    for (const other of race.runners) {
      if (other === r || other.finishTime !== null || Math.abs(other.lane - r.lane) >= 0.85) continue;
      const gap = other.x - r.x;
      if (gap >= p.bodyLength - 1e-9 && gap <= p.bodyLength * p.draftLengths) { drafting.add(r); break; }
    }
  }

  // 1. each runner's unconstrained move, from its own previous state only
  for (const r of race.runners) {
    if (r.finishTime !== null) continue;
    if (race.ticks < r.startTick) continue;
    const order = p.orders[r.tactic];
    const fade = r.energy >= p.fadeBelow ? 1 : r.energy / p.fadeBelow;
    const softPenalty = 1 - (1 - g.speed) * (1 - 0.5 * r.t.soundness);
    const fresh = r.top * softPenalty;
    const aerobic = Math.min(fresh, r.aerobic * softPenalty);
    const floor = aerobic * p.exhaustedFactor;
    const top = floor + (fresh - floor) * fade;
    // An order is a point between the aerobic speed (0) and the fresh top speed (1), so it means
    // the same for every horse; a spent horse can only reach what its reserve allows.
    const target = Math.min(top, aerobic + (fresh - aerobic) * order.pace);
    const dv = target - r.v;
    r.v += dv > 0 ? Math.min(dv, r.accel * dt) : Math.max(dv, -p.decel * dt);
    if (r.tactic === "kick" && r.energy < p.orders.kick.minEnergy) r.tactic = "push"; // the tank is empty

    const excess = r.v > aerobic ? r.v - aerobic : 0;
    const effort = excess * (1 + p.convexity * excess);
    const shelter = drafting.has(r) ? 1 - p.draftSaving : 1;
    r.energy -= (effort * order.drain * g.drain * shelter / r.reserve) * dt;
    if (r.v < aerobic * p.recoverBelow) r.energy += (p.recoverBase + p.recoverGain * r.t.recovery) * dt;
    r.energy = clamp01(r.energy);

    if (race.rng() < p.stumbleRate * g.risk * (1 - r.t.soundness) * dt) {
      r.v *= 1 - p.stumbleSpeedLoss;
      r.stumbles += 1;
      race.log.push({ tick: race.ticks, key: r.key, event: "stumble" });
    }

    // lateral drift toward the chosen lane
    const dl = r.targetLane - r.lane;
    const lat = p.lateralSpeed * dt;
    r.lane = Math.abs(dl) <= lat ? r.targetLane : r.lane + (dl > 0 ? lat : -lat);

    // on a bend, an outer lane covers more ground for the same forward progress
    const travel = r.v * dt;
    r.x += onBend(race, r.x) ? travel * (p.bendRadius / (p.bendRadius + r.lane * p.laneWidth)) : travel;
  }

  // 2. no runner passes through another: resolve from the front, by a total order
  const live = race.runners.filter((r) => r.finishTime === null);
  live.sort((a, b) => b.x - a.x || a.order - b.order);
  for (let i = 0; i < live.length; i += 1) {
    const r = live[i];
    for (let j = 0; j < i; j += 1) {
      const ahead = live[j];
      if (Math.abs(ahead.lane - r.lane) >= 0.85) continue;
      const limit = ahead.x - p.bodyLength;
      const wasBehind = prev.get(r).x <= prev.get(ahead).x;
      if (wasBehind && r.x > limit) {
        r.x = Math.max(prev.get(r).x, limit);
        if (r.v > ahead.v) r.v = ahead.v;
        r.boxedTicks += 1;
        r.energy = clamp01(r.energy - p.boxedFightDrain * (1 - r.t.temperament) * dt);
      }
    }
  }

  // 3. the line: exact crossing time interpolated inside the tick
  race.ticks += 1;
  for (const r of race.runners) {
    if (r.finishTime !== null || r.x < race.distance) continue;
    const from = prev.get(r).x;
    const fraction = r.x > from ? (race.distance - from) / (r.x - from) : 1;
    r.finishTime = (race.ticks - 1 + fraction) * dt;
  }

  if (race.ticks % p.snapshotEvery === 0) race.frames.push(frame(race));
  if (race.runners.every((r) => r.finishTime !== null) || race.ticks * dt >= p.maxSeconds) race.finished = true;
}

function frame(race) {
  return { t: race.ticks, r: race.runners.map((r) => [r.key, r.x, r.lane, r.v, r.energy]) };
}

/* ------------------------------------------------------------------ running */

/**
 * Runs the race. `inputs` are [{ tick, key, order }]; `policies` maps runner key → bot
 * function(view) returning an order or null, asked every `botEvery` ticks.
 */
export function runRace(spec, { inputs = [], policies = {}, botEvery = 4, params = PARAMS_V1 } = {}) {
  const race = createRace(spec, params);
  const byKey = new Map(race.runners.map((r) => [r.key, r]));
  // Canonical input order: tick, runner rank, order name — never the array order.
  const queue = inputs
    .filter((i) => Number.isInteger(i?.tick) && i.tick >= 0 && byKey.has(i.key))
    .map((i) => ({ tick: i.tick, key: i.key, order: String(i.order) }))
    .sort((a, b) => a.tick - b.tick || byKey.get(a.key).order - byKey.get(b.key).order || (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  const receipts = [];
  let q = 0;
  while (!race.finished) {
    const seen = new Set();
    while (q < queue.length && queue[q].tick <= race.ticks) {
      const input = queue[q++];
      const runner = byKey.get(input.key);
      // one order per runner per tick; late or duplicate orders are receipted, not applied
      if (seen.has(runner.key) || input.tick < race.ticks) { receipts.push({ ...input, ok: false, reason: seen.has(runner.key) ? "duplicate" : "late" }); continue; }
      seen.add(runner.key);
      receipts.push({ ...input, ...applyOrder(race, runner, input.order) });
    }
    if (race.ticks % botEvery === 0) {
      for (const runner of race.runners) {
        const policy = policies[runner.key];
        if (!policy || seen.has(runner.key) || runner.finishTime !== null) continue;
        const order = policy(botView(race, runner));
        if (order) receipts.push({ tick: race.ticks, key: runner.key, order, bot: true, ...applyOrder(race, runner, order) });
      }
    }
    step(race);
  }
  return result(race, receipts);
}

/** What a bot may know: its own state and what a jockey can see, never other horses' traits. */
function botView(race, runner) {
  const ahead = race.runners
    .filter((o) => o !== runner && o.finishTime === null && o.x > runner.x)
    .map((o) => ({ gap: o.x - runner.x, lane: o.lane, v: o.v }));
  return {
    tick: race.ticks, distance: race.distance, remaining: race.distance - runner.x,
    x: runner.x, v: runner.v, top: runner.top, energy: runner.energy, lane: runner.lane, targetLane: runner.targetLane,
    lanes: race.lanes, tactic: runner.tactic, position: 1 + ahead.length, ahead,
    canOut: runner.targetLane + 1 < race.lanes && laneClear(race, runner, runner.targetLane + 1),
    canIn: runner.targetLane > 0 && laneClear(race, runner, runner.targetLane - 1),
    noise: race.rng(), // seeded: policies vary between races but replay exactly
  };
}

function result(race, receipts) {
  // Finish order by crossing time; equal times are a dead heat sharing a position.
  const finishers = race.runners.filter((r) => r.finishTime !== null);
  finishers.sort((a, b) => a.finishTime - b.finishTime || a.order - b.order);
  const placings = [];
  let position = 0;
  finishers.forEach((r, i) => {
    if (i === 0 || r.finishTime !== finishers[i - 1].finishTime) position = i + 1;
    placings.push({ key: r.key, position, time: r.finishTime, gate: r.gate, energyLeft: r.energy, boxedSeconds: r.boxedTicks * race.tick, stumbles: r.stumbles, kicks: r.kicks });
  });
  const dnf = race.runners.filter((r) => r.finishTime === null).map((r) => r.key).sort();
  const canonical = JSON.stringify({ e: ENGINE_VERSION, p: race.params.version, d: race.distance, g: race.going, placings, dnf, ticks: race.ticks });
  return {
    engine: ENGINE_VERSION, params: race.params.version, distance: race.distance, going: race.going,
    placings, dnf, deadHeat: placings.some((p, i) => i > 0 && p.position === placings[i - 1].position),
    ticks: race.ticks, frames: race.frames, events: race.log, receipts, hash: digest(canonical),
  };
}

/* ------------------------------------------------------------------ bots (F4-04) */

/** Front-runner: goes early, tries to keep the rail, holds when it has a lead to protect. */
export function frontRunner(view) {
  if (view.tick === 0) return "push";
  const share = view.remaining / view.distance;
  if (view.targetLane > 0 && view.canIn) return "in";
  if (view.position === 1 && view.energy < share + 0.15 && view.tactic !== "hold") return "hold";
  if (share < 0.15 && view.energy > 0.2 && view.tactic !== "kick") return "kick";
  return null;
}

/** Closer: settles, saves energy, swings wide for room and kicks late. */
export function closer(view) {
  const share = view.remaining / view.distance;
  if (view.tick === 0) return "hold";
  const blocked = view.ahead.some((a) => a.gap < 6 && Math.abs(a.lane - view.lane) < 0.85);
  if (share < 0.3 && blocked && view.canOut) return "out";
  const kickAt = 0.16 + 0.06 * view.noise; // seeded variation: not every closer goes at one metre mark
  if (share < kickAt && view.energy > 0.15 && view.tactic !== "kick") return "kick";
  if (share < 0.4 && view.tactic === "hold") return "push";
  return null;
}

/** Stalker: sits handy behind the pace, finds a gap and commits mid-straight. */
export function stalker(view) {
  const share = view.remaining / view.distance;
  if (view.tick === 0) return "push";
  const blocked = view.ahead.some((a) => a.gap < 5 && Math.abs(a.lane - view.lane) < 0.85);
  if (blocked && share < 0.5) return view.canOut ? "out" : view.canIn ? "in" : null;
  if (view.position <= 2 && share > 0.3 && view.tactic !== "hold") return "hold";
  if (share < 0.25 + 0.05 * view.noise && view.energy > 0.2 && view.tactic !== "kick") return "kick";
  if (view.position > 3 && share > 0.3 && view.tactic === "hold") return "push";
  return null;
}

export const BOTS = Object.freeze({ frontRunner, closer, stalker });
