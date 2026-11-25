/**
 * Visual identity for every horse.
 *
 * Deliberately derived from the public horse id (and breeding line), never from
 * hidden genotype or performance traits. A horse therefore looks the same in the
 * yard, market, race and 3D viewer without revealing an uncertified genotype.
 * This is not a coat-genetics simulation and has no effect on racing.
 */

const COATS = [
  { key: "bay", en: "Bay", pt: "Castanho", body: "#7a4b2e", mane: "#241a14", filter: "sepia(.45) saturate(1.25) brightness(.82)" },
  { key: "chestnut", en: "Chestnut", pt: "Alazão", body: "#8f4b2b", mane: "#a9603a", filter: "sepia(.65) saturate(1.5) brightness(.95)" },
  { key: "buckskin", en: "Buckskin", pt: "Baio", body: "#b58a57", mane: "#2a2019", filter: "sepia(.55) saturate(1.15) brightness(1.12)" },
  { key: "grey", en: "Grey", pt: "Tordilho", body: "#a9a9a2", mane: "#e2ded4", filter: "grayscale(.92) brightness(1.18) contrast(.95)" },
  { key: "black", en: "Black", pt: "Preto", body: "#332e2a", mane: "#1a1816", filter: "grayscale(1) brightness(.42) contrast(1.15)" },
  { key: "roan", en: "Roan", pt: "Rosilho", body: "#9c6b58", mane: "#6b4a3e", filter: "grayscale(.45) sepia(.4) brightness(1.02)" },
  { key: "palomino", en: "Palomino", pt: "Palomino", body: "#c9a263", mane: "#f0e3c3", filter: "sepia(.45) saturate(1.35) brightness(1.28)" },
  { key: "cremello", en: "Cremello", pt: "Isabelino", body: "#d8c9ad", mane: "#f7efdd", filter: "grayscale(.65) sepia(.3) brightness(1.4)" },
];

const BLAZES = [
  { key: "plain", en: "plain face", pt: "cara limpa", width: 0 },
  { key: "star", en: "star", pt: "estrela", width: 1 },
  { key: "stripe", en: "stripe", pt: "lista", width: 2 },
  { key: "blaze", en: "blaze", pt: "blaze", width: 3 },
];

export const PHENOTYPE_VERSION = 1;

/** FNV-1a over stable public fields. */
function digest(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function pick(bits, shift, size) {
  return Math.floor((bits >>> shift) % size);
}

/**
 * A stable appearance for one horse. Pure: id + lineage in, same profile out.
 * Socks are a bitmask over the four legs; blaze width 0–3 is a white face mark.
 */
export function appearanceFor(horse) {
  const id = String(horse?.id ?? "unknown");
  const lineage = String(horse?.lineage ?? "");
  const seed = digest(`studbook:appearance:${PHENOTYPE_VERSION}|${lineage}|${id}`);
  const coat = COATS[seed % COATS.length];
  const footwear = pick(seed, 5, 5); // 0–4 white socks
  const legs = [1, 2, 3, 4].filter((leg) => footwear >= leg);
  const blaze = BLAZES[pick(seed, 9, BLAZES.length)];
  const maneSide = pick(seed, 14, 2) === 0 ? "left" : "right";
  return {
    version: PHENOTYPE_VERSION,
    seed,
    coat: coat.key,
    coatName: coat.en,
    coatNamePt: coat.pt,
    bodyColor: coat.body,
    maneColor: coat.mane,
    filter: coat.filter,
    blaze: blaze.key,
    blazeWidth: blaze.width,
    blazeName: blaze.en,
    socksMask: footwear,
    sockCount: footwear,
    sockLegs: [...new Set(legs)],
    maneSide,
    label: `${coat.en} · ${blaze.key === "plain" ? "plain face" : blaze.key}${footwear ? ` · ${footwear} sock${footwear === 1 ? "" : "s"}` : ""}`,
    labelPt: `${coat.pt} · ${blaze.pt}${footwear ? ` · ${footwear} ${footwear === 1 ? "meia" : "meias"}` : ""}`,
  };
}

/** Explicit look for studio renders; same shape as appearanceFor. */
export function appearanceFromSpec({ coat = "bay", socks = 0, blaze = 0 } = {}) {
  const chosen = COATS.find((entry) => entry.key === coat) ?? COATS[0];
  const mark = BLAZES[Math.max(0, Math.min(3, Number(blaze) || 0))];
  const count = Math.max(0, Math.min(4, Number(socks) || 0));
  return {
    version: PHENOTYPE_VERSION, seed: 0, coat: chosen.key,
    coatName: chosen.en, coatNamePt: chosen.pt,
    bodyColor: chosen.body, maneColor: chosen.mane,
    filter: chosen.filter,
    blaze: mark.key, blazeWidth: mark.width, blazeName: mark.en,
    socksMask: count, sockCount: count,
    sockLegs: [1, 2, 3, 4].filter((leg) => count >= leg),
    maneSide: "right",
    label: `${chosen.en} · ${mark.en}${count ? ` · ${count} sock${count === 1 ? "" : "s"}` : ""}`,
    labelPt: `${chosen.pt} · ${mark.pt}${count ? ` · ${count} ${count === 1 ? "meia" : "meias"}` : ""}`,
  };
}

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

/**
 * Coat-coloured identity badge reusing the page's own horse symbol. No new art
 * files and no user text inside the markup.
 */
export function coatSvg(appearance, className = "coat-badge") {
  if (!appearance) return "";
  const socks = appearance.sockLegs ?? [];
  const legX = { 1: 30, 2: 44, 3: 58, 4: 70 };
  const white = "#f2ece0";
  const blaze = appearance.blazeWidth ?? 0;
  return `<svg class="${escape(className)}" viewBox="0 0 120 90" role="img" aria-label="${escape(appearance.label)}">` +
    `<use href="#horse" style="color:${escape(appearance.bodyColor)}"/>` +
    `<path d="M26 33 q10-11 23-11 l0 6 q-13 0-20 9 z" fill="${escape(appearance.maneColor)}" opacity=".9"/>` +
    `<rect x="17" y="32" width="5" height="30" rx="2" fill="${escape(appearance.maneColor)}" opacity=".7"/>` +
    socks.map((leg) => `<rect x="${legX[leg] - 1}" y="67" width="9" height="10" rx="2" fill="${white}"/>`).join("") +
    (blaze ? `<g transform="rotate(-32 93 15)"><rect x="${blaze === 3 ? 90 : 91.5}" y="7" width="${blaze === 1 ? 3 : blaze === 2 ? 1.7 : 4.5}" height="${blaze === 1 ? 5 : blaze === 2 ? 14 : 17}" rx="1.3" fill="${white}"/></g>` : "") +
    `</svg>`;
}
