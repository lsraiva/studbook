#!/usr/bin/env node
/**
 * The stable album and the depth of a yard's own breeding, read from the state as it is.
 *
 *   node tests/album.test.mjs
 */
import { setup, runRound, viewFor, applyAction, validateAction } from "../assets/engine.js";

let bad = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) bad += 1;
};

/** Play seasons as a breeder: keep a covering in the barn and cover every mare that can be. */
function breederGame(seed, seasons) {
  let state = setup(["p"], seed);
  const act = (action) => { const v = validateAction(state, "p", action); if (v.ok) state = applyAction(state, "p", action); return v.ok; };
  state.stables.find((s) => s.player).guineas += 20000;
  act({ type: "takeStarterOffer" });
  for (let round = 0; round < seasons * 4; round += 1) {
    let view = viewFor(state, "p");
    for (const mare of view.horses.filter((h) => h.sex === "F" && !h.retired && !h.inFoal)) {
      view = viewFor(state, "p");
      let straw = view.straws[0];
      if (!straw) {
        const lot = view.listings.filter((l) => l.kind !== "horse" && !l.mine).sort((a, b) => a.price - b.price)[0];
        if (lot && act({ type: "buyStraw", listingId: lot.id })) straw = viewFor(state, "p").straws[0];
      }
      if (!straw) break;
      act({ type: "selectStraw", strawId: straw.id });
      act({ type: "breed", mareId: mare.id, strawId: straw.id, care: "plain" });
    }
    state = runRound(state, "");
  }
  return state;
}

const fresh = viewFor(setup(["p"], "album:fresh"), "p").stable;
ok("a new yard's album holds its one horse, not bred here", fresh.album.length === 1 && fresh.album[0].here && !fresh.album[0].bred && fresh.bredCount === 0 && fresh.generations === 0);

let state = breederGame("album:test", 9);
let stable = viewFor(state, "p").stable;
const mine = state.stables.find((s) => s.player);
ok("every foal the yard bred is counted", stable.bredCount === mine.foalsBred.length && stable.bredCount >= 3, String(stable.bredCount));
ok("the album has every bred horse and every horse held", mine.foalsBred.every((id) => stable.album.some((r) => r.id === id && r.bred)) && mine.horses.every((id) => stable.album.some((r) => r.id === id && r.here)));
ok("an album row carries only what a picture needs", stable.album.every((r) => JSON.stringify(Object.keys(r).sort()) === '["bred","here","id","lineage","name"]'));
ok("breeding from a home-bred mare makes a second generation", stable.generations >= 2, String(stable.generations));

// a home-bred horse sold to the house stays in the album
{
  const sellable = viewFor(state, "p").horses.find((h) => mine.foalsBred.includes(h.id) && !h.soulbound && !h.inFoal);
  if (sellable && validateAction(state, "p", { type: "sell", horseId: sellable.id }).ok) {
    state = applyAction(state, "p", { type: "sell", horseId: sellable.id });
    stable = viewFor(state, "p").stable;
    const row = stable.album.find((r) => r.id === sellable.id);
    ok("a home-bred horse that was sold keeps its place in the album", Boolean(row) && row.bred && !row.here && row.name === sellable.name, JSON.stringify(row));
    ok("...and the count of foals bred does not fall", stable.bredCount === mine.foalsBred.length);
  } else {
    ok("a home-bred horse could be sold for this check", false, "no sellable home-bred horse in this seed");
  }
}

console.log(bad ? `\n${bad} album case(s) failed.` : "\nalbum cases passed.");
process.exit(bad ? 1 : 0);
