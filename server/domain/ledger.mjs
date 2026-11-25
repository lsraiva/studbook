/**
 * F2-01/F2-03 groundwork — a double-entry GNS ledger with idempotent posting.
 *
 * This is the in-memory adapter: the contract that the Postgres adapter (F2-02, needs
 * provider/region/budget approval) must satisfy, and the mock the tests and the import
 * dry-run use today. It is NOT wired into the live server; balances in production still
 * live in room JSON until a reconciled cut-over is approved.
 *
 * Rules (mirrored by CHECKs/triggers in db/schema.sql):
 *  L1 amounts are safe integers (whole guineas); every entry sums to zero
 *  L2 a stable account never goes below zero; house accounts may (they issue/absorb)
 *  L3 an idempotency key posts at most once; a replay with the same body returns the
 *     original entry, a replay with a different body is a conflict
 *  L4 entries are append-only; a correction is a new reversing entry
 */
import { createHash, randomUUID } from "node:crypto";

export const MARKET_FEE_BPS = 500; // 5%, the same rake the in-room and cross-room markets charge
export const HOUSE = Object.freeze({
  treasury: "house:treasury", // issues opening balances, prizes, starter funds
  fees: "house:fees", // receives the market rake
  sink: "house:sink", // absorbs spending on coverings, care, entry fees
});

export const stableAccount = (stableUuid) => `stable:${stableUuid}`;
const isHouse = (account) => account.startsWith("house:");

export class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fingerprint = (body) => createHash("sha256").update(JSON.stringify(body)).digest("hex");

export function marketRake(price) {
  return Math.round((price * MARKET_FEE_BPS) / 10_000);
}

/** Postings for a sale: the buyer pays in full, the seller nets price − rake, the house keeps the rake. */
export function salePostings({ buyer, seller, price }) {
  if (!Number.isSafeInteger(price) || price <= 0) throw new LedgerError("amount", "a price is a positive whole number of guineas");
  const rake = marketRake(price);
  const postings = [{ account: buyer, amount: -price }, { account: HOUSE.fees, amount: rake }];
  // A lot without a seller (house consignment) pays the remainder to the sink.
  postings.push({ account: seller ?? HOUSE.sink, amount: price - rake });
  return postings;
}

export function createMemoryLedger({ now = () => new Date().toISOString(), newId = randomUUID } = {}) {
  const entries = []; // append-only
  const byKey = new Map(); // idempotency key -> { entry, fingerprint }
  const balances = new Map(); // account -> integer

  function validate(postings) {
    if (!Array.isArray(postings) || postings.length < 2) throw new LedgerError("shape", "an entry has at least two postings");
    let sum = 0;
    const seen = new Set();
    for (const { account, amount } of postings) {
      if (typeof account !== "string" || !/^(house:[a-z]+|stable:[0-9a-f-]{36})$/.test(account)) throw new LedgerError("account", `unknown account ${account}`);
      if (!Number.isSafeInteger(amount) || amount === 0) throw new LedgerError("amount", "amounts are non-zero whole guineas");
      if (seen.has(account)) throw new LedgerError("shape", "one posting per account per entry");
      seen.add(account);
      sum += amount;
    }
    if (sum !== 0) throw new LedgerError("unbalanced", `entry does not balance (${sum})`);
  }

  return {
    /** Post atomically. Returns { entry, replayed }. */
    post({ key, kind, postings, meta = {} }) {
      if (typeof key !== "string" || key.length < 8 || key.length > 200) throw new LedgerError("key", "an idempotency key is required");
      const body = { kind, postings, meta };
      const print = fingerprint(body);
      const prior = byKey.get(key);
      if (prior) {
        if (prior.fingerprint !== print) throw new LedgerError("conflict", "idempotency key reused with a different entry");
        return { entry: prior.entry, replayed: true };
      }
      validate(postings);
      for (const { account, amount } of postings) {
        if (!isHouse(account) && (balances.get(account) ?? 0) + amount < 0) throw new LedgerError("funds", `${account} cannot go below zero`);
      }
      const entry = Object.freeze({ id: newId(), key, kind, at: now(), meta: structuredClone(meta), postings: Object.freeze(postings.map((p) => Object.freeze({ ...p }))) });
      for (const { account, amount } of postings) balances.set(account, (balances.get(account) ?? 0) + amount);
      entries.push(entry);
      byKey.set(key, { entry, fingerprint: print });
      return { entry, replayed: false };
    },
    balance: (account) => balances.get(account) ?? 0,
    entries: () => entries.slice(),
    /** Recomputes every balance from the entries and checks L1/L2: what an auditor would run. */
    audit() {
      const recomputed = new Map();
      const problems = [];
      for (const entry of entries) {
        let sum = 0;
        for (const { account, amount } of entry.postings) {
          sum += amount;
          recomputed.set(account, (recomputed.get(account) ?? 0) + amount);
        }
        if (sum !== 0) problems.push(`entry ${entry.id} unbalanced`);
      }
      for (const [account, value] of recomputed) {
        if (value !== (balances.get(account) ?? 0)) problems.push(`${account} cached ${balances.get(account)} ≠ ${value}`);
        if (!isHouse(account) && value < 0) problems.push(`${account} negative`);
      }
      const total = [...recomputed.values()].reduce((a, b) => a + b, 0);
      if (total !== 0) problems.push(`ledger total ${total} ≠ 0`);
      return { ok: problems.length === 0, problems, entries: entries.length };
    },
  };
}
