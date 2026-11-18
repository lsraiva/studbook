/**
 * The token packing. A horse is 48 bits of genotype plus the pedigree that makes it a lineage:
 * together they are 160 bits, which is one uint256 word. The creator address is the second word.
 *
 *   core  = genome(48) | lineage(8) | sex(8) | bornSeason(16) | sireId(32) | damId(32) | rulesVersion(16)
 *
 * Solidity mirrors this exactly in contracts/HorsePacked.sol; the vectors in
 * tests/token.test.mjs are the contract between the two.
 */

export const LAYOUT = [
  ["genome", 48n],
  ["lineage", 8n],
  ["sex", 8n],
  ["bornSeason", 16n],
  ["sireId", 32n],
  ["damId", 32n],
  ["rulesVersion", 16n],
];

export const CORE_BITS = LAYOUT.reduce((sum, [, bits]) => sum + bits, 0n); // 160

/** Bit offset of each field, low to high — the order the contract writes them in. */
export const OFFSETS = (() => {
  const out = {};
  let at = 0n;
  for (const [name, bits] of LAYOUT) {
    out[name] = { at, bits, mask: (1n << bits) - 1n };
    at += bits;
  }
  return out;
})();

const toBig = (value) => BigInt(value ?? 0);

export function packCore(horse) {
  let word = 0n;
  for (const [name] of LAYOUT) {
    const { at, mask } = OFFSETS[name];
    const raw = toBig(horse[name]);
    if (raw < 0n) throw new Error(`${name} cannot be negative`);
    if (raw > mask) throw new Error(`${name}=${raw} does not fit in ${OFFSETS[name].bits} bits`);
    word |= (raw & mask) << at;
  }
  return word;
}

export function unpackCore(word) {
  const big = toBig(word);
  const out = {};
  for (const [name] of LAYOUT) {
    const { at, mask } = OFFSETS[name];
    out[name] = (big >> at) & mask;
  }
  return out;
}

/** The whole token: a core word plus the creator address (160 bits). */
export function packHorse(horse) {
  return { core: packCore(horse), creator: toBig(horse.creator ?? 0) };
}

export function unpackHorse({ core, creator }) {
  const fields = unpackCore(core);
  const address = toBig(creator);
  if (address > (1n << 160n) - 1n) throw new Error("creator is not an address");
  return { ...fields, creator: address };
}

/** The token id is the core word: unique per horse, readable at a glance, and never recycled. */
export const tokenIdOf = (horse) => packCore(horse);
