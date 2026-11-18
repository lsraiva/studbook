#!/usr/bin/env node
/**
 * Economy report. Plays a passive game for N seasons and prints what the numbers do.
 *   node tools/economy-report.mjs [seasons]
 */
import { setup, applyAction } from "../assets/engine.js";

const seasons = Number(process.argv[2] ?? 120);
let s = setup(["report"], "economy-report");
const money = () => s.stables.reduce((n, x) => n + x.guineas, 0);
const rows = [];
for (let i = 0; i < seasons * 3; i += 1) {
  s = applyAction(s, "report", { type: "advance" });
  if (s.season % 20 === 0 && !rows.some((r) => r.season === s.season)) {
    rows.push({
      season: s.season,
      money: Math.round(money()),
      rivals: Math.round(s.stables.filter((x) => x.id.startsWith("ai")).reduce((n, x) => n + x.guineas, 0)),
      alive: s.horses.filter((h) => !h.sold && !h.retired && h.owner).length,
      burnt: (s.gone ?? []).length,
      lots: s.listings.length,
      kb: Math.round(JSON.stringify(s).length / 1024),
    });
  }
}

console.log("season  money  rivals  alive  burnt  lots  save KB");
for (const r of rows) {
  console.log([r.season, r.money, r.rivals, r.alive, r.burnt, r.lots, r.kb].map((v, i) => String(v).padStart(i === 0 ? 6 : 7)).join(" "));
}
const first = rows[1] ?? rows[0];
const last = rows.at(-1);
const drift = last.money - first.money;
console.log(
  `\nmoney drift over ${last.season - first.season} seasons: ${drift >= 0 ? "+" : ""}${drift} GNS` +
    ` (${(drift / (last.season - first.season)).toFixed(1)}/season) · ` +
    `alive ${first.alive} → ${last.alive} · burnt ${first.burnt} → ${last.burnt}`,
);
