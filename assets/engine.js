// Studbook engine — pure rules over a plain state object. No DOM, no transport.
// Everything here is deterministic: a seed plus a list of actions reproduces a season.

/**
 * STUDBOOK — the game. A bloodstock sim: genotype-driven breeding, a stallion
 * market, seasonal racing, ageing and upkeep.
 *
 * The genetics here are the SAME model the 20-generation study validated
 * (horse-genetics/breed-sim.py): 12 loci, two per trait, allele values 0-3, per
 * locus dominance alternating between complete (carriers hidden — which is what a
 * certification is worth) and additive, and eight founder lineages tilting their
 * allele frequencies toward one specialty trait.
 *
 * Settings are the ones the robustness pass supported, not guesses:
 *   * stallion cap of 5 straws per season AND a career limit, tuned as a PAIR
 *     (together they retained 44.9% of genetic variance; either alone ~20%);
 *   * inbreeding penalty of 1.0 on F — the only lever that held the stakes class
 *     down (89.4% vs 100%) and pushed saturation to generation 16;
 *   * RELATIVE stakes classes (top 3% of the current population each season),
 *     because against a fixed bar every configuration saturated;
 *   * hybrid vigour at 10%, kept as a behavioural incentive rather than a balance
 *     lever (across seeds it was inside the noise);
 *   * upkeep that scales superlinearly with talent, so quality carries a
 *     recurring cost it cannot recover by being scarce.
 *
 * Contract (enforced by `bun run check:logic`): six exports, no imports, no
 * timers, no Date.now(), no Math.random(), pure, JSON-serializable state.
 */

const meta = { game: "Studbook", minPlayers: 1, maxPlayers: 4 };

/** Coin packs and testing grants exist to balance a run, not to earn. Off in a real build. */
const TEST_TOOLS = false;

// ── genetics constants (mirrored from the study) ──────────────────────────
const TRAITS = ["speed", "stamina", "accel", "recovery", "temperament", "soundness"];
const LOCI = [];
for (const trait of TRAITS) for (const index of [0, 1]) LOCI.push(`${trait}${index}`);
const DOMINANCE = {};
LOCI.forEach((locus, index) => {
  DOMINANCE[locus] = [0.0, 0.5, 1.0][index % 3];
});
const BASE_FREQ = [0.42, 0.33, 0.2, 0.05];
const SPECIALTY_FREQ = [0.12, 0.23, 0.35, 0.3];
const LINEAGES = [
  { id: "L1", specialty: "speed", name: "Thunder" },
  { id: "L2", specialty: "stamina", name: "Oxbow" },
  { id: "L3", specialty: "accel", name: "Flicker" },
  { id: "L4", specialty: "recovery", name: "Tidewell" },
  { id: "L5", specialty: "temperament", name: "Quiet" },
  { id: "L6", specialty: "soundness", name: "Granite" },
  { id: "L7", specialty: "speed", name: "Comet" },
  { id: "L8", specialty: "stamina", name: "Marathon" },
];
const CONDITIONS = {
  sprint: { speed: 0.35, accel: 0.3, recovery: 0.15, temperament: 0.1, stamina: 0.05, soundness: 0.05 },
  classic: { speed: 0.2, stamina: 0.2, accel: 0.15, recovery: 0.2, temperament: 0.1, soundness: 0.15 },
  staying: { stamina: 0.35, recovery: 0.25, speed: 0.1, accel: 0.05, temperament: 0.1, soundness: 0.15 },
  // A flying start is won by a horse that can go fast AND keep its head: temperament is
  // the second weight here, where every other going gives it a flat tenth and it can
  // never be what separates one card from another.
  flying: { speed: 0.4, accel: 0.25, temperament: 0.2, recovery: 0.1, stamina: 0.03, soundness: 0.02 },
  // Heavy ground is the reverse: speed is nearly worthless and the tough horse wins, so
  // soundness becomes a co-star rather than a footnote.
  heavy: { stamina: 0.3, soundness: 0.25, temperament: 0.2, recovery: 0.15, speed: 0.07, accel: 0.03 },
  mile: { speed: 0.25, stamina: 0.2, accel: 0.2, recovery: 0.2, temperament: 0.1, soundness: 0.05 },
  yielding: { stamina: 0.25, soundness: 0.2, recovery: 0.2, temperament: 0.15, speed: 0.1, accel: 0.1 },
};
/**
 * The rotation. A season is three meetings, so the LENGTH here has to be coprime with
 * three: five goings step three per season and no season ever runs the same card as the
 * one before, while a list of six would hand back an identical season every second year.
 */
const CONDITION_ORDER = ["sprint", "classic", "staying", "flying", "heavy", "mile", "yielding"];
/** How each going is said. 'A flying rewards...' is not English; 'a flying start' is. */
const CONDITION_LABELS = {
  sprint: "a sprint",
  classic: "a classic",
  staying: "a staying race",
  flying: "a flying start",
  heavy: "heavy ground",
  mile: "a mile",
  yielding: "yielding ground",
};
/**
 * One line of prose per going, kept OUT of CONDITIONS: that table is read as pure numbers
 * when horses are scored, and a word in it would poison the arithmetic. The numbers this
 * describes are always published live beside it, so the claim and the weights are read
 * together rather than taken on trust.
 */
const CONDITION_CHARACTER = {
  sprint: "a fast horse with a sharp turn of foot",
  classic: "a well-rounded horse with no obvious hole in it",
  staying: "a stayer that can grind out the last furlong",
  flying: "a fast horse with a cool head",
  heavy: "a tough, sound horse that handles bad ground",
  mile: "the horse that can do both: speed and a finish",
  yielding: "a sound mover with a turn of foot on dead ground",
};
/**
 * One line of breeding and buying advice per card. Editorial, and deliberately separate
 * from the numbers: the page prints the weights beside it and derives the rest, so this
 * is the opinion, not the arithmetic.
 */
const CONDITION_STRATEGY = {
  sprint: "Breed for a turn of foot rather than stamina. A stayer here is a passenger.",
  classic: "A horse with no hole in it beats a specialist. Read all six traits before you buy.",
  staying: "Buy the bottomless horse: stamina and recovery first, speed last.",
  flying: "A cool head is worth as much as raw speed. Temperament is this card's second weight.",
  heavy: "Soundness first on this ground. A fast, fragile horse wastes the entry fee.",
  mile: "The most complete card of the seven. A hole in any trait shows here.",
  yielding: "Between a classic and heavy ground: stamina with a finishing kick.",
};

// ── game constants ────────────────────────────────────────────────────────
const SERVICES_PER_SEASON = 5; // the cap the study found matters, with careers
/**
 * How many coverings a stable can keep in the barn.
 *
 * The surplus was never the service cap's fault. Five services a season is a ceiling on
 * how far one stallion's blood spreads, which the study found matters, and it is left
 * alone. The glut came from retention: every covering ever issued stayed in the barn
 * forever, uncosted and never spoiling, so a herd with four mares piled up 264 of them
 * in 25 seasons. A finite barn is the honest constraint - a stud farm has freezer space.
 */
const STRAW_STORAGE = 22;
/**
 * How many of a barn's excess coverings reach the market each season. The rest are
 * culled: the design already learned that flooding the catalogue leaves hundreds of
 * lots unsold, and a valve that over-supplies is not a valve.
 */
const STRAW_MARKET_PER_TURN = 3;
const MARE_CAREER_FOALS = 8;
const STALLION_MAX_AGE = 10;
const MARE_MAX_AGE = 12;
const RACE_AGE = 2;
/**
 * The instruction a stable gives a runner. It is a real decision: pushing rewards
 * early traits in a race that rewards them and punishes it in one that does not,
 * holding does the reverse. Nobody is forced to choose — steady is the default.
 */
const TACTICS = ["push", "steady", "hold"];
/**
 * Calibrated by measurement, not taste. At 0.6 an instruction moved the score by
 * 0.02-0.2 while race-day noise ran to 0.36, so twelve seasons entered with the right
 * instruction and twelve with none produced identical results: the decision was
 * decoration. The gain now outweighs the noise it competes with.
 */
const TACTIC_GAIN = 1.5;
/** How often the house misreads its own horse. A rival that never errs is a toll. */
const AI_TACTIC_ERROR = 0.3;
const REPLAY_CHECKPOINTS = 6;
const INBREED_VALUE_PENALTY = 1.0;
const INBREED_FERTILITY = 0.9;
const BASE_LIVE_RATE = 0.92;
const VIGOUR = 0.1;
const STAKES_SHARE = 0.03; // relative, recomputed every season
const UPKEEP_BASE = 5;
// Softened so a mid-tier stable of eight can actually feed itself. The curve is
// still superlinear — an elite horse costs roughly twice a plodder — which is the
// anti-inflation job upkeep is meant to do.
const UPKEEP_TALENT = 1.1;
const UPKEEP_EXPONENT = 1.55;
// A 100-fee entry with a thin pot was a poverty trap: a stable that could not
// afford the fee could not earn, so it never recovered. A small fee and a real
// subsidy make racing the income engine it is meant to be.
/**
 * Per meeting. A season is three of them, so 15 three times is the 40 a season used to
 * cost to run: more chances to race without racing becoming a tax on having horses.
 */
const ENTRY_FEE = 15;
/**
 * A season is three meetings. The house's top-up is per meeting, and 1.0 three times is
 * the 3.0 a season used to pay in one go: more chances to earn, the same money in play.
 */
const MEETINGS_PER_SEASON = 4; // a season is four meetings: three ordinary and a final
/**
 * The house tops the pot up, per meeting. Three meetings mean three entry fees a season
 * where one used to be, so the subsidy keeps the house's share of the season's racing
 * the size it always was: 1.7 per meeting is 1 + 2/3, which leaves the house adding the
 * same money over three meetings that 3.0 added over one. At 1.0 racing stopped paying
 * and the simulation answered with five forced sales.
 */
const PURSE_SUBSIDY = 1.2;
/**
 * The clock on the entries. A player opens it deliberately rather than every meeting
 * carrying a timer, because a meeting that runs itself while a stable is away would race
 * horses nobody instructed. The room owns the clock; these are the bounds it clamps to.
 */
const WINDOW_SECONDS = 90;
const WINDOW_MIN_SECONDS = 10;
const WINDOW_MAX_SECONDS = 300;
/**
 * The onboarding covering, sold by the protocol once per stable. Priced from measurement:
 * coverings on the open market run from about 28, the fair-fee band I modelled is 10-63,
 * and the free tier earns roughly 80 coins a season, so this is affordable inside one good
 * season and obviously worth it against what a foal then sells for.
 */
const STARTER_COVERING_PRICE = 20;
/** A price is a number a person typed. Above this it is not a price any more. */
const MAX_PRICE = 100000;
/**
 * Coin packs. Amounts only: what they cost in real money is the store's business, and the
 * rules have no business pretending to know a currency. A chain adapter settles the payment
 * outside this file and hands the room the amount to credit.
 */
const COIN_PACKS = [
  { pack: "handful", coins: 500 },
  { pack: "bag", coins: 2500 },
  { pack: "chest", coins: 10000 },
];
const PURSE_SPLIT = [0.45, 0.25, 0.18, 0.12]; // four places, as real meetings pay
const FOAL_UPKEEP = 0.25; // board for a foal
const PENSION_UPKEEP = 0.3; // board for a retired horse
const HOUSE_HORSE_FLOOR = 0.5; // the house always takes a horse at half appraisal
const MARKET_RAKE = 0.05;
const CERTIFY_COST = 60;
/** The tack room: three consumables with one job each. */
const ITEMS = {
  catalogue: { name: "Sales catalogue", price: 45, blurb: "Read one horse's traits without paying the certifier." },
  feed: { name: "Conditioning feed", price: 90, blurb: "One trait, one step. Once per horse." },
  pass: { name: "Meeting pass", price: 60, blurb: "No entry fees for the rest of this meeting." },
};
/** What it costs to bring a yearling on. */
const PREP_COST = 140;
const START_BANK = 2000;
/**
 * Testing funds. Not part of the tuned economy and never earned — a button for
 * replaying the early game without grinding back to it. Every use is logged, so
 * it can never hide inside a real balance.
 */
const TEST_GRANT = 10000;
/** The starting banks a testing run may choose between: standard, testing, big. */
const BIG_GRANT = 50000;
const BANK_CHOICES = [START_BANK, TEST_GRANT, BIG_GRANT];
/**
 * Breeding care: what goes into a covering before a foal exists. A real decision
 * with a real price — better care catches more often and lifts the foal's value,
 * and the money is spent whether or not a foal arrives.
 */
const CARE_CHOICES = ["plain", "prepared", "studcare"];
const CARE_COST = { plain: 0, prepared: 150, studcare: 450 };
const CARE_CATCH = { plain: 0, prepared: 0.06, studcare: 0.14 };
const CARE_VALUE = { plain: 0, prepared: 0.03, studcare: 0.08 };
/** One season between the covering and the foal, so the payoff is waited for. */
const GESTATION_SEASONS = 1;
/**
 * The breeder's premium, paid when a foal is registered. A real thing in bloodstock,
 * and here it is the compensation for the wait: a covering no longer pays out the
 * season it is made, so the season it does pay out in pays a little more.
 */
/** A foal IS the reward now: paying coin for it as well minted money twice. */
const BREEDER_PREMIUM = 0;
/**
 * What can go wrong or wonderfully right between the covering and the foal. Rolled
 * ONCE, at the covering, so the flag is visible for the whole wait: the tension is
 * in knowing, not only in the surprise. Rates are per covering.
 */
const GESTATION_FATES = [
  { fate: "twins", rate: 0.03, note: "The vet thinks she is carrying twins — a nervous wait." },
  { fate: "scare", rate: 0.07, note: "She had a scare at the stud. The foal may lose some condition." },
  { fate: "strong", rate: 0.03, note: "The vet likes what he sees — this one is developing well." },
  { fate: "slipped", rate: 0.02, note: "Something does not look right. Next season will tell." },
];
/** What each fate does to a foal's vigour, which is where value is won and lost. */
const FATE_VIGOUR = { twins: -0.08, scare: -0.12, strong: 0.13 };
const START_HORSES = 4;
const HOUSE_DRAFT = 3; // the ring's opening lot count, offered by the house itself
const AI_STABLES = 3;
const AI_STIPEND = 280; // house money that keeps rival stables solvent and buying
const AI_ACTIVE_CAP = 10; // cap on rivals' horses IN TRAINING, not total
const AI_TREASURY_CAP = 3000; // a rival that hoards stops being a counterparty
const WANT_LIMIT = 3; // standing requests a stable may hold open
const WANT_TTL = 3; // seasons before an unfilled request lapses
const WANT_MIN_QUALITY = 0.6; // a sire must be at least this share of your best
const DUTCH_DECAY = 0.75; // stale lots mark down each season until they clear
const DUTCH_FLOOR = 20;
const LOG_MAX = 12;
const NOISE = 0.09;
/** One length, in score points. Racing is read in lengths, not in decimals. */
const LENGTH = 0.25;
/** The traits, said the way a breeder says them. */
const TRAIT_WORD = {
  speed: "speed",
  stamina: "stamina",
  accel: "a turn of foot",
  recovery: "recovery",
  temperament: "a level head",
  soundness: "soundness",
}; // race-day variance, as a share of the horse's score

const PREFIXES = ["Ash", "Bel", "Cor", "Dun", "El", "Fen", "Gar", "Hol", "Ire", "Jar", "Kel", "Lorn", "Mor", "Nair", "Or", "Pell", "Quill", "Rav", "Sil", "Tarn"];
const SUFFIXES = ["field", "mont", "brook", "stone", "ridge", "vale", "ford", "moor", "gate", "crest", "mere", "bay"];

// ── deterministic helpers ─────────────────────────────────────────────────
function copy(state) {
  return JSON.parse(JSON.stringify(state));
}

