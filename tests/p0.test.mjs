#!/usr/bin/env node
/**
 * Report P0 fixes that live in the rules: a yard with nothing left is shown the way back in.
 *
 *   node tests/p0.test.mjs
 */
import { setup, viewFor, horseById, validateAction } from "../assets/engine.js";

let bad = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) bad += 1;
};

const s = setup(["p"], "p0:deadend");
const mine = s.stables.find((st) => st.player);
mine.starterOfferTaken = true;
for (const id of mine.horses) horseById(s, id).retired = true;

let step = viewFor(s, "p").nextStep;
ok("a yard with every horse retired is named the way back in", step.key === "rebuild", step.text);
ok("...with a buy action for a lot it can afford", step.action?.type === "buyHorse" && validateAction(s, "p", step.action).ok, JSON.stringify(step.action));
const lot = s.listings.find((l) => l.id === step.action.listingId);
ok("...and that lot is in the horse ring at or under the balance", lot && lot.kind === "horse" && lot.price <= mine.guineas);

mine.guineas = 0;
step = viewFor(s, "p").nextStep;
ok("with no money the step still explains instead of going silent", step.key === "rebuild" && step.action === null && /no lot/.test(step.text), step.text);

const offer = viewFor(setup(["p"], "p0:offer"), "p").horses[0];
ok("every horse in the view carries the house's offer for the sell button", Number.isFinite(offer.houseOffer) && offer.houseOffer > 0, String(offer.houseOffer));

console.log(bad ? `\n${bad} p0 case(s) failed.` : "\np0 cases passed.");
process.exit(bad ? 1 : 0);
