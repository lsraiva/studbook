#!/usr/bin/env node
/**
 * The token packing. Solidity writes the same word in contracts/HorsePacked.sol, and the fixed
 * vector below is the contract between the two: if this vector changes, both sides are wrong.
 *
 *   node tests/token.test.mjs
 */
import { CORE_BITS, LAYOUT, OFFSETS, packCore, packHorse, tokenIdOf, unpackCore, unpackHorse } from "../assets/token.js";

let bad = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) bad += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
};

/* ---------- 1. the space is 160 bits of a uint256 ---------- */
ok("the core is 160 bits", CORE_BITS === 160n, `${CORE_BITS}`);
ok("the fields are laid out low to high",
  LAYOUT.map(([name]) => name).join(",") === "genome,lineage,sex,bornSeason,sireId,damId,rulesVersion");
ok("no two fields overlap", LAYOUT.every(([name], index) => {
  const { at } = OFFSETS[name];
  const previous = index === 0 ? null : OFFSETS[LAYOUT[index - 1][0]];
  return at === (previous ? previous.at + previous.bits : 0n);
}));

/* ---------- 2. the vector both languages must agree on ---------- */
const VECTOR = {
  genome: 0x3F0F0FF00FFn,
  lineage: 3n,
  sex: 1n,
  bornSeason: 7n,
  sireId: 12n,
  damId: 34n,
  rulesVersion: 2n,
};
const VECTOR_CORE = 0x2000000220000000c0007010303f0f0ff00ffn;
const VECTOR_CREATOR = 0x00000000000000000000000000000000000a11cen;

ok("the fixed vector packs to the documented word", packCore(VECTOR) === VECTOR_CORE, "0x" + packCore(VECTOR).toString(16));
const back = unpackCore(VECTOR_CORE);
ok("...and unpacks field for field",
  Object.entries(VECTOR).every(([key, value]) => back[key] === value),
  Object.entries(VECTOR).map(([k, v]) => `${k}=${back[k]}`).join(" "));

/* ---------- 3. every field survives its own maximum, alone ---------- */
for (const [name, bits] of LAYOUT) {
  const max = (1n << bits) - 1n;
  const only = { genome: 0n, lineage: 0n, sex: 0n, bornSeason: 0n, sireId: 0n, damId: 0n, rulesVersion: 0n, [name]: max };
  const round = unpackCore(packCore(only));
  ok(`${name} survives its own maximum`,
    round[name] === max && Object.keys(only).every((k) => k === name || round[k] === 0n), `max ${max}`);
}

/* ---------- 4. the whole token, address included ---------- */
const horse = { ...VECTOR, creator: VECTOR_CREATOR };
const packed = packHorse(horse);
ok("the token is two words", packed.core === VECTOR_CORE && packed.creator === VECTOR_CREATOR);
const whole = unpackHorse(packed);
ok("creator survives the second word", whole.creator === VECTOR_CREATOR);
ok("all eight fields survive together",
  ["genome", "lineage", "sex", "bornSeason", "sireId", "damId", "rulesVersion", "creator"]
    .every((key) => whole[key] === horse[key]),
  Object.keys(horse).join(","));

/* ---------- 5. the packing refuses what does not fit ---------- */
const refuse = (mutate, label) => {
  try {
    packCore({ ...VECTOR, ...mutate });
    ok(label, false, "no error thrown");
  } catch {
    ok(label, true);
  }
};
refuse({ lineage: 256n }, "lineage of 256 is refused");
refuse({ sex: 256n }, "sex of 256 is refused");
refuse({ bornSeason: 65536n }, "season beyond 16 bits is refused");
refuse({ sireId: 1n << 32n }, "sire beyond 32 bits is refused");
refuse({ genome: 1n << 48n }, "genome beyond 48 bits is refused");
refuse({ rulesVersion: -1n }, "a negative version is refused");
try {
  unpackHorse({ core: 0n, creator: 1n << 160n });
  ok("a creator wider than an address is refused", false, "no error thrown");
} catch {
  ok("a creator wider than an address is refused", true);
}

/* ---------- 6. random horses, deterministic ---------- */
let seed = 12345n;
const next = () => (seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n));
let misses = 0;
for (let i = 0; i < 200; i += 1) {
  const random = {
    genome: next() & ((1n << 48n) - 1n),
    lineage: (next() % 8n) + 1n,
    sex: next() % 2n,
    bornSeason: next() % 65536n,
    sireId: next() & 0xffffffffn,
    damId: next() & 0xffffffffn,
    rulesVersion: next() % 65536n,
    creator: next() & ((1n << 160n) - 1n),
  };
  const round = unpackHorse(packHorse(random));
  if (Object.keys(random).some((key) => round[key] !== random[key])) misses += 1;
}
ok("200 random horses round trip", misses === 0, `${misses} miss(es)`);

/* ---------- 7. the token id is the animal ---------- */
ok("tokenIdOf is the core word", tokenIdOf(horse) === VECTOR_CORE);
ok("two horses with different sires still differ", packCore({ ...VECTOR, sireId: 13n }) !== VECTOR_CORE);

console.log(bad ? `\n${bad} failing` : "\nall green");
process.exit(bad ? 1 : 0);