function nextRandom(seed) {
  const a = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { state: a >>> 0, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

function seedFrom(text) {
  const value = String(text ?? "anon");
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function round(value, places = 2) {
  const factor = Math.pow(10, places);
  return Math.round((Number(value) || 0) * factor) / factor;
}

/** Advance the PRNG and return an integer in [0, max). */
function rollInt(state, max) {
  const step = nextRandom(state.rng);
  state.rng = step.state;
  return Math.min(max - 1, Math.floor(step.value * max));
}

function rollGestationFate(state) {
  const roll = rollValue(state);
  let acc = 0;
  for (const entry of GESTATION_FATES) {
    acc += entry.rate;
    if (roll < acc) return entry;
  }
  return null;
}

function fateNote(fate) {
  const entry = GESTATION_FATES.find((row) => row.fate === fate);
  return entry ? entry.note : null;
}

function rollValue(state) {
  const step = nextRandom(state.rng);
  state.rng = step.state;
  return step.value;
}

function sampleAllele(state, freqs) {
  const pull = rollValue(state);
  let acc = 0;
  for (let value = 0; value < freqs.length; value++) {
    acc += freqs[value];
    if (pull <= acc) return value;
  }
  return freqs.length - 1;
}

function alleleFrequencies(lineageId) {
  const lineage = LINEAGES.find((entry) => entry.id === lineageId) ?? LINEAGES[0];
  const table = {};
  for (const locus of LOCI) {
    table[locus] = locus.startsWith(lineage.specialty) ? SPECIALTY_FREQ : BASE_FREQ;
  }
  return table;
}

const FREQ_CACHE = {};
for (const lineage of LINEAGES) FREQ_CACHE[lineage.id] = alleleFrequencies(lineage.id);

function horseName(state, lineageId) {
  const lineage = LINEAGES.find((entry) => entry.id === lineageId) ?? LINEAGES[0];
  const prefix = PREFIXES[rollInt(state, PREFIXES.length)];
  const suffix = SUFFIXES[rollInt(state, SUFFIXES.length)];
  return `${prefix}${suffix} (${lineage.id})`;
}

// ── phenotype maths ───────────────────────────────────────────────────────
function expressed(genome, locus) {
  const pair = genome[locus] ?? [0, 0];
  const hi = Math.max(pair[0], pair[1]);
  const lo = Math.min(pair[0], pair[1]);
  const delta = DOMINANCE[locus];
  return ((hi + delta * lo) * 2) / (1 + delta);
}

function traitValue(genome, trait) {
  return expressed(genome, `${trait}0`) + expressed(genome, `${trait}1`);
}

function traitsOf(genome) {
  const out = {};
  for (const trait of TRAITS) out[trait] = round(traitValue(genome, trait), 2);
  return out;
}

/** Best-fitting performance across the three conditions: specialists survive. */
function conditionScores(genome) {
  const out = {};
  for (const [condition, weights] of Object.entries(CONDITIONS)) {
    let total = 0;
    for (const [trait, weight] of Object.entries(weights)) total += weight * traitValue(genome, trait);
    out[condition] = total;
  }
  return out;
}

function geneticValue(genome) {
  const scores = conditionScores(genome);
  return Math.max(...Object.values(scores));
}

function heterozygosity(genome) {
  let count = 0;
  for (const locus of LOCI) {
    const pair = genome[locus];
    if (pair && pair[0] !== pair[1]) count += 1;
  }
  return count / LOCI.length;
}

function vigourFor(sire, dam) {
  return sire.lineage === dam.lineage ? 0 : VIGOUR;
}

/**
 * Recompute every horse's derived numbers for the current population: genetic
 * value, inbreeding (as homozygosity excess, as in the study), realised value
 * with the inbreeding penalty and vigour, and the RELATIVE stakes class.
 */
function scorePopulation(state) {
  const frequencies = {};
  for (const locus of LOCI) {
    const counts = [0, 0, 0, 0];
    for (const horse of state.horses) {
      counts[horse.genome[locus][0]] += 1;
      counts[horse.genome[locus][1]] += 1;
    }
    const total = counts.reduce((sum, value) => sum + value, 0) || 1;
    frequencies[locus] = counts.map((value) => value / total);
  }
  let expectedHeterozygosity = 0;
  for (const locus of LOCI) {
    let sumSquares = 0;
    for (const p of frequencies[locus]) sumSquares += p * p;
    expectedHeterozygosity += 1 - sumSquares;
  }
  expectedHeterozygosity /= LOCI.length;

  for (const horse of state.horses) {
    horse.genetic = round(geneticValue(horse.genome), 3);
    const observed = heterozygosity(horse.genome);
    horse.f = expectedHeterozygosity > 0 ? round(Math.max(0, Math.min(1, 1 - observed / expectedHeterozygosity)), 4) : 0;
    const vigour = horse.vigour ?? 0;
    horse.value = round(
      horse.genetic * (1 - INBREED_VALUE_PENALTY * horse.f) * (1 + vigour) * (1 + (CARE_VALUE[horse.care] ?? 0)),
      3,
    );
    horse.conditions = conditionScores(horse.genome);
    horse.upkeep = upkeepFor(horse);
  }

  const wasStakes = new Map(state.horses.map((horse) => [horse.id, Boolean(horse.stakes)]));
  const ranked = [...state.horses].filter((h) => inPlay(h)).sort((a, b) => b.value - a.value);
  const eliteCount = Math.max(1, Math.round(ranked.length * STAKES_SHARE));
  for (const horse of state.horses) horse.stakes = false;
  for (const horse of ranked.slice(0, eliteCount)) horse.stakes = true;
  state.eliteCut = ranked.length ? ranked[Math.min(eliteCount, ranked.length - 1)].value : 0;
  for (const horse of state.horses) {
    if (horse.stakes && !wasStakes.get(horse.id)) recordLuck(state, "stakes class", STAKES_SHARE, true, horse.name);
  }
}

function upkeepFor(horse) {
  const talent = Math.pow(Math.max(horse.genetic, 0), UPKEEP_EXPONENT);
  const full = UPKEEP_BASE + UPKEEP_TALENT * talent;
  // Only horses in training eat like racehorses. Charging full board on the whole
  // herd is what turned the first playtest into a death spiral: breeding costs
  // nothing, so the herd grew while every foal was billed as a racer forever.
  if (horse.age < 1) return Math.round(full * FOAL_UPKEEP);
  // A soulbound horse can never be sold, so a pension it cannot escape would be a debt
  // trap: the starter mare costs nothing once she is finished.
  if (horse.retired && horse.soulbound) return 0;
  if (horse.retired) return Math.round(full * PENSION_UPKEEP);
  return Math.round(full);
}

/**
 * The select sale: a house's best stallion goes up at a price that still means
 * something. An ordinary covering tops out around 150 GNS, which a stable holding
 * thousands stops noticing, so money had nowhere to go late. This is where money
 * still buys blood, which is the premise the stud market was built on.
 */
function selectPrice(horse) {
  return Math.round(suggestedStrawPrice(horse) * 3 + 400);
}

/** A stallion has to be genuinely good before the house puts it up this way. */
const SELECT_FLOOR = 6.5;
/**
 * What an elite covering is worth on top of its sire: a measured, modest edge. The
 * isolation run showed a select lot bought no quality at all on its own, because a
 * good stable's own blood soon matches anything the market can offer. A purchase that
 * costs thousands and changes nothing is a trap, so this is what the premium buys.
 */
const SELECT_VIGOUR = 0.06;

function suggestedStrawPrice(horse) {
  const base = 60 + Math.pow(Math.max(horse.genetic - 3, 0), 2.1) * 1.4;
  const stakesBonus = horse.stakes ? 1.35 : 1;
  const record = 1 + Math.min(horse.stakesWins, 6) * 0.08;
  const age = 1 - Math.min(Math.max(horse.age - 2, 0), 10) * 0.02;
  return Math.max(20, Math.round(base * stakesBonus * record * age));
}

function suggestedHorsePrice(horse) {
  return Math.max(25, Math.round(Math.pow(Math.max(horse.value, 1), 2.4) * 1.5));
}

/**
 * Reference points. A number means nothing on its own, so every screen that shows a
 * value also shows where the field sits: what is average, what the elite cut is, how
 * many horses are stakes class.
 */
/** A lot's seller in words: the house is not a stable and should not read as "unknown". */
function sellerName(state, id) {
  if (id === "house") return "the house";
  return state.stables.find((entry) => entry.id === id)?.name ?? "unknown";
}

function fieldStats(state) {
  const population = state.horses.filter((horse) => inPlay(horse));
  const values = population.map((horse) => horse.value);
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return {
    horses: population.length,
    mean: round(mean, 2),
    best: values.length ? round(Math.max(...values), 2) : 0,
    eliteCut: round(state.eliteCut ?? 0, 2),
    stakesCount: population.filter((horse) => horse.stakes).length,
  };
}

function valueBand(horse, field) {
  if (horse.stakes) return "stakes";
  if (field.eliteCut && horse.value >= field.eliteCut * 0.85) return "near elite";
  if (horse.value >= field.mean) return "above the field";
  return "below the field";
}

/** Inbreeding in words, because "F 0.284" teaches a player nothing. */
function inbreedingLabel(f) {
  if (f < 0.05) return "clean";
  if (f < 0.12) return "slightly related";
  if (f < 0.22) return "related";
  return "close-bred";
}

/**
 * Which trait actually cost a race: the largest weighted shortfall against the
 * winner, so the conditions teach themselves instead of being guessed at.
 */
function raceDiagnosis(mine, theirs, condition) {
  const weights = CONDITIONS[condition];
  let worst = null;
  for (const trait of TRAITS) {
    const weight = weights[trait] ?? 0;
    if (weight <= 0) continue;
    const shortfall =
      weight * (traitValue(theirs.genome, trait) - traitValue(mine.genome, trait));
    if (!worst || shortfall > worst.shortfall) worst = { trait, shortfall };
  }
  return worst && worst.shortfall > 0.15 ? worst.trait : "race-day variance";
}

/** One line telling the player the most useful next thing, from the state itself. */
/** Every roll that decides money goes on the record: odds and outcome, side by side. */
function recordLuck(state, kind, odds, hit, detail = "") {
  state.luck = [
    { kind, odds: round(odds, 2), hit: Boolean(hit), detail, season: state.season },
    ...(state.luck ?? []),
  ].slice(0, 8);
}

/** A margin in lengths, the way a race is called. */
function inLengths(delta) {
  const n = Math.max(0, Number(delta) || 0) / LENGTH;
  if (n < 0.12) return "a nose";
  if (n < 0.37) return "a neck";
  if (n < 0.62) return "half a length";
  if (n < 0.87) return "three quarters of a length";
  const whole = Math.round(n);
  return `${whole} length${whole === 1 ? "" : "s"}`;
}

/** What this horse is, in one line — the screen's answer to six decimals. */
function verdictFor(horse, field) {
  const traits = traitsOf(horse.genome);
  const ranked = Object.entries(traits).sort((a, b) => b[1] - a[1]);
  const best = TRAIT_WORD[ranked[0][0]] ?? ranked[0][0];
  const worst = TRAIT_WORD[ranked[ranked.length - 1][0]] ?? ranked[ranked.length - 1][0];
  const band = valueBand(horse, field);
  const stage = horse.age <= 1 ? "yearling" : horse.age >= 9 ? "veteran" : "racehorse";
  if (ranked[0][1] - ranked[ranked.length - 1][1] > 5) return `${stage} with ${best}, short of ${worst} · ${band}`;
  return `${stage}, no hole in it · ${band}`;
}

/** The single next thing to do, with the action that does it. */
function nextStepFor(state, stable, field) {
  if (!stable) return { key: "seat", text: "Take a seat to open a stable.", action: null };
  const herd = (stable.horses ?? []).map((id) => horseById(state, id)).filter((horse) => inPlay(horse));
  const straws = stable.straws ?? [];
  const inFoal = new Set((state.foaling ?? []).map((row) => row.mareId));
  const mares = herd.filter((horse) => horse.sex === "F" && horse.foals < MARE_CAREER_FOALS && !inFoal.has(horse.id));

  if (!straws.length && !stable.starterOfferTaken) {
    return {
      key: "covering",
      text: "Start here: take the first covering. Twenty guineas, once per stable, and the cheapest you will ever buy.",
      action: { type: "takeStarterOffer" },
    };
  }
  if (straws.length && mares.length && !stable.selectedStraw) {
    const sire = straws[0].sire ? horseById(state, straws[0].sire) : null;
    return {
      key: "select",
      text: `Pick the covering you mean to use — ${sire ? sire.name : "the straw in the barn"}.`,
      action: { type: "selectStraw", strawId: straws[0].id },
    };
  }
  if (straws.length && mares.length && stable.selectedStraw) {
    return {
      key: "breed",
      text: `Cover ${mares[0].name} with it. The straw is spent, the foal arrives when the season turns, and that foal is the first horse you may sell.`,
      action: { type: "breed", mareId: mares[0].id, strawId: stable.selectedStraw, care: "plain" },
    };
  }
  const runners = herd.filter((horse) => horse.age >= RACE_AGE).slice(0, 3);
  if (!stable.entries.length && runners.length) {
    return {
      key: "enter",
      text: "Enter up to three runners — the meeting pays the yard, and upkeep is charged when the season turns.",
      action: { type: "enter", horseIds: runners.map((horse) => horse.id) },
    };
  }
  if (stable.entries.length) {
    return {
      key: "run",
      text: `Run meeting ${state.meeting ?? 1} of ${MEETINGS_PER_SEASON}. A season is four, and the purse funds the yard.`,
      action: { type: "advance" },
    };
  }
  return { key: "buy", text: "Buy a horse from the market, or breed one.", action: null };
}

function adviceFor(state, stable, field) {
  if (!stable) return "Take a seat to open a stable.";
  if ((stable.straws ?? []).length >= STRAW_STORAGE) {
    return `Your barn is full: ${stable.straws.length} of ${STRAW_STORAGE} coverings. Sell or use some before the season turns — the oldest then leave for the market at the floor, and elite coverings are never the ones dropped.`;
  }
  const herd = stable.horses
    .map((id) => horseById(state, id))
    .filter((horse) => inPlay(horse));
  const mares = herd.filter(
    (horse) => horse.sex === "F" && horse.foals < MARE_CAREER_FOALS,
  );
  const meanF = herd.length
    ? herd.reduce((sum, horse) => sum + horse.f, 0) / herd.length
    : 0;
  if (!stable.entries.length && herd.some((horse) => horse.age >= RACE_AGE)) {
    return "Enter up to three runners, then run the meeting.";
  }
  if (herd.length > 8) {
    const bill = herd.reduce((sum, horse) => sum + horse.upkeep, 0);
    return `Upkeep is ${bill} GNS a season for ${herd.length} horses. Consign or sell one you are not racing.`;
  }
  if (meanF > 0.18) {
    return `Your herd is ${inbreedingLabel(meanF)} (F ${round(meanF, 3)}). Buy a covering from another lineage, or post a request and let rivals answer.`;
  }
  if (mares.length && !stable.straws.length) {
    return "Your mares are due and you hold no coverings. Buy one from the catalogue, or post a request.";
  }
  if (!herd.length) return "Buy a horse from the catalogue, or breed one.";
  return "Run the meeting when your runners are entered — a season is three of them.";
}

/**
 * What an instruction does to one horse in one condition. Returns the score shift
 * and a shape: positive means the horse shows up early and can be reeled in,
 * negative means it comes late. Both are pure functions of traits and condition.
 */
function paceProfile(horse, condition, tactic) {
  const weights = CONDITIONS[condition];
  const mean = (a, b) => (traitValue(horse.genome, a) + traitValue(horse.genome, b)) / 2;
  const earlyTraits = mean("speed", "accel");
  const lateTraits = mean("stamina", "recovery");
  const earlyWeight = (weights.speed ?? 0) + (weights.accel ?? 0);
  const lateWeight = (weights.stamina ?? 0) + (weights.recovery ?? 0);
  const lean =
    earlyWeight + lateWeight > 0 ? (earlyWeight - lateWeight) / (earlyWeight + lateWeight) : 0;
  let shift = 0;
  if (tactic === "push") {
    // 0.4 + 0.6*lean: a matched instruction is fully rewarded and a mismatched one
    // turns negative, so pushing early in a staying race costs the horse something.
    shift = TACTIC_GAIN * ((earlyTraits - 6) / 6) * (0.4 + 0.6 * lean);
  } else if (tactic === "hold") {
    shift = TACTIC_GAIN * ((lateTraits - 6) / 6) * (0.4 - 0.6 * lean);
  }
  const bias = tactic === "push" ? 0.3 : tactic === "hold" ? -0.3 : 0;
  const shape = Math.max(-0.6, Math.min(0.6, (earlyTraits - lateTraits) / 24 + bias));
  return { shift, shape };
}

/** Plain words for what a going rewards, derived from its own weights. */
function conditionNote(condition) {
  const weights = CONDITIONS[condition];
  const ranked = TRAITS.filter((trait) => (weights[trait] ?? 0) > 0).sort(
    (a, b) => (weights[b] ?? 0) - (weights[a] ?? 0),
  );
  if (ranked.length < 2) return `A ${condition} meeting.`;
  const top = ranked.slice(0, 2);
  const weak = ranked[ranked.length - 1];
  const label = CONDITION_LABELS[condition] ?? condition;
  const said = label.charAt(0).toUpperCase() + label.slice(1);
  return `${said} rewards ${top.join(" and ")}; it punishes a horse short of ${weak}.`;
}

/** The value line each tier sits on, read off the living field. */
function tierLines(state) {
  const ranked = state.horses
    .filter((horse) => inPlay(horse))
    .sort((a, b) => b.value - a.value)
    .map((horse) => horse.value);
  const at = (share) =>
    ranked[Math.min(ranked.length - 1, Math.max(0, Math.ceil(ranked.length * share) - 1))] ?? 0;
  return [
    { name: "promising", value: round(at(0.5), 3) },
    { name: "excellent", value: round(at(0.2), 3) },
    { name: "exceptional", value: round(at(0.05), 3) },
    { name: "stakes class", value: round(at(STAKES_SHARE), 3) },
  ];
}

/**
 * What to tell the player about the foal they just bred. Every line is read off
 * the state — where the foal really sits in the field, and how far it really fell
 * short of the next tier — so the moment is a read, not a decoration.
 */
function foalReport(state, foal, dam, sire, care, fate) {
  const field = fieldStats(state);
  const lines = tierLines(state);
  const beaten = lines.filter((line) => foal.value >= line.value).length;
  const next = lines[beaten] ?? null;
  const ranked = state.horses.filter((horse) => inPlay(horse)).sort((a, b) => b.value - a.value);
  return {
    event: "born",
    id: foal.id,
    name: foal.name,
    sex: foal.sex,
    bornSeason: foal.bornSeason,
    damId: dam.id,
    damName: dam.name,
    sireId: sire.id,
    sireName: sire.name,
    care,
    fate: fate || null,
    fateNote: fateNote(fate),
    fateVigour: FATE_VIGOUR[fate] ?? 0,
    value: foal.value,
    f: foal.f,
    fLabel: inbreedingLabel(foal.f),
    band: valueBand(foal, field),
    damValue: dam.value,
    improvement: round(foal.value - dam.value, 3),
    tier: beaten ? lines[beaten - 1].name : "ordinary",
    nextTier: next ? next.name : null,
    nearMiss: next ? round(next.value - foal.value, 3) : null,
    stakes: Boolean(foal.stakes),
    place: ranked.findIndex((horse) => horse.id === foal.id) + 1,
    field: ranked.length,
    traits: traitsOf(foal.genome),
    stableId: foal.owner,
  };
}

function log(state, text, kind = "market") {
  state.log = [{ season: state.season, text, kind }, ...state.log].slice(0, LOG_MAX);
}

// ── horse and stable construction ─────────────────────────────────────────
function makeFounder(state, lineageId, sex, age) {
  const freqs = FREQ_CACHE[lineageId];
  const genome = {};
  for (const locus of LOCI) {
    genome[locus] = [sampleAllele(state, freqs[locus]), sampleAllele(state, freqs[locus])];
  }
  return makeHorse(state, genome, lineageId, sex, age, 0);
}

function makeHorse(state, genome, lineageId, sex, age, bornSeason, vigour = 0, sire = null, dam = null) {
  const id = `h${state.nextId++}`;
  return {
    id,
    name: horseName(state, lineageId),
    sex,
    lineage: lineageId,
    genome,
    age,
    bornSeason,
    vigour,
    sire,
    dam,
    retired: false,
    starts: 0,
    wins: 0,
    places: 0,
    best: null,
    stakesWins: 0,
    earnings: 0,
    foals: 0,
    strawsThisSeason: 0,
    certifiedBy: [],
    owner: null,
  };
}

function freshStable(state, stableId, name, playerId) {
  return {
    id: stableId,
    name,
    player: playerId,
    guineas: START_BANK,
    horses: [],
    straws: [],
    entries: [],
    selectedStraw: null,
    tactics: {},
    bestFoalValue: 0,
    foalsBred: [],
    starterOfferTaken: false,
    forcedSales: 0,
    seasonOpen: null,
    seasonReport: null,
    // The firsts. A yard is mostly told what it IS - bank, horses, values - and rarely what it
    // HAS DONE for the first time. These are written once and never overwritten.
    firsts: { win: null, place: null, foal: null, stakes: null, sold: null },
    /** What this yard has done since the season opened: the four things a season asks for. */
    tally: { wins: 0, bred: 0, sold: 0 },
  };
}

function giveStartingStock(state, stable, withStud = true) {
  // The free tier is ONE mare. Everything else a stable ever races or sells comes from a
  // covering it bought and a foal it bred, so the first season is about the single horse
  // and the market rather than about the four rivals who came free with the yard.
  const count = withStud ? START_HORSES : 1;
  for (let i = 0; i < count; i++) {
    const lineage = LINEAGES[rollInt(state, LINEAGES.length)].id;
    // A player's yard is mares only, deliberately: in bloodstock a covering is bought, so
    // the free tier must not arrive with a stallion who hands out five of them a season.
    // A rival keeps its stallions - they are where the stud market's supply comes from,
    // and there has to be something worth buying.
    const sex = withStud && i >= 2 ? "M" : "F";
    const horse = makeFounder(state, lineage, sex, 3 + rollInt(state, 3));
    horse.owner = stable.id;
    state.horses.push(horse);
    stable.horses.push(horse.id);
    if (sex === "M") {
      for (let s = 0; s < SERVICES_PER_SEASON; s += 1) {
        stable.straws.push({ id: `s${state.nextStraw++}`, sire: horse.id, vintage: state.season });
      }
    }
  }
  if (!withStud) return;
  // one extra mare so breeding is possible from turn one without trading
  const mare = makeFounder(state, LINEAGES[rollInt(state, LINEAGES.length)].id, "F", 4);
  mare.owner = stable.id;
  state.horses.push(mare);
  stable.horses.push(mare.id);
}

// ── setup ─────────────────────────────────────────────────────────────────
function setup(players, salt = null) {
  // A seed per game, recorded on the state: a run is reproducible from it, and two
  // new games are never the same board.
  const seed = seedFrom(`${players.join("|")}|${salt ?? `${Date.now()}|${Math.random()}`}`);
  const state = {
    seed,
    rng: seed,
    season: 1,
    nextId: 1,
    nextStraw: 1,
    stables: [],
    horses: [],
    listings: [],
    wants: [],
    log: [],
    ledger: [],
    lastRace: null,
    condition: CONDITION_ORDER[0],
    eliteCut: 0,
    owner: players[0] ?? null,
    players: [...players],
    unowned: [],
    gone: [],
    foaling: [],
    meeting: 1,
    clock: null,
  };

  players.forEach((playerId, index) => {
    const stable = freshStable(state, `st${index + 1}`, index === 0 ? "Your stable" : `Stable ${index + 1}`, playerId);
    state.stables.push(stable);
    giveStartingStock(state, stable, false);
    const firstMare = stable.horses
      .map((id) => horseById(state, id))
      .find((horse) => horse && horse.sex === "F");
    if (firstMare) firstMare.soulbound = true;
  });
  for (let i = 0; i < AI_STABLES; i++) {
    const stable = freshStable(state, `ai${i + 1}`, ["Ashgrove", "Ravensmoor", "Tarnfield"][i] ?? `Rival ${i + 1}`, null);
    state.stables.push(stable);
    giveStartingStock(state, stable);
  }
  // Score BEFORE anything prices a lot. Listings created from unscored horses had
  // NaN prices, which JSON stores as null — and null read as a free covering.
  scorePopulation(state);
  for (const stable of state.stables) {
    if (stable.id.startsWith("ai")) aiListStraws(state, stable);
  }
  // A market the player cannot buy from is a wall, not a door. The ring opens with a draft
  // of the house's own YOUNGSTOCK, scored before it is priced. Yearlings cannot race at all,
  // which is the point: filling the ring must not quietly change who competes. Measured with
  // racing-age stock: the player's wins halved (23 to 13 over five seeds) and mean bank fell
  // from 3,971 to 2,337 - a real cost with no mechanism I could point at, so it is out.
  const draft = [];
  for (let i = 0; i < HOUSE_DRAFT; i += 1) {
    const horse = makeFounder(
      state,
      LINEAGES[rollInt(state, LINEAGES.length)].id,
      i % 2 === 0 ? "F" : "M",
      rollInt(state, 2),
    );
    horse.owner = null;
    state.horses.push(horse);
    draft.push(horse.id);
  }
  scorePopulation(state);
  for (const id of draft) {
    const horse = horseById(state, id);
    horse.listed = true;
    const price = Math.max(25, Math.round(suggestedHorsePrice(horse) * 1.1));
    state.listings.push({
      id: `l${state.nextId++}`,
      kind: "horse",
      seller: "house",
      horseId: horse.id,
      price,
      season: state.season,
    });
    log(state, `The house offers ${horse.name} at ${price} GNS.`, "market");
  }
  // Every stable records where it stood before the first meeting runs. Without this the first
  // turn measured the yard against itself and its report came out as a row of zeros.
  for (const stable of state.stables) stable.seasonOpen = snapshotSeason(stable, state);
  // Meeting one needs a field as well, or the first race of the game is run against strangers.
  for (const stable of state.stables) {
    if (stable.id.startsWith("ai")) aiEnterMeeting(state, stable);
  }
  setCondition(state);
  log(state, "Season 1 opens. Sales catalogues are live.", "season");
  return state;
}

function stableOf(state, playerId) {
  return state.stables.find((stable) => stable.player === playerId) ?? null;
}

/** Conditioning: one allele of one trait goes up a step. Capped, so no horse is made. */
function boostTrait(horse, trait) {
  const loci = [`${trait}0`, `${trait}1`];
  const weakest = loci.sort((a, b) => horse.genome[a][0] + horse.genome[a][1] - (horse.genome[b][0] + horse.genome[b][1]))[0];
  const pair = horse.genome[weakest];
  const side = pair[0] <= pair[1] ? 0 : 1;
  if (pair[side] >= 3) return false;
  pair[side] += 1;
  return true;
}

/** Every stable, by prize money: the table a stud book is judged on. */
function rankingOf(state) {
  return state.stables
    .map((stable) => {
      const horses = (stable.horses ?? []).map((id) => horseById(state, id)).filter(Boolean);
      const prizes = horses.reduce((sum, horse) => sum + (horse.earnings ?? 0), 0);
      const wins = horses.reduce((sum, horse) => sum + (horse.wins ?? 0), 0);
      const best = horses.reduce((top, horse) => Math.max(top, horse.value ?? 0), 0);
      return {
        id: stable.id,
        name: stable.name,
        prizes: Math.round(prizes),
        wins,
        horses: horses.length,
        best: round(best, 2),
        rival: stable.id.startsWith("ai"),
      };
    })
    .sort((a, b) => b.prizes - a.prizes || b.wins - a.wins)
    .slice(0, 12);
}

function horseById(state, horseId) {
  // Horses that left the yard live on in a compact archive, because a banked straw
  // must still resolve its sire after he is gone.
  return (
    state.horses.find((horse) => horse.id === horseId) ??
    (state.gone ?? []).find((horse) => horse.id === horseId) ??
    null
  );
}

/** The house takes the horse: the token is burnt and the yard stops paying for it. */
function burnHorse(state, horse) {
  if (!horse || !horse.id) return;
  if (!(state.gone ?? []).some((row) => row.id === horse.id)) {
    state.gone = [
      ...(state.gone ?? []),
      {
        id: horse.id,
        name: horse.name,
        sex: horse.sex,
        lineage: horse.lineage,
        genome: horse.genome,
        sire: horse.sire ?? null,
        dam: horse.dam ?? null,
        bornSeason: horse.bornSeason ?? 0,
        age: horse.age ?? 0,
        genetic: horse.genetic ?? 0,
        value: horse.value ?? 0,
        stakes: Boolean(horse.stakes),
        stakesWins: horse.stakesWins ?? 0,
        retired: Boolean(horse.retired),
        burned: true,
      },
    ];
  }
  state.horses = state.horses.filter((row) => row.id !== horse.id);
  for (const stable of state.stables) {
    stable.horses = stable.horses.filter((id) => id !== horse.id);
    stable.entries = (stable.entries ?? []).filter((id) => id !== horse.id);
  }
  state.listings = (state.listings ?? []).filter((lot) => lot.horseId !== horse.id);
  state.foaling = (state.foaling ?? []).filter((row) => row.mareId !== horse.id && row.sireId !== horse.id);
}

/** In training: owned, not retired, not sold off or lost to a debt. */
function inPlay(horse) {
  return Boolean(horse) && !horse.retired && !horse.sold && horse.owner !== null;
}

function strawsOf(state, stable) {
  return stable.straws;
}

/**
 * Which instruction a card leans towards, from the same lean the pace model uses, so the
 * advice on the page and the numbers the engine scores with cannot disagree.
 */
function instructionFor(going) {
  const weights = CONDITIONS[going] ?? {};
  const early = (weights.speed ?? 0) + (weights.accel ?? 0);
  const late = (weights.stamina ?? 0) + (weights.recovery ?? 0);
  const lean = early + late > 0 ? (early - late) / (early + late) : 0;
  if (lean > 0.25) {
    return {
      lean: round(lean, 2),
      best: "push",
      why: "the card is won early, so a horse that can go fast is one to send",
    };
  }
  if (lean < -0.25) {
    return {
      lean: round(lean, 2),
      best: "hold",
      why: "the card is won late, so sending one early spends what it needs at the finish",
    };
  }
  return {
    lean: round(lean, 2),
    best: "steady",
    why: "the card is balanced, so the instruction matters less than the horse",
  };
}

/**
 * The going for a given season and meeting: three a season, cycling the list, so the
 * instruction that suits a horse is asked three times a season rather than once.
 */
function conditionFor(season, round) {
  // Stepping by MEETINGS_PER_SEASON rather than by one is what makes the card differ
  // every season; the modulo then wraps it around the list.
  const index = (season - 1) * MEETINGS_PER_SEASON + ((round ?? 1) - 1);
  return CONDITION_ORDER[index % CONDITION_ORDER.length];
}

/** Keep state.condition pointing at the meeting that is about to run. */
function setCondition(state) {
  state.condition = conditionFor(state.season ?? 1, state.meeting ?? 1);
}

/**
 * The field, before the off. A race day is mostly OTHER horses: you study the runners, size up
 * the rival to beat, and only then does your own matter. The runners used to appear at the finish
 * line - "finished 7 of 10" with nine faces never seen - so this publishes the declared field:
 * every entrant, the stable, what he has done, and the instruction he is likely to run with.
 */
function paddockOf(state) {
  const rows = [];
  for (const stable of state.stables) {
    for (const horseId of stable.entries.slice(0, 3)) {
      const horse = horseById(state, horseId);
      if (!horse || horse.retired || horse.age < RACE_AGE) continue;
      rows.push({
        horseId: horse.id,
        name: horse.name,
        stable: stable.name,
        mine: Boolean(stable.player),
        value: round(horse.value ?? 0, 2),
        runs: horse.starts ?? 0,
        wins: horse.wins ?? 0,
        places: horse.places ?? 0,
        // A rival declares an instruction, a player chooses one, and the house runs plain when
        // nobody has said otherwise - the same default the race itself uses.
        tactic: (stable.tactics && stable.tactics[horse.id]) || "steady",
        stakes: Boolean(horse.stakes),
      });
    }
  }
  return rows;
}

/** Where a stable stood when its season opened. */
/**
 * What a rival is short of, said plainly. The houses act every season - they list coverings,
 * enter runners, buy blood and send youngstock to the ring - and a player never saw why
 * anything moved, so the market and the field read as weather. This is the why, in one phrase,
 * derived from the rival's own state rather than invented.
 */
function rivalIntent(stable, state) {
  const horses = stable.horses.map((id) => horseById(state, id)).filter(Boolean);
  const mares = horses.filter((horse) => horse.sex === "F" && !horse.retired);
  const studs = horses.filter((horse) => horse.sex === "M" && !horse.retired);
  if (studs.length === 0) return "short of a stallion";
  if (mares.length < 2) return "short of mares";
  if (stable.guineas < 400) return "short of coin";
  if (stable.straws.length < 3) return "short of coverings";
  if (horses.length > AI_ACTIVE_CAP) return "thinning the yard";
  return "buying blood";
}

function snapshotSeason(stable, state) {
  const horses = stable.horses.map((id) => horseById(state, id)).filter(Boolean);
  return {
    season: state.season,
    guineas: stable.guineas,
    horses: horses.length,
    runs: horses.reduce((n, h) => n + (h.starts ?? 0), 0),
    wins: horses.reduce((n, h) => n + (h.wins ?? 0), 0),
    places: horses.reduce((n, h) => n + (h.places ?? 0), 0),
    prizes: horses.reduce((n, h) => n + (h.earnings ?? 0), 0),
    retired: horses.filter((h) => h.retired).length,
    forced: stable.forcedSales ?? 0,
  };
}

/**
 * One closing moment per season. The bills, the births, the forced sales and the results all
 * arrive as separate lines in the log, so the most repeated moment in the game had no shape of
 * its own. This is that shape: what the season cost, paid, produced and took away, against
 * where the yard stood when the season opened.
 */
function closeSeason(state) {
  for (const stable of state.stables) {
    const open = stable.seasonOpen ?? snapshotSeason(stable, state);
    const now = snapshotSeason(stable, state);
    const born = stable.horses
      .map((id) => horseById(state, id))
      .filter((horse) => horse && horse.age === 0)
      .map((horse) => horse.name);
    stable.seasonReport = {
      season: open.season,
      bank: now.guineas - open.guineas,
      horses: now.horses - open.horses,
      runs: now.runs - open.runs,
      wins: now.wins - open.wins,
      places: now.places - open.places,
      prizes: now.prizes - open.prizes,
      retired: now.retired - open.retired,
      forced: now.forced - open.forced,
      born,
    };
  }
}

function nextSeason(state) {
  closeSeason(state);
  state.season += 1;
  // The season boundary is where entries belong: runners carry from one meeting to the next,
  // and clear only when the calendar turns, when some of them may also have retired.
  for (const stable of state.stables) {
    stable.entries = [];
    stable.tally = { wins: 0, bred: 0, sold: 0 };
    stable.seasonOpen = snapshotSeason(stable, state);
    // The foals of the season just turned are on the ground as this runs, and the population has
    // been scored, so both firsts can be read here rather than watched for elsewhere.
    const newborns = stable.horses
      .map((id) => horseById(state, id))
      .filter((horse) => horse && horse.age === 0);
    if (newborns.length && !stable.firsts.foal) {
      stable.firsts.foal = { season: Math.max(1, state.season - 1), name: newborns[0].name };
    }
    if (!stable.firsts.stakes) {
      const stakes = stable.horses
        .map((id) => horseById(state, id))
        .find((horse) => horse && horse.stakes && horse.owner === stable.id);
      if (stakes) stable.firsts.stakes = { season: state.season, name: stakes.name };
    }
    if (stable.id.startsWith("ai")) aiEnterMeeting(state, stable);
  }
}

// ── action validation ─────────────────────────────────────────────────────
function validateAction(state, playerId, action) {
  if (!state) return { ok: false, error: "join first" };
  if (!action || typeof action !== "object") return { ok: false, error: "action must be an object" };
  const type = action.type;
  const stable = stableOf(state, playerId);
  // setup runs when the FIRST player arrives (minPlayers is 1), so a later joiner is
  // seated by the room with no stable of their own. They provision one here.
  if (type === "takeSeat") {
    return stable ? { ok: false, error: "you already have a stable" } : { ok: true };
  }
  if (!stable) return { ok: false, error: "take a seat first" };

  if (type === "advance") return { ok: true };

  if (type === "nameStable") {
    const name = String(action.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 24) {
      return { ok: false, error: "a stable name is 2 to 24 characters" };
    }
    return { ok: true };
  }

  if (type === "takeStarterOffer") {
    if (stable.starterOfferTaken) {
      return { ok: false, error: "you have already taken the starter covering" };
    }
    if (stable.guineas < STARTER_COVERING_PRICE) {
      return { ok: false, error: `the starter covering costs ${STARTER_COVERING_PRICE} coins` };
    }
    return { ok: true };
  }

  if (type === "addCoins") {
    if (!TEST_TOOLS) return { ok: false, error: "coin packs are not sold in this build" };
    if (!COIN_PACKS.some((entry) => entry.pack === action.pack)) {
      return { ok: false, error: "unknown coin pack" };
    }
    return { ok: true };
  }

  if (type === "openWindow") {
    if (state.clock) return { ok: false, error: "entries are already open on a clock" };
    if (typeof action.endsAt !== "number" || !Number.isFinite(action.endsAt)) {
      return { ok: false, error: "a window needs a deadline" };
    }
    return { ok: true };
  }

  if (type === "closeWindow") {
    if (!state.clock) return { ok: false, error: "no window is open" };
    return { ok: true };
  }

  if (type === "enter") {
    const ids = Array.isArray(action.horseIds) ? action.horseIds : [];
    if (ids.length > 3) return { ok: false, error: "at most 3 runners per meeting" };
    for (const id of ids) {
      const horse = horseById(state, id);
      if (!horse || horse.owner !== stable.id) return { ok: false, error: "not your horse" };
      if (horse.retired) return { ok: false, error: `${horse.name} is retired` };
      if (horse.age < RACE_AGE) return { ok: false, error: `${horse.name} is too young to race` };
    }
    return { ok: true };
  }

  if (type === "breed") {
    const mare = horseById(state, action.mareId);
    const straw = stable.straws.find((entry) => entry.id === action.strawId);
    if (!mare || mare.owner !== stable.id) return { ok: false, error: "not your mare" };
    if (mare.sex !== "F") return { ok: false, error: "only a mare can be covered" };
    if (mare.retired) return { ok: false, error: "that mare is retired" };
    if (mare.age > MARE_MAX_AGE) return { ok: false, error: "that mare is past breeding age" };
    if (mare.foals >= MARE_CAREER_FOALS) return { ok: false, error: "that mare has finished her career" };
    if ((state.foaling ?? []).some((row) => row.mareId === mare.id)) {
      return { ok: false, error: `${mare.name} is already in foal` };
    }
    if (!straw) return { ok: false, error: "you do not hold that straw" };
    const sire = horseById(state, straw.sire);
    if (!sire) return { ok: false, error: "that straw has no sire" };
    if (stable.guineas < 0) return { ok: false, error: "settle your debts first" };
    const care = CARE_CHOICES.includes(action.care) ? action.care : "plain";
    if (stable.guineas < CARE_COST[care]) return { ok: false, error: "not enough guineas for that care" };
    return { ok: true };
  }

  if (type === "listStraw") {
    const straw = stable.straws.find((entry) => entry.id === action.strawId);
    if (!straw) return { ok: false, error: "you do not hold that straw" };
    if (!Number.isFinite(action.price) || action.price < 1 || action.price > MAX_PRICE) {
      return { ok: false, error: `price must be between 1 and ${MAX_PRICE}` };
    }
    return { ok: true };
  }

  if (type === "unlistStraw") {
    const listing = state.listings.find((entry) => entry.id === action.listingId);
    if (!listing || listing.seller !== stable.id) return { ok: false, error: "not your listing" };
    if (!listing.straw) return { ok: false, error: "that is not a covering lot" };
    return { ok: true };
  }

  if (type === "buyStraw") {
    const listing = state.listings.find((entry) => entry.id === action.listingId);
    if (!listing) return { ok: false, error: "listing is gone" };
    if (listing.seller === stable.id) return { ok: false, error: "that is your own lot" };
    // A covering is only worth buying while its sire is still in the stud book. A lot
    // whose stallion is gone could never be put to a mare, and a player must not pay for
    // something unusable.
    if (!listing.straw || !horseById(state, listing.straw.sire)) {
      return { ok: false, error: "that lot is not a usable covering" };
    }
    if (stable.guineas < listing.price) return { ok: false, error: "not enough guineas" };
    return { ok: true };
  }

  if (type === "buyItem") {
    const item = ITEMS[action.item];
    if (!item) return { ok: false, error: "no such item" };
    if (stable.guineas < item.price) return { ok: false, error: `${item.name} costs ${item.price} GNS` };
    return { ok: true };
  }

  if (type === "useItem") {
    const item = ITEMS[action.item];
    if (!item) return { ok: false, error: "no such item" };
    if (!(stable.inventory?.[action.item] > 0)) return { ok: false, error: `you hold no ${item.name.toLowerCase()}` };
    if (action.item === "pass") return { ok: true };
    const horse = horseById(state, action.horseId);
    if (!horse || horse.owner !== stable.id) return { ok: false, error: "not your horse" };
    if (action.item === "feed") {
      if (horse.fedAt) return { ok: false, error: `${horse.name} has already been fed` };
      if (!TRAITS.includes(action.trait)) return { ok: false, error: "pick a trait" };
    }
    return { ok: true };
  }

  if (type === "prepFoal") {
    const horse = horseById(state, action.horseId);
    if (!horse || horse.owner !== stable.id) return { ok: false, error: "not your horse" };
    if (horse.age > 1) return { ok: false, error: `${horse.name} is past the yearling stage` };
    if (horse.retired) return { ok: false, error: "that horse is retired" };
    if (!TRAITS.includes(action.trait)) return { ok: false, error: "pick a trait" };
    if (horse.prepSeason === state.season) return { ok: false, error: `${horse.name} has been prepped this season` };
    if (stable.guineas < PREP_COST) return { ok: false, error: `prep costs ${PREP_COST} GNS` };
    return { ok: true };
  }

  if (type === "certify") {
    const horse = horseById(state, action.horseId);
    if (!horse) return { ok: false, error: "no such horse" };
    if (horse.owner === stable.id) return { ok: false, error: "you already know your own stock" };
    if (horse.certifiedBy.includes(stable.id)) return { ok: false, error: "already certified for you" };
    if (stable.guineas < CERTIFY_COST) return { ok: false, error: "not enough guineas" };
    return { ok: true };
  }

  if (type === "postWanted") {
    if (!Number.isFinite(action.price) || action.price < 20 || action.price > MAX_PRICE) {
      return { ok: false, error: `offer between 20 and ${MAX_PRICE} GNS` };
    }
    const mine = state.wants.filter((want) => want.stable === stable.id);
    if (mine.length >= WANT_LIMIT) return { ok: false, error: `at most ${WANT_LIMIT} open requests` };
    return { ok: true };
  }

  if (type === "cancelWanted") {
    const want = state.wants.find((entry) => entry.id === action.wantId);
    if (!want || want.stable !== stable.id) return { ok: false, error: "not your request" };
    return { ok: true };
  }

  if (type === "listHorse") {
    const horse = horseById(state, action.horseId);
    if (!horse || horse.owner !== stable.id) return { ok: false, error: "not your horse" };
    if (horse.soulbound) return { ok: false, error: `${horse.name} is soulbound and cannot be consigned` };
    if (horse.retired) return { ok: false, error: "that horse is retired" };
    if (stable.horses.length <= 1) return { ok: false, error: "you cannot consign your last horse" };
    if (!Number.isFinite(action.price) || action.price < 25 || action.price > MAX_PRICE) {
      return { ok: false, error: `ask between 25 and ${MAX_PRICE} GNS` };
    }
    return { ok: true };
  }

  if (type === "unlistHorse") {
    const lot = state.listings.find((entry) => entry.id === action.listingId && entry.kind === "horse");
    if (!lot || lot.seller !== stable.id) return { ok: false, error: "not your consignment" };
    return { ok: true };
  }

  if (type === "buyHorse") {
    const lot = state.listings.find((entry) => entry.id === action.listingId && entry.kind === "horse");
    if (!lot) return { ok: false, error: "that lot is gone" };
    if (lot.seller === stable.id) return { ok: false, error: "that is your own lot" };
    if (stable.guineas < lot.price) return { ok: false, error: "not enough guineas" };
    return { ok: true };
  }
  if (type === "nameHorse") {
    const horse = horseById(state, action.horseId);
    if (!horse || horse.owner !== stable.id) return { ok: false, error: "not your horse" };
    const name = String(action.name ?? "").trim();
    if (name.length < 2 || name.length > 24) return { ok: false, error: "a name is 2 to 24 characters" };
    return { ok: true };
  }

  if (type === "testGrant") {
    if (!TEST_TOOLS) return { ok: false, error: "testing funds are disabled in this build" };
    return BANK_CHOICES.includes(action.amount)
      ? { ok: true }
      : { ok: false, error: "unknown testing amount" };
  }

  if (type === "startOver") {
    if (!TEST_TOOLS && action.bank !== START_BANK) {
      return { ok: false, error: "only the standard bank is offered in this build" };
    }
    return BANK_CHOICES.includes(action.bank)
      ? { ok: true }
      : { ok: false, error: "unknown starting bank" };
  }

  if (type === "setTactic") {
    const horse = horseById(state, action.horseId);
    if (!horse || horse.owner !== stable.id) return { ok: false, error: "not your horse" };
    if (!stable.entries.includes(horse.id)) {
      return { ok: false, error: "enter the horse before giving it an instruction" };
    }
    if (!TACTICS.includes(action.tactic)) return { ok: false, error: "unknown instruction" };
    return { ok: true };
  }

  if (type === "selectStraw") {
    if (action.strawId === null || action.strawId === undefined) return { ok: true };
    const held = stable.straws.find((entry) => entry.id === action.strawId);
    if (!held) return { ok: false, error: "you do not hold that covering" };
    return { ok: true };
  }

  if (type === "sell") {
    const horse = horseById(state, action.horseId);
    if (!horse || horse.owner !== stable.id) return { ok: false, error: "not your horse" };
    if (horse.soulbound) return { ok: false, error: `${horse.name} is soulbound and cannot be sold` };
    if (stable.horses.length <= 1 && !horse.retired) {
      return { ok: false, error: "you cannot sell your last horse" };
    }
    return { ok: true };
  }

  if (type === "retire") {
    const horse = horseById(state, action.horseId);
    if (!horse || horse.owner !== stable.id) return { ok: false, error: "not your horse" };
    if (horse.retired) return { ok: false, error: "already retired" };
    return { ok: true };
  }

  return { ok: false, error: "unknown action" };
}

// ── action application ────────────────────────────────────────────────────
/** Take a lot by id. splice(-1, 1) would silently eat the last lot, so guard the miss. */
function takeLot(list, id) {
  const index = list.findIndex((entry) => entry.id === id);
  if (index < 0) return null;
  return list.splice(index, 1)[0];
}

function applyAction(state, playerId, action) {
  const next = copy(state);
  if (action && action.type === "takeSeat") {
    const stable = freshStable(next, `st${next.stables.length + 1}`, `Stable ${next.stables.length + 1}`, playerId);
    next.stables.push(stable);
    giveStartingStock(next, stable, false);
    scorePopulation(next);
    log(next, `${stable.name} joins the sales ring.`, "season");
    return next;
  }
  const stable = stableOf(next, playerId);
  if (!stable) return next;

  if (action.type === "enter") {
    stable.entries = [...new Set((action.horseIds ?? []).map(String))].slice(0, 3);
    return next;
  }

  if (action.type === "breed") {
    const mare = horseById(next, action.mareId);
    const strawIndex = stable.straws.findIndex((entry) => entry.id === action.strawId);
    const straw = strawIndex < 0 ? null : stable.straws[strawIndex];
    if (!straw) return next;
    const sire = horseById(next, straw.sire);
    const care = CARE_CHOICES.includes(action.care) ? action.care : "plain";
    const careCost = CARE_COST[care];
    stable.guineas -= careCost;
    if (careCost) {
      next.ledger = [
        { season: next.season, text: `Breeding care (${care})`, amount: -careCost },
        ...next.ledger,
      ].slice(0, 10);
    }
    stable.straws.splice(strawIndex, 1);
    stable.selectedStraw = null; // the straw is gone: a stale selection blocked the next breed
    stable.tally = { ...(stable.tally ?? { wins: 0, sold: 0 }), bred: (stable.tally?.bred ?? 0) + 1 };
    mare.foals += 1;
    log(next, `${mare.name} covered by ${sire.name} (vintage ${straw.vintage}).`, "breeding");

    const liveRate = Math.min(
      0.99,
      Math.max(0.35, BASE_LIVE_RATE - INBREED_FERTILITY * ((sire.f + mare.f) / 2)) + CARE_CATCH[care],
    );
    const conceptionRoll = rollValue(next);
    recordLuck(next, "covering", liveRate, conceptionRoll <= liveRate, mare.name);
    if (conceptionRoll > liveRate) {
      next.lastFoal = {
        event: "miss",
        damId: mare.id,
        damName: mare.name,
        sireId: sire.id,
        sireName: sire.name,
        care,
        chance: round(liveRate, 3),
      };
      log(next, `No foal from ${mare.name} this season.`, "breeding");
      return next;
    }
    // She is in foal. The covering is spent and the wait begins: the foal is not
    // built yet, so the payoff is something the player waits a season for.
    const fate = rollGestationFate(next);
    const pregnancy = {
      id: `${mare.id}@${next.season}`,
      mareId: mare.id,
      sireId: sire.id,
      stableId: stable.id,
      care,
      vintage: straw.vintage,
      conceived: next.season,
      dueSeason: next.season + GESTATION_SEASONS,
      fate: fate ? fate.fate : null,
      elite: Boolean(straw.elite),
    };
    next.foaling = [...(next.foaling ?? []), pregnancy];
    next.lastFoal = {
      event: "expecting",
      id: pregnancy.id,
      damId: mare.id,
      damName: mare.name,
      sireId: sire.id,
      sireName: sire.name,
      care,
      conceived: pregnancy.conceived,
      dueSeason: pregnancy.dueSeason,
      chance: round(liveRate, 3),
      fate: fate ? fate.fate : null,
      fateNote: fate ? fate.note : null,
      stableId: stable.id,
    };
    log(next, `${mare.name} is in foal to ${sire.name} — due next season.`, "breeding");
    if (fate) log(next, fate.note, "breeding");
    return next;
  }

  if (action.type === "listStraw") {
    const straw = takeLot(stable.straws, action.strawId);
    if (!straw) return next;
    const sire = horseById(next, straw.sire);
    next.listings.push({
      id: `l${next.nextId++}`,
      seller: stable.id,
      straw,
      price: Math.round(action.price),
      sire: straw.sire,
      sireName: sire ? sire.name : "unknown",
      vintage: straw.vintage,
      season: next.season,
    });
    log(next, `${stable.name} offers a straw from ${sire ? sire.name : "unknown"} at ${Math.round(action.price)} GNS.`, "market");
    return next;
  }

  if (action.type === "unlistStraw") {
    const listing = takeLot(next.listings, action.listingId);
    if (!listing || !listing.straw) return next;
    stable.straws.push(listing.straw);
    return next;
  }

  if (action.type === "buyStraw") {
    const listing = takeLot(next.listings, action.listingId);
    if (!listing || !listing.straw) return next;
    const seller = next.stables.find((entry) => entry.id === listing.seller);
    const rake = Math.round(listing.price * MARKET_RAKE);
    stable.guineas -= listing.price;
    if (seller) seller.guineas += listing.price - rake;
    stable.straws.push({
      ...listing.straw,
      id: `s${next.nextStraw++}`,
      elite: Boolean(listing.select),
    });
    next.ledger = [
      { season: next.season, text: `${stable.name} bought a straw from ${listing.sireName}`, amount: -listing.price },
      ...next.ledger,
    ].slice(0, 10);
    log(next, `${stable.name} bought a ${listing.sireName} straw for ${listing.price} GNS.`, "market");
    return next;
  }

  if (action.type === "buyItem") {
    const item = ITEMS[action.item];
    stable.guineas -= item.price;
    stable.inventory = { ...(stable.inventory ?? {}), [action.item]: (stable.inventory?.[action.item] ?? 0) + 1 };
    next.ledger = [
      { season: next.season, text: `Bought ${item.name}`, amount: -item.price },
      ...next.ledger,
    ].slice(0, 10);
    log(next, `${stable.name} bought ${item.name} for ${item.price} GNS.`, "market");
    return next;
  }

  if (action.type === "useItem") {
    const item = ITEMS[action.item];
    stable.inventory = { ...(stable.inventory ?? {}), [action.item]: Math.max(0, (stable.inventory?.[action.item] ?? 0) - 1) };
    if (action.item === "pass") {
      stable.passMeeting = `${next.season}:${next.meeting ?? 1}`;
      log(next, `${stable.name} put a meeting pass on the gate: no entry fees this meeting.`, "race");
      return next;
    }
    const horse = horseById(next, action.horseId);
    if (action.item === "catalogue") {
      if (!horse.certifiedBy.includes(stable.id)) horse.certifiedBy = [...horse.certifiedBy, stable.id];
      log(next, `${stable.name} read ${horse.name} in the catalogue.`, "market");
      return next;
    }
    if (action.item === "feed") {
      horse.fedAt = next.season;
      const raised = boostTrait(horse, action.trait);
      log(next, raised ? `${horse.name} is fed for ${action.trait}.` : `${horse.name} is already at the top of ${action.trait}.`, "breeding");
      scorePopulation(next);
      return next;
    }
    return next;
  }

  if (action.type === "prepFoal") {
    const horse = horseById(next, action.horseId);
    stable.guineas -= PREP_COST;
    horse.prepSeason = next.season;
    const raised = boostTrait(horse, action.trait);
    next.ledger = [
      { season: next.season, text: `Prep for ${horse.name}`, amount: -PREP_COST },
      ...next.ledger,
    ].slice(0, 10);
    log(next, raised ? `${horse.name} is prepped for ${action.trait}.` : `${horse.name} has nothing left to gain in ${action.trait}.`, "breeding");
    scorePopulation(next);
    return next;
  }

  if (action.type === "certify") {
    const horse = horseById(next, action.horseId);
    horse.certifiedBy = [...horse.certifiedBy, stable.id];
    stable.guineas -= CERTIFY_COST;
    log(next, `${stable.name} paid ${CERTIFY_COST} GNS to certify ${horse.name}.`, "market");
    return next;
  }

  if (action.type === "postWanted") {
    const lineage = typeof action.lineage === "string" && action.lineage ? action.lineage : null;
    next.wants.push({
      id: `w${next.nextId++}`,
      stable: stable.id,
      price: Math.round(action.price),
      lineage,
      season: next.season,
    });
    log(
      next,
      `${stable.name} requests ${lineage ? `a ${lineage} covering` : "any covering"} at ${Math.round(action.price)} GNS.`,
      "market",
    );
    return next;
  }

  if (action.type === "cancelWanted") {
    next.wants = next.wants.filter((want) => want.id !== action.wantId);
    return next;
  }

  if (action.type === "listHorse") {
    const horse = horseById(next, action.horseId);
    const price = Math.round(action.price);
    stable.horses = stable.horses.filter((id) => id !== horse.id);
    horse.owner = null;
    horse.listed = true;
    next.listings.push({
      id: `l${next.nextId++}`,
      kind: "horse",
      seller: stable.id,
      horseId: horse.id,
      price,
      season: next.season,
    });
    log(next, `${stable.name} consigns ${horse.name} at ${price} GNS.`, "market");
    scorePopulation(next);
    return next;
  }

  if (action.type === "unlistHorse") {
    const lot = takeLot(next.listings, action.listingId);
    if (!lot || !lot.horseId) return next;
    const horse = horseById(next, lot.horseId);
    if (horse) {
      horse.owner = stable.id;
      horse.listed = false;
      stable.horses.push(horse.id);
    }
    scorePopulation(next);
    return next;
  }

  if (action.type === "buyHorse") {
    const lot = takeLot(next.listings, action.listingId);
    if (!lot || !lot.horseId) return next;
    const horse = horseById(next, lot.horseId);
    const seller = next.stables.find((entry) => entry.id === lot.seller);
    const rake = Math.round(lot.price * MARKET_RAKE);
    stable.guineas -= lot.price;
    if (seller) {
      seller.guineas += lot.price - rake;
      seller.tally = { ...(seller.tally ?? { wins: 0, bred: 0 }), sold: (seller.tally?.sold ?? 0) + 1 };
    }
    if (horse) {
      horse.owner = stable.id;
      horse.listed = false;
      stable.horses.push(horse.id);
    }
    next.ledger = [
      { season: next.season, text: `Bought ${horse ? horse.name : "a horse"}`, amount: -lot.price },
      ...next.ledger,
    ].slice(0, 10);
    log(next, `${stable.name} bought ${horse ? horse.name : "a lot"} for ${lot.price} GNS.`, "market");
    scorePopulation(next);
    return next;
  }

  if (action.type === "nameHorse") {
    const horse = horseById(next, action.horseId);
    const was = horse.name;
    horse.name = String(action.name ?? "").trim().slice(0, 24);
    if (next.lastFoal && next.lastFoal.id === horse.id) next.lastFoal.name = horse.name;
    log(next, `${was} is named ${horse.name}.`, "breeding");
    return next;
  }

  if (action.type === "testGrant") {
    if (!TEST_TOOLS) return next;
    stable.guineas += action.amount;
    log(next, `Testing funds added: ${action.amount} GNS, a testing tool rather than an earning.`, "market");
    return next;
  }

  if (action.type === "startOver") {
    // A whole new world for the same seats, on the chosen testing bank. One action
    // rather than reset-then-top-up, so it can never land half-applied.
    const players = state.players && state.players.length ? state.players : [playerId];
    const fresh = setup(players);
    const mine = stableOf(fresh, playerId);
    if (mine) mine.guineas = action.bank;
    log(
      fresh,
      `Started over from season 1 with a testing bank of ${action.bank} GNS, a testing tool rather than an earning.`,
      "season",
    );
    return fresh;
  }

  if (action.type === "setTactic") {
    stable.tactics = { ...(stable.tactics ?? {}), [action.horseId]: action.tactic };
    return next;
  }

  if (action.type === "selectStraw") {
    stable.selectedStraw = action.strawId ?? null;
    return next;
  }

  if (action.type === "sell") {
    const horse = horseById(next, action.horseId);
    const floor = Math.round(suggestedHorsePrice(horse) * HOUSE_HORSE_FLOOR);
    stable.guineas += floor;
    stable.tally = { ...(stable.tally ?? { wins: 0, bred: 0 }), sold: (stable.tally?.sold ?? 0) + 1 };
    burnHorse(next, horse);
    next.ledger = [
      { season: next.season, text: `Sold ${horse.name} to the house`, amount: floor },
      ...next.ledger,
    ].slice(0, 10);
    log(next, `${horse.name} sold to the house for ${floor} GNS.`, "market");
    scorePopulation(next);
    return next;
  }

  if (action.type === "retire") {
    const horse = horseById(next, action.horseId);
    horse.retired = true;
    log(next, `${horse.name} retired to the paddock.`, "breeding");
    scorePopulation(next);
    return next;
  }

  if (action.type === "advance") {
    // running it by hand supersedes any clock that is open
    next.clock = null;
    return runRound(next, "");
  }

  if (action.type === "nameStable") {
    const name = String(action.name ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
    const was = stable.name;
    stable.name = name;
    log(next, `${was} is now ${name}.`, "season");
    return next;
  }

  if (action.type === "takeStarterOffer") {
    // The onboarding purchase: a covering from the best stallion in the world, once per
    // stable, at a price the first season can afford. This is the first thing coins buy.
    stable.guineas -= STARTER_COVERING_PRICE;
    stable.starterOfferTaken = true;
    const best = next.horses
      .filter((horse) => horse.sex === "M" && !horse.retired)
      .sort((a, b) => b.value - a.value)[0];
    stable.straws.push({
      id: `s${next.nextStraw++}`,
      sire: best ? best.id : null,
      vintage: next.season,
      elite: true,
    });
    next.ledger = [
      { season: next.season, text: "Starter covering", amount: -STARTER_COVERING_PRICE },
      ...next.ledger,
    ].slice(0, 10);
    log(
      next,
      `The starter covering arrives, by ${best ? best.name : "a house stallion"}: put it to your mare.`,
      "breeding",
    );
    return next;
  }

  if (action.type === "addCoins") {
    if (!TEST_TOOLS) return next;
    const pack = COIN_PACKS.find((entry) => entry.pack === action.pack);
    stable.guineas += pack.coins;
    next.ledger = [
      { season: next.season, text: `Coins: ${pack.pack}`, amount: pack.coins },
      ...next.ledger,
    ].slice(0, 10);
    log(next, `${pack.coins} coins were added to the stable.`, "market");
    return next;
  }

  if (action.type === "openWindow") {
    next.clock = { endsAt: action.endsAt, round: next.meeting ?? 1 };
    log(
      next,
      `${stable.name} put entries for meeting ${next.meeting ?? 1} on a clock: they close when the time is up.`,
      "season",
    );
    return next;
  }

  if (action.type === "closeWindow") {
    next.clock = null;
    return runRound(next, "The clock ran out —");
  }

  return next;
}

// ── the season ────────────────────────────────────────────────────────────
/**
 * Run one meeting and move the round on, or turn the season over. The button and the
 * clock both come through here, so a timed meeting and a manual one cannot diverge.
 */
function runRound(state, why) {
  const meeting = state.meeting ?? 1;
  runMeeting(state);
  if (meeting >= MEETINGS_PER_SEASON) return runTurnover(state);
  state.meeting = meeting + 1;
  // The field for the NEXT meeting is declared here, at the end of this one. That is the whole
  // point of the paddock: a player studies the runners before the off instead of meeting nine
  // strangers at the finish line. The season's first card is declared as the calendar turns.
  if (state.meeting <= MEETINGS_PER_SEASON) {
    for (const stable of state.stables) {
      if (stable.id.startsWith("ai")) aiEnterMeeting(state, stable);
    }
  }
  setCondition(state);
  log(
    state,
    `${why ? `${why} ` : ""}Meeting ${meeting} of ${MEETINGS_PER_SEASON} is run. Entries for meeting ${state.meeting} are open — up to three runners.`,
    "season",
  );
  return state;
}

/** One meeting: who runs, how they finish, who is paid. No bills, no ageing. */
function runMeeting(state) {
  // The going is per meeting now, so this is where it is fixed.
  setCondition(state);
  const condition = state.condition;
  const entrants = [];

  for (const stable of state.stables) {
    if (stable.id.startsWith("ai")) {
      // Rivals do NOT re-declare here any more. Their field is declared when the previous
      // meeting ends, and the paddock publishes exactly that; picking a new field at the off
      // would make the runners a player studied a different set from the ones that run.
    }
    for (const horseId of stable.entries.slice(0, 3)) {
      const horse = horseById(state, horseId);
      if (!horse || horse.retired || horse.age < RACE_AGE) continue;
      // The house waives what a stable cannot pay. Without this a broke stable can
      // never race, so it can never earn — the trap that killed two playtests.
      // Real tracks grant hardship entries for exactly this reason.
      // The house pays the first season's entries. A yard starts with one mare and no stallion,
      // and it was paying three entry fees before it had earned a coin: the season report showed
      // a lone unplaced mare closing season one ₲ 67 down, all of it entries. The waiver for a
      // stable that cannot pay already existed; this extends it to the one season where nobody
      // has anything to pay with yet.
      const freePass = stable.passMeeting === `${state.season}:${state.meeting ?? 1}`;
      const fee = state.season <= 1 || freePass ? 0 : Math.min(ENTRY_FEE, Math.max(0, stable.guineas));
      stable.guineas -= fee;
      entrants.push({ horse, stableId: stable.id });
    }
    // Entries are NOT cleared here any more. A season is three meetings, and making the
    // player re-enter the same runners three times was the most repeated friction in the
    // game: measured by playing a season by hand, it cost three trips between screens for
    // no decision the player wanted to make. They clear when the calendar turns instead.
  }

  if (entrants.length) {
    for (const entry of entrants) {
      const owner = state.stables.find((row) => row.id === entry.stableId);
      // the stable's instruction for this runner; the house runs plain if none is set
      const tactic = (owner && owner.tactics && owner.tactics[entry.horse.id]) || "steady";
      const base = entry.horse.conditions[condition];
      const profile = paceProfile(entry.horse, condition, tactic);
      const noise = (rollValue(state) - 0.5) * NOISE * base;
      entry.tactic = tactic;
      entry.shift = profile.shift;
      entry.shape = profile.shape;
      entry.score = base + profile.shift + noise;
    }
    entrants.sort((a, b) => b.score - a.score);
    const pot = Math.round(entrants.length * ENTRY_FEE * PURSE_SUBSIDY);
    entrants.forEach((entry, index) => {
      const share = PURSE_SPLIT[index];
      const prize = share ? Math.round(pot * share) : 0;
      const horse = entry.horse;
      const stable = state.stables.find((s) => s.id === entry.stableId);
      horse.starts += 1;
      if (prize > 0 && stable) {
        stable.guineas += prize;
        horse.earnings += prize;
      }
      if (index === 0) {
        horse.wins += 1;
        if (stable) stable.tally.wins = (stable.tally?.wins ?? 0) + 1;
        if (horse.stakes) horse.stakesWins += 1;
        if (stable && !stable.firsts.win) {
          stable.firsts.win = { season: state.season, meeting: state.meeting ?? 1, where: condition, horse: horse.name };
        }
      } else if (index === 1 || index === 2) {
        if (stable && !stable.firsts.place) {
          stable.firsts.place = { season: state.season, meeting: state.meeting ?? 1, where: condition, horse: horse.name, at: index + 1 };
        }
      }
      const place = index + 1;
      if (place === 2 || place === 3) horse.places += 1;
      // The best result is kept as a fact rather than recomputed later: what a horse did
      // once is the one number on his card that can never change again.
      if (!horse.best || place < horse.best.place) {
        horse.best = { place, of: entrants.length, season: state.season };
      }
    });
    // The replay is derived from the result, never invented: at the finish the order
    // is exactly the placings, so the animation cannot contradict the race. Before
    // the finish, front-loaded runners show up early and get reeled back in.
    const best = entrants[0].score;
    const worst = entrants[entrants.length - 1].score;
    const span = Math.max(0.001, best - worst);
    const beats = [];
    for (let step = 1; step <= REPLAY_CHECKPOINTS; step += 1) {
      const t = step / REPLAY_CHECKPOINTS;
      const order = entrants
        .map((entry) => {
          const rank = (entry.score - worst) / span;
          const progress = t * (0.82 + 0.18 * rank) + (entry.shape ?? 0) * (1 - t) * t * 0.9;
          return {
            horseId: entry.horse.id,
            name: entry.horse.name,
            stable: entry.stableId,
            lineage: entry.horse.lineage,
            progress: round(progress, 3),
          };
        })
        .sort((a, b) => b.progress - a.progress);
      beats.push({ t: round(t, 2), order });
    }
    const winner = entrants[0];
    state.lastRace = {
      season: state.season,
      meeting: state.meeting ?? 1,
      condition,
      pot,
      runners: entrants.length,
      // How far clear the winner was, and the whole table. The panel named the winner; a player
      // also wants to read his own horse's race - where it finished, how far behind, what it won.
      margin: entrants.length > 1 ? round(entrants[0].score - entrants[1].score, 2) : 0,
      table: entrants.map((entry, index) => ({
        horseId: entry.horse.id,
        name: entry.horse.name,
        stableId: entry.stableId,
        place: index + 1,
        behind: round(Math.max(0, entrants[0].score - entry.score), 2),
        behindLengths: inLengths(entrants[0].score - entry.score),
        prize: PURSE_SPLIT[index] ? Math.round(pot * PURSE_SPLIT[index]) : 0,
        tactic: entry.tactic,
      })),
      replay: beats,
      tactics: entrants.map((entry) => ({
        horseId: entry.horse.id,
        name: entry.horse.name,
        tactic: entry.tactic,
        shift: round(entry.shift ?? 0, 2),
      })),
      result: entrants.slice(0, Math.min(3, entrants.length)).map((entry) => ({
        horseId: entry.horse.id,
        name: entry.horse.name,
        score: round(entry.score, 2),
        stable: entry.stableId,
      })),
      winnerStakes: Boolean(winner.horse.stakes),
    };
    log(
      state,
      `${condition} meeting: ${winner.horse.name} wins a pot of ${pot} GNS from ${entrants.length} runners.`,
      "race",
    );

    // Cause and effect in words: which trait actually cost each runner, and by how
    // much. Without this a player can only guess at what the conditions reward.
    // every runner of a real stable, at any placing: a player who finishes tenth
    // still needs to know why, or the conditions never teach themselves
    for (const entry of entrants) {
      if (entry === winner) continue;
      const owner = state.stables.find((row) => row.id === entry.stableId);
      if (!owner || owner.id.startsWith("ai")) continue;
      const place = entrants.indexOf(entry) + 1;
      const gap = round(winner.score - entry.score, 2);
      const misjudged = entry.shift !== undefined && entry.shift < -0.05;
      log(
        state,
        `${entry.horse.name} finished ${place} of ${entrants.length} in the ${condition}, ${gap} behind — lost it on ${raceDiagnosis(entry.horse, winner.horse, condition)}${misjudged ? `, and ${entry.tactic} was the wrong instruction for a ${condition}` : ""}.`,
        "race",
      );
    }
  } else {
    state.lastRace = null;
  }

  return state;
}

/** The season's end: bills, ageing, the market, the foaling and the new year. */
function runTurnover(state) {
  state.meeting = 1;
  for (const stable of state.stables) {
    if (!stable.id.startsWith("ai")) continue;
    // House money keeps rival stables solvent enough to trade, which is what gives a
    // solo player counterparties in the straw market. Once a season, not per meeting.
    stable.guineas += AI_STIPEND;
    // The house keeps rivals liquid enough to buy, not rich enough to sit out the market.
    if (stable.guineas > AI_TREASURY_CAP) stable.guineas = AI_TREASURY_CAP;
    aiPrepareSeason(state, stable);
  }

  // Rivals breed before the bills, and a newborn has no upkeep or value yet: billing
  // `undefined` turned every rival balance into NaN from season two on.
  scorePopulation(state);

  // upkeep, ageing, straws, retirement
  for (const stable of state.stables) {
    let bill = 0;
    for (const horseId of [...stable.horses]) {
      const horse = horseById(state, horseId);
      if (!horse) continue;
      bill += Number.isFinite(horse.upkeep) ? horse.upkeep : upkeepFor(horse);
    }
    stable.guineas -= bill;
    if (stable.guineas < 0) {
      // The house takes stock until the bill is covered - up to three a season - and credits
      // half of what it takes. A forced sale that paid nothing made the debt unpayable.
      let taken = 0;
      while (stable.guineas < 0 && taken < 3) {
        const cheapest = [...stable.horses]
          .map((id) => horseById(state, id))
          // The gift horse is not collateral: the rules refuse to sell her, so this path does too.
          .filter((horse) => horse && !horse.retired && !horse.soulbound)
          .sort((a, b) => a.value - b.value)[0];
        if (!cheapest) break;
        const credit = Math.round(suggestedHorsePrice(cheapest) * HOUSE_HORSE_FLOOR);
        stable.guineas += credit;
        burnHorse(state, cheapest);
        stable.forcedSales += 1;
        taken += 1;
        log(state, `${stable.name} could not meet the ${bill} GNS upkeep bill; ${cheapest.name} was sold off at ${credit} GNS.`, "upkeep");
      }
      if (stable.guineas < 0) {
        // Nothing left the house may take. The clamp below forgives the balance; this says so,
        // because a debt that vanishes without a line reads like a bug.
        log(
          state,
          `${stable.name} could not meet the ${bill} GNS bill, and the house will not take the gift horse: the debt is written off.`,
          "upkeep",
        );
      }
      stable.guineas = Math.max(stable.guineas, 0);
    }
  }

  for (const horse of [...state.horses]) {
    horse.age += 1;
    const limit = horse.sex === "M" ? STALLION_MAX_AGE : MARE_MAX_AGE;
    if (!horse.retired && horse.age > limit) horse.retired = true;
  }

  // Rivals keep their herds to a sensible size and cash the surplus. An unbounded
  // rival herd was out-earning a human player on scale alone.
  for (const stable of state.stables) {
    if (!stable.id.startsWith("ai")) continue;
    // Pensioners first: a retired horse produces nothing, so cashing it is always
    // right. Culling the weakest ACTIVE horse while pensioners clogged the herd is
    // what shrank rival stables to nothing and emptied the catalogue.
    const pensioners = stable.horses
      .map((id) => horseById(state, id))
      .filter((horse) => horse && horse.retired);
    for (const pensioner of pensioners) {
      stable.guineas += Math.round(suggestedHorsePrice(pensioner) * HOUSE_HORSE_FLOOR);
      burnHorse(state, pensioner);
    }
    let active = stable.horses
      .map((id) => horseById(state, id))
      .filter((horse) => horse && !horse.retired);
    let consigned = 0;
    while (active.length > AI_ACTIVE_CAP) {
      const weakest = active.slice().sort((a, b) => a.value - b.value)[0];
      stable.horses = stable.horses.filter((id) => id !== weakest.id);
      active = active.filter((horse) => horse.id !== weakest.id);
      if (consigned < 2 && weakest.value >= 4) {
        // consign rather than dump: this is what builds a used market
        weakest.owner = null;
        weakest.listed = true;
        state.listings.push({
          id: `l${state.nextId++}`,
          kind: "horse",
          seller: stable.id,
          horseId: weakest.id,
          price: Math.round(suggestedHorsePrice(weakest) * 0.9),
          season: state.season,
        });
        consigned += 1;
      } else {
        stable.guineas += Math.round(suggestedHorsePrice(weakest) * HOUSE_HORSE_FLOOR);
        burnHorse(state, weakest);
      }
    }
  }

  for (const stable of state.stables) {
    for (const horseId of stable.horses) {
      const horse = horseById(state, horseId);
      if (!horse || horse.sex !== "M") continue;
      if (horse.retired || horse.age < 2 || horse.age > STALLION_MAX_AGE) continue;
      horse.strawsThisSeason = 0;
      for (let i = 0; i < SERVICES_PER_SEASON; i += 1) {
        stable.straws.push({ id: `s${state.nextStraw++}`, sire: horse.id, vintage: state.season });
        horse.strawsThisSeason += 1;
      }
    }
  }

  // A barn has finite space. The service cap keeps a stallion's reach in check; what an
  // owner cannot store leaves. Elites are spared, then the oldest go first: culling by
  // sire VALUE measurably raised the field's inbreeding (0.20 to 0.27) by taking the
  // cheap-but-diverse sires out of circulation, while age keeps fresh blood moving.
  for (const stable of state.stables) {
    const overflow = (stable.straws ?? []).length - STRAW_STORAGE;
    if (overflow <= 0) continue;
    const leaving = [...stable.straws]
      .sort((a, b) => {
        if (Boolean(a.elite) !== Boolean(b.elite)) return a.elite ? 1 : -1;
        return (a.vintage ?? 0) - (b.vintage ?? 0);
      })
      .slice(0, overflow);
    let listed = 0;
    let culled = 0;
    for (const straw of leaving) {
      const index = stable.straws.findIndex((entry) => entry.id === straw.id);
      if (index < 0) continue;
      stable.straws.splice(index, 1);
      const sire = horseById(state, straw.sire);
      if (listed < STRAW_MARKET_PER_TURN) {
        listed += 1;
        state.listings.push({
          id: `l${state.nextId++}`,
          seller: stable.id,
          straw,
          price: DUTCH_FLOOR,
          sire: straw.sire,
          sireName: sire ? sire.name : "unknown",
          vintage: straw.vintage,
          season: state.season,
        });
      } else {
        culled += 1;
      }
    }
    // One line for the turn, not one per covering: a notice per straw buried the race
    // diagnoses out of the week's log.
    log(
      state,
      `${stable.name}'s barn was full: ${listed} covering${listed === 1 ? "" : "s"} went to the market at ${DUTCH_FLOOR} GNS${culled ? ` and ${culled} were culled` : ""}.`,
      "market",
    );
  }

  nextSeason(state);
  setCondition(state);
  // A straw lot simply expires. A consigned HORSE cannot be left ownerless, so the
  // house buys it in at the floor — the auction's own answer to a lot nobody wanted.
  const expired = state.listings.filter((listing) => state.season - listing.season >= 3);
  state.listings = state.listings.filter((listing) => state.season - listing.season < 3);
  for (const listing of expired) {
    if (listing.kind !== "horse") continue;
    const horse = horseById(state, listing.horseId);
    if (!horse) continue;
    const seller = state.stables.find((entry) => entry.id === listing.seller);
    const floor = Math.round(suggestedHorsePrice(horse) * HOUSE_HORSE_FLOOR);
    if (seller) seller.guineas += floor;
    burnHorse(state, horse);
    log(state, `${horse.name} was bought in at the house floor for ${floor} GNS.`, "market");
  }
  scorePopulation(state);
  for (const stable of state.stables) {
    if (stable.id.startsWith("ai")) aiListStraws(state, stable);
  }
  // One house a season sends a horse to the ring, rotating, so the market keeps living
  // after the opening lots have aged out.
  const sellers = state.stables.filter((entry) => entry.id.startsWith("ai"));
  if (sellers.length) aiConsignHorse(state, sellers[state.season % sellers.length]);

  // Stale lots mark down. A market whose asks never move does not clear, which is
  // exactly what the design called for a Dutch lot to fix.
  for (const listing of state.listings) {
    if (state.season - listing.season >= 1) {
      listing.price = Math.max(DUTCH_FLOOR, Math.round(listing.price * DUTCH_DECAY));
    }
  }

  // Fill standing requests. This is the demand side of the market, and the design's
  // argument was that buyers want COMPLEMENTARY genetics, so a matching board beats
  // browsing a catalogue.
  const survivingWants = [];
  for (const want of state.wants) {
    const buyer = state.stables.find((entry) => entry.id === want.stable);
    const expired = state.season - want.season >= WANT_TTL;
    if (!buyer || expired || !(buyer.guineas >= want.price)) continue;
    const bestOwn = Math.max(
      0,
      ...buyer.horses.map((id) => horseById(state, id)?.value ?? 0),
    );
    let filled = false;
    for (const seller of state.stables) {
      if (seller.id === buyer.id) continue;
      const index = seller.straws.findIndex((straw) => {
        const sire = horseById(state, straw.sire);
        if (!sire) return false;
        if (want.lineage && sire.lineage !== want.lineage) return false;
        return sire.value >= bestOwn * WANT_MIN_QUALITY;
      });
      if (index < 0) continue;
      const straw = seller.straws.splice(index, 1)[0];
      const sire = horseById(state, straw.sire);
      const rake = Math.round(want.price * MARKET_RAKE);
      buyer.guineas -= want.price;
      seller.guineas += want.price - rake;
      buyer.straws.push({ ...straw, id: `s${state.nextStraw++}` });
      log(
        state,
        `${seller.name} filled ${buyer.name}'s request with ${sire ? sire.name : "a covering"} at ${want.price} GNS.`,
        "market",
      );
      filled = true;
      break;
    }
    if (!filled) survivingWants.push(want);
  }
  state.wants = survivingWants;

  log(state, `Season ${state.season} opens. Condition: ${state.condition}.`, "season");
  // The wait ends here. Foals due this season arrive as the new one opens, and the
  // genome is sampled now rather than at the covering: nothing was settled in
  // advance, so a save written while she was in foal still produces a real foal.
  const due = (state.foaling ?? []).filter((row) => row.dueSeason <= state.season);
  if (due.length) {
    const created = [];
    const lost = [];
    for (const row of due) {
      const mare = horseById(state, row.mareId);
      const sire = horseById(state, row.sireId);
      const owner = state.stables.find((entry) => entry.id === row.stableId);
      if (!mare || !sire || !owner) continue;
      if (row.fate === "slipped") {
        log(state, `${mare.name} slipped the foal.`, "breeding");
        lost.push({
          event: "slipped",
          id: `${row.id}:lost`,
          damId: mare.id,
          damName: mare.name,
          sireId: sire.id,
          sireName: sire.name,
          care: row.care,
          fate: "slipped",
          fateNote: fateNote("slipped"),
          dueSeason: row.dueSeason,
          stableId: owner.id,
          value: 0,
          tier: null,
          nearMiss: null,
          nextTier: null,
          personalBest: false,
        });
        continue;
      }
      if (row.fate) {
        const draw = GESTATION_FATES.find((entry) => entry.fate === row.fate);
        recordLuck(state, `fate: ${row.fate}`, draw ? draw.rate : 0, true, mare.name);
      }
      const twins = row.fate === "twins" ? 2 : 1;
      for (let index = 0; index < twins; index += 1) {
        const genome = {};
        for (const locus of LOCI) {
          genome[locus] = [
            sire.genome[locus][rollInt(state, 2)],
            mare.genome[locus][rollInt(state, 2)],
          ];
        }
        const lineage = rollValue(state) < 0.5 ? sire.lineage : mare.lineage;
        const sex = rollValue(state) < 0.5 ? "M" : "F";
        const vigour =
          vigourFor(sire, mare) + (FATE_VIGOUR[row.fate] ?? 0) + (row.elite ? SELECT_VIGOUR : 0);
        const foal = makeHorse(state, genome, lineage, sex, 0, state.season, vigour, sire.id, mare.id);
        foal.care = row.care;
        foal.owner = owner.id;
        state.horses.push(foal);
        owner.horses.push(foal.id);
      owner.foalsBred = [...(owner.foalsBred ?? []), foal.id];
      if (BREEDER_PREMIUM > 0) {
        owner.guineas += BREEDER_PREMIUM;
        state.ledger = [
          { season: state.season, text: `Breeder's premium for ${foal.name}`, amount: BREEDER_PREMIUM },
          ...state.ledger,
        ].slice(0, 10);
      }
        log(state, `${foal.name} foaled by ${mare.name} out of ${sire.name}.`, "breeding");
        created.push({ foal, mare, sire, care: row.care, fate: row.fate ?? null });
      }
    }
    scorePopulation(state);
    const reports = created
      .map((entry) => foalReport(state, entry.foal, entry.mare, entry.sire, entry.care, entry.fate))
      .sort((a, b) => b.value - a.value);
    for (const report of reports) {
      const owner = state.stables.find((entry) => entry.id === report.stableId);
      report.personalBest = report.value > (owner?.bestFoalValue ?? 0);
      if (owner && report.personalBest) owner.bestFoalValue = report.value;
      // Keep the tier the foal landed in. It is a rank against that season's field, so
      // it has to be recorded when it happened rather than recomputed years later.
      const born = horseById(state, report.id);
      if (born) born.bornTier = report.tier;
    }
    state.lastFoals = [...reports, ...lost];
    if (state.lastFoals.length) state.lastFoal = state.lastFoals[0];
    state.foaling = (state.foaling ?? []).filter((row) => !due.includes(row));
  }
  state.turn = (state.turn ?? 0) + 1;
  return state;
}

// ── rival stables, so a solo player always has counterparties ─────────────
/** The entry side of a rival's meeting: who runs, and what they are told to do. */
function aiEnterMeeting(state, stable) {
  const runners = stable.horses
    .map((id) => horseById(state, id))
    .filter((horse) => horse && !horse.retired && horse.age >= RACE_AGE)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  stable.entries = runners.map((horse) => horse.id);
  // Rivals pick an instruction too, so a tactic is a decision rather than a free
  // edge: they lean on whichever half of their own profile is stronger.
  stable.tactics = {};
  for (const horse of runners) {
    const early = (traitValue(horse.genome, "speed") + traitValue(horse.genome, "accel")) / 2;
    const late = (traitValue(horse.genome, "stamina") + traitValue(horse.genome, "recovery")) / 2;
    const best = early >= late ? "push" : "hold";
    const misread = early >= late ? "hold" : "push";
    stable.tactics[horse.id] = rollValue(state) < AI_TACTIC_ERROR ? misread : best;
  }

}

/** The season side of a rival's yard: breeding, and what it offers the market. */
function aiPrepareSeason(state, stable) {
  const owned = stable.horses.map((id) => horseById(state, id)).filter(Boolean);
  const mares = owned
    .filter((horse) => horse.sex === "F" && !horse.retired && horse.foals < MARE_CAREER_FOALS && horse.age <= MARE_MAX_AGE)
    .sort((a, b) => b.value - a.value);
  for (const mare of mares.slice(0, 2)) {
    let strawIndex = stable.straws.findIndex((entry) => {
      const sire = horseById(state, entry.sire);
      return sire && sire.lineage !== mare.lineage;
    });
    if (strawIndex < 0) strawIndex = stable.straws.length ? 0 : -1;
    if (strawIndex < 0) break;
    const straw = stable.straws[strawIndex];
    const sire = horseById(state, straw.sire);
    if (!sire) break;
    stable.straws.splice(strawIndex, 1);
    mare.foals += 1;
    const liveRate = Math.max(0.35, BASE_LIVE_RATE - INBREED_FERTILITY * ((sire.f + mare.f) / 2));
    if (rollValue(state) > liveRate) continue;
    const genome = {};
    for (const locus of LOCI) {
      genome[locus] = [sire.genome[locus][rollInt(state, 2)], mare.genome[locus][rollInt(state, 2)]];
    }
    const lineage = rollValue(state) < 0.5 ? sire.lineage : mare.lineage;
    const sex = rollValue(state) < 0.5 ? "M" : "F";
    const foal = makeHorse(state, genome, lineage, sex, 0, state.season, vigourFor(sire, mare), sire.id, mare.id);
    foal.owner = stable.id;
    state.horses.push(foal);
    stable.horses.push(foal.id);
  }

  // Rivals buy coverings the way real breeders do — for throughput and for outside
  // blood — not only when a lot beats their own best horse. Demanding superiority
  // is what left 85 lots unsold in the last playtest.
  const bestOwn = Math.max(0, ...owned.map((horse) => horse.value));
  const needsCoverings = mares.length > 0 || stable.straws.length < 6;
  for (let bought = 0; bought < 2; bought += 1) {
    if (!needsCoverings) break;
    const budget = stable.guineas - 250;
    if (budget < 40) break;
    const wanted = state.listings
      .filter((listing) => listing.seller !== stable.id)
      .map((listing) => ({ listing, sire: horseById(state, listing.sire) }))
      .filter((entry) => entry.sire && entry.listing.price <= budget && entry.sire.value >= bestOwn * 0.6)
      // Best VALUE PER GUINEA, not best absolute sire: buying the priciest lot and
      // ignoring price is what left the catalogue piled up in the last playtest.
      .sort((a, b) => b.sire.value / b.listing.price - a.sire.value / a.listing.price)[0];
    if (!wanted) break;
    const index = state.listings.findIndex((entry) => entry.id === wanted.listing.id);
    state.listings.splice(index, 1);
    const seller = state.stables.find((entry) => entry.id === wanted.listing.seller);
    const rake = Math.round(wanted.listing.price * MARKET_RAKE);
    stable.guineas -= wanted.listing.price;
    if (seller) seller.guineas += wanted.listing.price - rake;
    stable.straws.push({ ...wanted.listing.straw, id: `s${state.nextStraw++}` });
  }

  // Rivals also buy ready-made horses when one beats their own stock.
  const herd = owned.filter((horse) => !horse.retired).length;
  if (herd < AI_ACTIVE_CAP) {
    const budget = stable.guineas - 250;
    const candidate = state.listings
      .filter((listing) => listing.kind === "horse" && listing.seller !== stable.id && listing.price <= budget)
      .map((listing) => ({ listing, horse: horseById(state, listing.horseId) }))
      .filter((entry) => entry.horse && entry.horse.value >= bestOwn * 0.9)
      .sort((a, b) => b.horse.value / b.listing.price - a.horse.value / a.listing.price)[0];
    if (candidate) {
      const index = state.listings.findIndex((entry) => entry.id === candidate.listing.id);
      state.listings.splice(index, 1);
      const seller = state.stables.find((entry) => entry.id === candidate.listing.seller);
      const rake = Math.round(candidate.listing.price * MARKET_RAKE);
      stable.guineas -= candidate.listing.price;
      if (seller) seller.guineas += candidate.listing.price - rake;
      candidate.horse.owner = stable.id;
      candidate.horse.listed = false;
      stable.horses.push(candidate.horse.id);
    }
  }
}

/**
 * A rival sends a young horse to the ring. YOUNGSTOCK ONLY: selling a horse out of the
 * racing string raises the seller's own quality and the whole field with it, which quietly
 * makes every rival harder to beat. Measured: the field went from 6.16 to 6.63 and the
 * player's relative edge from 1.265x to 1.121x. A foal is tradeable without touching who
 * runs, so the market lives and the racing does not move.
 */
function aiConsignHorse(state, stable) {
  const young = stable.horses
    .map((id) => horseById(state, id))
    .filter((horse) => horse && !horse.listed && !horse.sold && !horse.retired && horse.age <= 1)
    .sort((a, b) => a.value - b.value);
  const spare = young[0];
  if (!spare) return false;

  const price = Math.max(25, Math.round(suggestedHorsePrice(spare) * 1.15));
  stable.horses = stable.horses.filter((id) => id !== spare.id);
  spare.listed = true;
  state.listings.push({
    id: `l${state.nextId++}`,
    kind: "horse",
    seller: stable.id,
    horseId: spare.id,
    price,
    season: state.season,
  });
  log(state, `${stable.name} consigns ${spare.name} at ${price} GNS.`, "market");
  return true;
}

function aiListStraws(state, stable) {
  // A per-stable cap: flooding the catalogue is what left 400 lots unsold in the
  // first playtest, which is the design's own warning about dead markets.
  const spare = stable.straws.slice(0, Math.min(8, Math.max(0, stable.straws.length - 3)));
  for (const straw of spare) {
    const sire = horseById(state, straw.sire);
    if (!sire) continue;
    const index = stable.straws.findIndex((entry) => entry.id === straw.id);
    if (index < 0) continue;
    stable.straws.splice(index, 1);
    state.listings.push({
      id: `l${state.nextId++}`,
      seller: stable.id,
      straw,
      price: suggestedStrawPrice(sire),
      sire: straw.sire,
      sireName: sire.name,
      vintage: straw.vintage,
      season: state.season,
    });
  }

  // One select lot per house per season, and only for a stallion worth the premium.
  const stallions = stable.horses
    .map((id) => horseById(state, id))
    .filter((horse) => horse && horse.sex === "M" && !horse.retired)
    .sort((a, b) => b.value - a.value);
  const best = stallions[0];
  if (!best || !(best.stakes || best.value >= SELECT_FLOOR)) return;
  const already = state.listings.some((lot) => lot.sire === best.id && lot.season === state.season);
  if (already) return;
  const index = stable.straws.findIndex((entry) => entry.sire === best.id);
  if (index < 0) return;
  const straw = stable.straws.splice(index, 1)[0];
  state.listings.push({
    id: `l${state.nextId++}`,
    seller: stable.id,
    straw,
    price: selectPrice(best),
    sire: best.id,
    sireName: best.name,
    vintage: straw.vintage,
    season: state.season,
    select: true,
  });
}

// ── end state and views ───────────────────────────────────────────────────
function certifyView(horse, stable) {
  return horse.certifiedBy.includes(stable.id);
}

function viewFor(state, playerId) {
  const stable = stableOf(state, playerId);
  const field = fieldStats(state);
  const selectedCovering = stable && stable.selectedStraw
    ? stable.straws.find((entry) => entry.id === stable.selectedStraw) ?? null
    : null;
  const selectedSire = selectedCovering ? horseById(state, selectedCovering.sire) : null;
  const mine = new Set(stable ? stable.horses : []);
  const certified = new Set();
  if (stable) {
    for (const horse of state.horses) {
      if (horse.certifiedBy.includes(stable.id)) certified.add(horse.id);
    }
  }

  const horseView = (horse) => {
    const revealed = mine.has(horse.id) || certified.has(horse.id);
    return {
      id: horse.id,
      name: horse.name,
      sex: horse.sex,
      age: horse.age,
      lineage: horse.lineage,
      sire: horse.sire ?? null,
      dam: horse.dam ?? null,
      sireName: horse.sire ? horseById(state, horse.sire)?.name ?? null : null,
      damName: horse.dam ? horseById(state, horse.dam)?.name ?? null : null,
      bornTier: horse.bornTier ?? null,
      soulbound: Boolean(horse.soulbound),
      retired: horse.retired,
      entered: Boolean(stable && stable.entries.includes(horse.id)),
      tactic: (stable && stable.tactics && stable.tactics[horse.id]) || "steady",
      // what each instruction would do to THIS horse in THIS going, so the choice
      // is informed before it is made rather than explained after it is lost
      tacticFit: {
        push: round(paceProfile(horse, state.condition, "push").shift, 2),
        hold: round(paceProfile(horse, state.condition, "hold").shift, 2),
      },
      inFoal: (() => {
        const row = (state.foaling ?? []).find((entry) => entry.mareId === horse.id);
        if (!row) return null;
        const sire = horseById(state, row.sireId);
        return {
          dueSeason: row.dueSeason,
          seasonsLeft: Math.max(0, row.dueSeason - state.season),
          sireName: sire ? sire.name : "unknown",
          care: row.care,
          fate: row.fate ?? null,
          fateNote: fateNote(row.fate),
        };
      })(),
      value: horse.value,
      verdict: verdictFor(horse, field),
      band: valueBand(horse, field),
      fLabel: inbreedingLabel(horse.f),
      pairing: horse.sex === "F" && !horse.retired && selectedSire
        ? {
            sireId: selectedSire.id,
            sireName: selectedSire.name,
            crossLineage: selectedSire.lineage !== horse.lineage,
            sameLineage: selectedSire.lineage === horse.lineage,
            sireF: selectedSire.f,
            damF: horse.f,
            vigour: selectedSire.lineage !== horse.lineage ? VIGOUR : 0,
            foalsLeft: Math.max(0, MARE_CAREER_FOALS - horse.foals),
          }
        : null,
      genetic: horse.genetic,
      f: horse.f,
      stakes: horse.stakes,
      starts: horse.starts,
      places: horse.places ?? 0,
      best: horse.best ?? null,
      wins: horse.wins,
      stakesWins: horse.stakesWins,
      earnings: horse.earnings,
      foals: horse.foals,
      upkeep: horse.upkeep,
      suggestedPrice: suggestedHorsePrice(horse),
      traits: revealed ? traitsOf(horse.genome) : null,
      conditions: revealed ? horse.conditions : null,
      owner: horse.owner,
      certified: certified.has(horse.id),
      genotype: revealed ? horse.genome : null,
    };
  };

  const population = state.horses
    .filter((horse) => inPlay(horse))
    .sort((a, b) => b.value - a.value);

  return {
    isYou: Boolean(stable),
    season: state.season,
    condition: state.condition,
    conditionLabel: CONDITION_LABELS[state.condition] ?? state.condition,
    // The card, read straight off the table the engine scores with, so the page cannot
    // drift from the rules: it is the rules.
    goings: CONDITION_ORDER.map((going) => {
      const weights = CONDITIONS[going] ?? {};
      const ranked = [...TRAITS].sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0));
      const advice = instructionFor(going);
      return {
        key: going,
        label: CONDITION_LABELS[going] ?? going,
        character: CONDITION_CHARACTER[going] ?? null,
        strategy: CONDITION_STRATEGY[going] ?? null,
        lean: advice.lean,
        bestInstruction: advice.best,
        instructionWhy: advice.why,
        weights: ranked.map((trait, index) => ({
          trait,
          weight: Math.round((weights[trait] ?? 0) * 100),
          // What the page marks this row as: the two that decide the card, the one that
          // never does, and the rest. Derived here so the visual coding cannot drift.
          tier: index < 2 ? "top" : index === ranked.length - 1 ? "bottom" : "mid",
        })),
        wins: ranked.slice(0, 2),
        punishes: ranked[ranked.length - 1],
        next: going === state.condition,
      };
    }),
    eliteCut: state.eliteCut,
    field,
    advice: adviceFor(state, stable, field),
    seasonGoals: (() => {
      if (!stable) return [];
      const tally = stable.tally ?? { wins: 0, bred: 0, sold: 0 };
      const opened = stable.seasonOpen?.guineas ?? stable.guineas;
      return [
        { key: "win", text: "win a meeting", done: tally.wins > 0 },
        { key: "breed", text: "cover a mare", done: tally.bred > 0 },
        { key: "sell", text: "sell a horse or a covering", done: tally.sold > 0 },
        { key: "grow", text: "end the season richer than you opened it", done: stable.guineas > opened },
      ];
    })(),
    nextStep: nextStepFor(state, stable, field),
    luck: state.luck ?? [],
    goingNote: conditionNote(state.condition),
    selectedStraw: stable ? stable.selectedStraw : null,
    eliteCount: Math.max(1, Math.round(population.length * STAKES_SHARE)),
    stable: stable
      ? {
          id: stable.id,
          name: stable.name,
          guineas: stable.guineas,
          forcedSales: stable.forcedSales,
          entries: stable.entries,
          tactics: stable.tactics ?? {},
          bestFoalValue: stable.bestFoalValue ?? 0,
          foals: [...(stable.foalsBred ?? [])]
            .reverse()
            .slice(0, 12)
            .map((id) => {
              const foal = horseById(state, id);
              if (!foal) return null;
              const dam = horseById(state, foal.dam ?? "");
              const sire = horseById(state, foal.sire ?? "");
              return {
                id: foal.id,
                name: foal.name,
                bornSeason: foal.bornSeason,
                tier: foal.bornTier ?? null,
                value: foal.value,
                damName: dam ? dam.name : "unknown",
                sireName: sire ? sire.name : "unknown",
                inYard: Boolean(stable.horses.includes(foal.id)),
                retired: Boolean(foal.retired),
              };
            })
            .filter(Boolean),
        }
      : null,
    horses: stable ? stable.horses.map((id) => horseById(state, id)).filter(Boolean).map(horseView) : [],
    straws: stable
      ? stable.straws.map((straw) => {
          const sire = horseById(state, straw.sire);
          return {
            id: straw.id,
            sire: straw.sire,
            sireName: sire ? sire.name : "unknown",
            vintage: straw.vintage,
            suggestedValue: sire ? suggestedStrawPrice(sire) : 0,
            sireValue: sire ? sire.value : 0,
            sireStakes: sire ? sire.stakes : false,
            sireLineage: sire ? sire.lineage : null,
            elite: Boolean(straw.elite),
            sireRetired: sire ? sire.retired : false,
          };
        })
      : [],
    listings: state.listings.map((listing) => {
      if (listing.kind === "horse") {
        const consigned = horseById(state, listing.horseId);
        return {
          id: listing.id,
          kind: "horse",
          seller: listing.seller,
          sellerName: sellerName(state, listing.seller),
          price: listing.price,
          age: state.season - listing.season,
          mine: Boolean(stable && listing.seller === stable.id),
          horseId: listing.horseId,
          horseName: consigned ? consigned.name : "withdrawn",
          horseValue: consigned ? consigned.value : 0,
          horseSex: consigned ? consigned.sex : null,
          horseAge: consigned ? consigned.age : null,
          horseStakes: consigned ? consigned.stakes : false,
          horseTraits: consigned && certified.has(consigned.id) ? traitsOf(consigned.genome) : null,
        };
      }
      const sire = horseById(state, listing.sire);
      return {
        id: listing.id,
        seller: listing.seller,
        sellerName: sellerName(state, listing.seller),
        price: listing.price,
        sireName: listing.sireName,
        sireId: listing.sire,
        vintage: listing.vintage,
        suggested: sire ? suggestedStrawPrice(sire) : 0,
        sireValue: sire ? sire.value : 0,
        sireStakes: sire ? sire.stakes : false,
        sireAge: sire ? sire.age : null,
        sireRetired: sire ? sire.retired : false,
        sireLineage: sire ? sire.lineage : null,
        mine: Boolean(stable && listing.seller === stable.id),
        age: state.season - listing.season,
        sireTraits: sire && certified.has(sire.id) ? traitsOf(sire.genome) : null,
        sireGenotype: sire && certified.has(sire.id) ? sire.genome : null,
        select: Boolean(listing.select),
      };
    }),
    players: state.stables
      .filter((entry) => entry.player)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        mine: Boolean(stable && entry.id === stable.id),
      })),
    rivals: state.stables
      .filter((entry) => !entry.player)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        guineas: entry.guineas,
        horses: entry.horses.length,
        best: round(
          Math.max(0, ...entry.horses.map((id) => horseById(state, id)?.value ?? 0)),
          2,
        ),
        // The why, not just the what: what it did last season, and what it is short of now.
        intent: rivalIntent(entry, state),
        lastSeason: entry.seasonReport
          ? {
              season: entry.seasonReport.season,
              runs: entry.seasonReport.runs,
              wins: entry.seasonReport.wins,
              bank: entry.seasonReport.bank,
            }
          : null,
      })),
    standings: population.slice(0, 8).map((horse) => ({
      name: horse.name,
      stable: state.stables.find((entry) => entry.id === horse.owner)?.name ?? "unowned",
      value: horse.value,
      stakes: horse.stakes,
      wins: horse.wins,
    })),
    meeting: state.lastRace
      ? {
          season: state.lastRace.season,
          margin: state.lastRace.margin ?? null,
          marginLengths: inLengths(state.lastRace.margin ?? 0),
          table: (state.lastRace.table ?? []).map((row) => ({
            ...row,
            mine: Boolean(stable) && row.stableId === stable.id,
          })),
          round: state.lastRace.meeting ?? 1,
          condition: state.lastRace.condition,
          pot: state.lastRace.pot,
          runners: state.lastRace.runners,
          replay: state.lastRace.replay ?? null,
          tactics: state.lastRace.tactics ?? [],
          winner: state.lastRace.result[0] ? state.lastRace.result[0].name : "—",
          places: state.lastRace.result.map((entry, index) => ({
            place: index + 1,
            name: entry.name,
            stable: state.stables.find((s) => s.id === entry.stable)?.name ?? "unknown",
            score: entry.score,
          })),
        }
      : null,
    wants: state.wants.map((want) => ({
      id: want.id,
      stable: want.stable,
      stableName: state.stables.find((entry) => entry.id === want.stable)?.name ?? "unknown",
      price: want.price,
      lineage: want.lineage,
      season: want.season,
      age: state.season - want.season,
      mine: Boolean(stable && want.stable === stable.id),
    })),
    log: state.log,
    ledger: state.ledger,
    retirements: population.filter((horse) => horse.retired).length,
    certifyCost: CERTIFY_COST,
    prepCost: PREP_COST,
    items: Object.entries(ITEMS).map(([key, item]) => ({
      key,
      name: item.name,
      price: item.price,
      blurb: item.blurb,
      held: stable?.inventory?.[key] ?? 0,
    })),
    ranking: rankingOf(state),
    strawStorage: STRAW_STORAGE,
    round: state.meeting ?? 1,
    clock: state.clock
      ? { open: true, endsAt: state.clock.endsAt, round: state.clock.round }
      : null,
    windowSeconds: WINDOW_SECONDS,
    windowMinSeconds: WINDOW_MIN_SECONDS,
    windowMaxSeconds: WINDOW_MAX_SECONDS,
    meetingsPerSeason: MEETINGS_PER_SEASON,
    testGrant: TEST_TOOLS ? TEST_GRANT : 0,
    bankChoices: TEST_TOOLS ? BANK_CHOICES : [START_BANK],
    seasonReport: (stable && stable.seasonReport) || null,
    firsts: (stable && stable.firsts) || null,
    paddock: paddockOf(state),
    starterOffer: {
      available: Boolean(stable && !stable.starterOfferTaken),
      taken: Boolean(stable && stable.starterOfferTaken),
      price: STARTER_COVERING_PRICE,
    },
    coinPacks: TEST_TOOLS ? COIN_PACKS : [],
    careChoices: CARE_CHOICES.map((care) => ({
      care,
      cost: CARE_COST[care],
      catch: CARE_CATCH[care],
      value: CARE_VALUE[care],
    })),
    lastFoal: state.lastFoal ?? null,
    lastFoals: state.lastFoals ?? (state.lastFoal ? [state.lastFoal] : []),
    foaling: (state.foaling ?? []).map((row) => {
      const mare = horseById(state, row.mareId);
      const sire = horseById(state, row.sireId);
      return {
        id: row.id,
        mareId: row.mareId,
        mareName: mare ? mare.name : "unknown",
        sireName: sire ? sire.name : "unknown",
        care: row.care,
        fate: row.fate ?? null,
        fateNote: fateNote(row.fate),
        conceived: row.conceived,
        dueSeason: row.dueSeason,
        seasonsLeft: Math.max(0, row.dueSeason - state.season),
      };
    }),
    dueNextSeason: (state.foaling ?? []).filter((row) => row.dueSeason <= state.season + GESTATION_SEASONS).length,
    // The fee a stable actually pays. Season one is on the house, so any screen reading this
    // number agrees with what the meeting charges instead of promising 15 and taking nothing.
    entryFee: state.season <= 1 ? 0 : ENTRY_FEE,
    servicesPerSeason: SERVICES_PER_SEASON,
    mareCareer: MARE_CAREER_FOALS,
    stakesShare: STAKES_SHARE,
  };
}

