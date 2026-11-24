#!/usr/bin/env node
/** F2-01 — global ids, ledger rules and the import dry run, on synthetic data only. */
import assert from "node:assert/strict";
import { uuidV5, isUuid, horseKey, stableKey, accountKey } from "../server/domain/ids.mjs";
import { createMemoryLedger, salePostings, marketRake, stableAccount, HOUSE, LedgerError } from "../server/domain/ledger.mjs";
import { planImport } from "../server/domain/import-plan.mjs";

let n = 0;
const test = (label, fn) => { fn(); n += 1; console.log(`PASS ${label}`); };

test("uuidV5 matches the RFC 4122 reference vector", () => {
  // python: uuid.uuid5(uuid.NAMESPACE_DNS, "python.org")
  assert.equal(uuidV5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"), "886313e1-3b8a-5372-9b90-0c9aee199e5d");
});
test("keys are deterministic, valid and distinct per entity", () => {
  assert.equal(horseKey("r1", "h5"), horseKey("r1", "h5"));
  assert.notEqual(horseKey("r1", "h5"), horseKey("r2", "h5"));
  assert.notEqual(stableKey("u1"), accountKey("u1"));
  assert.ok([horseKey("r1", "h5"), stableKey("u1")].every(isUuid));
});

const A = stableAccount(stableKey("ua"));
const B = stableAccount(stableKey("ub"));
const seeded = () => {
  const ledger = createMemoryLedger();
  ledger.post({ key: "opening:a", kind: "opening_balance", postings: [{ account: HOUSE.treasury, amount: -1000 }, { account: A, amount: 1000 }] });
  return ledger;
};

test("unbalanced and fractional entries are refused", () => {
  const ledger = seeded();
  assert.throws(() => ledger.post({ key: "bad:unbalanced", kind: "x", postings: [{ account: A, amount: -10 }, { account: B, amount: 9 }] }), (e) => e.code === "unbalanced");
  assert.throws(() => ledger.post({ key: "bad:fraction", kind: "x", postings: [{ account: A, amount: -1.5 }, { account: B, amount: 1.5 }] }), (e) => e.code === "amount");
});
test("a stable cannot go below zero, the house can", () => {
  const ledger = seeded();
  assert.throws(() => ledger.post({ key: "over:draw", kind: "purchase", postings: [{ account: A, amount: -1001 }, { account: HOUSE.sink, amount: 1001 }] }), (e) => e.code === "funds");
  assert.equal(ledger.balance(A), 1000);
  assert.equal(ledger.balance(HOUSE.treasury), -1000);
});
test("idempotent replay returns the same entry; a different body conflicts", () => {
  const ledger = seeded();
  const sale = { key: "sale:lot-1", kind: "market_sale", postings: salePostings({ buyer: A, seller: B, price: 100 }) };
  const first = ledger.post(sale);
  const again = ledger.post(structuredClone(sale));
  assert.equal(again.replayed, true);
  assert.equal(again.entry.id, first.entry.id);
  assert.equal(ledger.balance(A), 900);
  assert.throws(() => ledger.post({ ...sale, postings: salePostings({ buyer: A, seller: B, price: 101 }) }), (e) => e instanceof LedgerError && e.code === "conflict");
});
test("a sale splits exactly: buyer −price, seller +95%, house +5%", () => {
  const ledger = seeded();
  ledger.post({ key: "sale:lot-2", kind: "market_sale", postings: salePostings({ buyer: A, seller: B, price: 333 }) });
  assert.equal(marketRake(333), 17);
  assert.deepEqual([ledger.balance(A), ledger.balance(B), ledger.balance(HOUSE.fees)], [667, 316, 17]);
  assert.ok(ledger.audit().ok);
});
test("entries are frozen (append-only)", () => {
  const ledger = seeded();
  const [entry] = ledger.entries();
  assert.throws(() => { entry.postings[0].amount = 5; });
});

/* ---------- import dry run ---------- */
const horse = (id, owner, extra = {}) => ({ id, owner, name: id, sex: "F", lineage: "L1", genome: { a: [1, 2] }, bornSeason: 1, sire: null, dam: null, ...extra });
const fixture = () => ({
  users: [{ id: "ua", email: "a@studbook.test" }, { id: "ub", email: "b@studbook.test" }, { id: "uc", email: "c@studbook.test" }],
  rooms: [
    { id: "r1", state: { players: ["ua"], stables: [{ id: "st1", player: "ua", guineas: 1500, horses: ["h1", "h2"] }, { id: "ai1", player: null, guineas: 9000, horses: ["h3"] }],
      horses: [horse("h1", "st1"), horse("h2", "st1", { dam: "h1", sire: "h0" }), horse("h3", "ai1")], gone: [horse("h0", null, { sex: "M" })] } },
    { id: "r2", state: { players: ["ub"], stables: [{ id: "st1", player: "ub", guineas: 0, horses: ["h1"] }],
      horses: [horse("h1", "st1", { originRoomId: "r1x" })], gone: [] } },
  ],
});

test("a consistent fixture imports with balances equal to guineas", () => {
  const plan = planImport(fixture());
  assert.equal(plan.ok, true, plan.problems.join("; "));
  assert.deepEqual(plan.counts, { accounts: 3, stables: 3, humanStables: 2, horses: 4, entries: 2, humanGuineas: 1500 });
  assert.equal(plan.ledger.balance(stableAccount(stableKey("ua"))), 1500);
  assert.ok(plan.warnings.some((w) => w.includes("uc") && w.includes("no stable")), "a legacy account without a stable is reported, not recreated");
  const foal = plan.rows.horses.find((h) => h.legacyId === "h2");
  assert.equal(foal.sireId, horseKey("r1", "h0"));
});
test("the import is repeatable: same keys on a second run", () => {
  const a = planImport(fixture()).rows.horses.map((h) => h.id).sort();
  const b = planImport(fixture()).rows.horses.map((h) => h.id).sort();
  assert.deepEqual(a, b);
});
test("an account seated in two rooms breaks G1", () => {
  const data = fixture();
  data.rooms[1].state.stables[0].player = "ua";
  assert.ok(planImport(data).problems.some((p) => p.startsWith("G1")));
});
test("a horse listed by one stable but owned by another breaks G3", () => {
  const data = fixture();
  data.rooms[0].state.horses[0].owner = "ai1";
  assert.ok(planImport(data).problems.some((p) => p.startsWith("G3")));
});
test("negative or fractional guineas break G4", () => {
  const data = fixture();
  data.rooms[0].state.stables[0].guineas = -5;
  assert.ok(planImport(data).problems.some((p) => p.startsWith("G4")));
});

console.log(`${n} ledger/import cases passed.`);
