#!/usr/bin/env node
/**
 * Engine tests. No browser, no DOM: the engine is a plain module over a plain state.
 *
 *   node tests/engine.test.mjs                     # local
 *   node tests/engine.test.mjs /tmp/engine.js      # a downloaded build
 */
const enginePath = process.argv[2] ?? new URL("../assets/engine.js", import.meta.url).href;
const E = await import(enginePath);

let bad = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) bad += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
};

/* ---------- 1. no free money ---------- */
let s = E.setup(["t"], "suite");
const st = () => E.stableOf(s, "t");
ok("testing tools are off", E.TEST_TOOLS === false);
ok("addCoins refused", !E.validateAction(s, "t", { type: "addCoins", pack: "chest" }).ok);
ok("testGrant refused", !E.validateAction(s, "t", { type: "testGrant", amount: 50000 }).ok);
ok("non-standard bank refused", !E.validateAction(s, "t", { type: "startOver", bank: 50000 }).ok);

/* ---------- 2. a lot cannot change kind ---------- */
const lot = s.listings.find((l) => l.kind === "horse");
s = E.applyAction(s, "t", { type: "buyHorse", listingId: lot.id });
const mine = st().horses.map((id) => E.horseById(s, id)).find((h) => !h.soulbound);
s = E.applyAction(s, "t", { type: "listHorse", horseId: mine.id, price: 400 });
const horseLot = s.listings.find((l) => l.kind === "horse" && l.seller === "st1");
ok("unlistStraw on a horse lot is refused", !E.validateAction(s, "t", { type: "unlistStraw", listingId: horseLot.id }).ok);
ok("the horse lot stays on the market", s.listings.some((l) => l.id === horseLot.id));

/* ---------- 3. the straw path still works ---------- */
s = E.applyAction(s, "t", { type: "takeStarterOffer" });
const straw = st().straws[0];
s = E.applyAction(s, "t", { type: "listStraw", strawId: straw.id, price: 80 });
const strawLot = s.listings.find((l) => l.seller === "st1" && l.straw);
s = E.applyAction(s, "t", { type: "unlistStraw", listingId: strawLot.id });
ok("straw round trip works", st().straws.some((x) => x && x.id === strawLot.straw.id));
ok("no undefined straws", st().straws.every(Boolean));

/* ---------- 4. a price is a number someone can pay ---------- */
let p4 = E.setup(["t"], "price");
const p4lot = p4.listings.find((l) => l.kind === "horse");
p4 = E.applyAction(p4, "t", { type: "buyHorse", listingId: p4lot.id });
const tooHigh = E.validateAction(p4, "t", { type: "listHorse", horseId: p4lot.horseId, price: 1e9 });
ok("absurd price is refused", !tooHigh.ok && /100000/.test(tooHigh.error ?? ""), tooHigh.error);

/* ---------- 5. the house burns what it takes ---------- */
let burn = E.setup(["t"], "burn");
const stallionLot = burn.listings.find((l) => l.kind === "horse" && E.horseById(burn, l.horseId)?.sex === "M");
burn = E.applyAction(burn, "t", { type: "buyHorse", listingId: stallionLot.id });
const stallion = E.horseById(burn, stallionLot.horseId);
const beforeCount = burn.horses.length;
burn = E.applyAction(burn, "t", { type: "sell", horseId: stallion.id });
ok("sold horse leaves the yard", burn.horses.length === beforeCount - 1);
ok("...and is archived, not lost", Boolean((burn.gone ?? []).find((g) => g.id === stallion.id)));
ok("...and a straw still prices from him", Number.isFinite(E.suggestedStrawPrice(E.horseById(burn, stallion.id))));

/* ---------- 6. certification is what buys the traits ---------- */
let cert = E.setup(["t"], "cert");
const foreign = cert.listings.find((l) => l.kind === "horse" && l.seller === "house");
ok("uncertified lot hides its traits", E.viewFor(cert, "t").listings.find((l) => l.id === foreign.id).horseTraits === null);
cert = E.applyAction(cert, "t", { type: "certify", horseId: foreign.horseId });
ok("certified lot shows its traits", Boolean(E.viewFor(cert, "t").listings.find((l) => l.id === foreign.id).horseTraits));

/* ---------- 7. two new games are not the same board ---------- */
const a = E.setup(["t"]), b = E.setup(["t"]);
ok("seeds differ per game", a.seed !== b.seed);
const same = E.setup(["t"], "fixed"), same2 = E.setup(["t"], "fixed");
ok("a fixed salt reproduces a game", JSON.stringify(same.horses.map((h) => h.name)) === JSON.stringify(same2.horses.map((h) => h.name)));

/* ---------- 8. rivals stay solvent and finite ---------- */
let rival = E.setup(["t"], "rivals");
for (let i = 0; i < 90; i += 1) rival = E.applyAction(rival, "t", { type: "advance" });
const ai = rival.stables.filter((x) => x.id.startsWith("ai"));
ok("rival balances stay finite", ai.every((x) => Number.isFinite(x.guineas)) && ai.some((x) => x.guineas > 500),
   ai.map((x) => Math.round(x.guineas)).join(", "));

/* ---------- 9. a forced sale pays, and burns ---------- */
let broke = E.setup(["t"], "broke");
const lot2 = broke.listings.find((l) => l.kind === "horse");
broke = E.applyAction(broke, "t", { type: "buyHorse", listingId: lot2.id });
broke.stables.find((x) => x.id === "st1").guineas = 0;
const goneBefore = (broke.gone ?? []).length;
for (let i = 0; i < 3; i += 1) broke = E.applyAction(broke, "t", { type: "advance" }); // a season is three meetings
const me = broke.stables.find((x) => x.id === "st1");
ok("forced sale leaves no debt and pays something", me.guineas >= 0 && me.forcedSales >= 1,
   `guineas ${Math.round(me.guineas)}, forced ${me.forcedSales}`);
ok("...and the horse is burnt", (broke.gone ?? []).length > goneBefore);

/* ---------- 10. fuzz: no action throws ---------- */
const rnd = (n) => Math.floor(Math.random() * n);
let f = E.setup(["t"], "fuzz"), crashes = 0;
for (let i = 0; i < 800; i += 1) {
  const fst = E.stableOf(f, "t");
  const herd = fst.horses.map((id) => E.horseById(f, id));
  const cands = [{ type: "advance" }];
  const runners = herd.filter((h) => h.age >= 2 && !h.retired);
  if (runners.length) cands.push({ type: "enter", horseIds: runners.slice(0, 3).map((h) => h.id) });
  if (fst.straws.length) cands.push({ type: "listStraw", strawId: fst.straws[0].id, price: 50 + rnd(150) });
  const mare = herd.find((h) => h.sex === "F" && !h.retired && h.age <= 12);
  if (mare && fst.straws.length) cands.push({ type: "breed", mareId: mare.id, strawId: fst.straws[0].id, care: "plain" });
  const other = f.listings.find((l) => l.kind === "horse" && l.seller !== "st1");
  if (other) cands.push({ type: "buyHorse", listingId: other.id });
  const action = cands[rnd(cands.length)];
  if (!E.validateAction(f, "t", action).ok) continue;
  try {
    f = E.applyAction(f, "t", action);
    E.viewFor(f, "t");
  } catch (e) {
    crashes += 1;
    console.log("   crash on", JSON.stringify(action), e.message);
    break;
  }
}
ok("fuzz of 800 actions, no crash", crashes === 0, `season ${f.season}`);

console.log(bad ? `\n${bad} failing` : "\nall green");
process.exit(bad ? 1 : 0);