/* ---- local room ---------------------------------------------------------
   The hosted game talks to a Durable Object room over a WebSocket. This build
   serves the SAME protocol in-page, so the rules and the screen above and below
   are untouched: only the transport differs, and progress saves to localStorage.
   ------------------------------------------------------------------------ */
// Versioned on purpose. The rung the free tier gives a stable has changed (a full yard,
// then mares, now one soulbound mare), so a save written by an earlier build would restore
// a game the rules no longer describe. Bump this whenever the starting shape changes.

export {
  AI_ACTIVE_CAP,
  AI_STABLES,
  AI_STIPEND,
  AI_TACTIC_ERROR,
  AI_TREASURY_CAP,
  BANK_CHOICES,
  BASE_FREQ,
  BASE_LIVE_RATE,
  BIG_GRANT,
  BREEDER_PREMIUM,
  CARE_CATCH,
  CARE_CHOICES,
  CARE_COST,
  CARE_VALUE,
  CERTIFY_COST,
  COIN_PACKS,
  CONDITIONS,
  CONDITION_CHARACTER,
  CONDITION_LABELS,
  CONDITION_ORDER,
  CONDITION_STRATEGY,
  DOMINANCE,
  DUTCH_DECAY,
  DUTCH_FLOOR,
  ENTRY_FEE,
  FATE_VIGOUR,
  FOAL_UPKEEP,
  FREQ_CACHE,
  GESTATION_FATES,
  GESTATION_SEASONS,
  HOUSE_DRAFT,
  HOUSE_HORSE_FLOOR,
  INBREED_FERTILITY,
  INBREED_VALUE_PENALTY,
  LINEAGES,
  LOCI,
  LOG_MAX,
  MARE_CAREER_FOALS,
  MARE_MAX_AGE,
  MARKET_RAKE,
  MAX_PRICE,
  MEETINGS_PER_SEASON,
  NOISE,
  PENSION_UPKEEP,
  PREFIXES,
  PURSE_SPLIT,
  PURSE_SUBSIDY,
  RACE_AGE,
  REPLAY_CHECKPOINTS,
  SELECT_FLOOR,
  SELECT_VIGOUR,
  SERVICES_PER_SEASON,
  SPECIALTY_FREQ,
  STAKES_SHARE,
  STALLION_MAX_AGE,
  STARTER_COVERING_PRICE,
  START_BANK,
  START_HORSES,
  STRAW_MARKET_PER_TURN,
  STRAW_STORAGE,
  SUFFIXES,
  TACTICS,
  TACTIC_GAIN,
  TEST_GRANT,
  TEST_TOOLS,
  TRAITS,
  UPKEEP_BASE,
  UPKEEP_EXPONENT,
  UPKEEP_TALENT,
  VIGOUR,
  WANT_LIMIT,
  WANT_MIN_QUALITY,
  WANT_TTL,
  WINDOW_MAX_SECONDS,
  WINDOW_MIN_SECONDS,
  WINDOW_SECONDS,
  adviceFor,
  aiConsignHorse,
  aiEnterMeeting,
  aiListStraws,
  aiPrepareSeason,
  alleleFrequencies,
  applyAction,
  burnHorse,
  certifyView,
  closeSeason,
  conditionFor,
  conditionNote,
  conditionScores,
  copy,
  expressed,
  fateNote,
  fieldStats,
  foalReport,
  freshStable,
  geneticValue,
  giveStartingStock,
  heterozygosity,
  horseById,
  horseName,
  inPlay,
  inbreedingLabel,
  instructionFor,
  log,
  makeFounder,
  makeHorse,
  meta,
  nextRandom,
  nextSeason,
  paceProfile,
  paddockOf,
  raceDiagnosis,
  rivalIntent,
  rollGestationFate,
  rollInt,
  rollValue,
  round,
  runMeeting,
  runRound,
  runTurnover,
  sampleAllele,
  scorePopulation,
  seedFrom,
  selectPrice,
  setCondition,
  setup,
  snapshotSeason,
  stableOf,
  strawsOf,
  suggestedHorsePrice,
  suggestedStrawPrice,
  takeLot,
  tierLines,
  traitValue,
  traitsOf,
  upkeepFor,
  validateAction,
  valueBand,
  viewFor,
  vigourFor,
};
