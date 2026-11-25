/**
 * F2-01 — map today's JSON (users.json + rooms/*.json) to the global schema, in memory,
 * and check the global invariants. Pure: it reads objects and returns rows + a report.
 * Nothing is written anywhere; the real cut-over needs backup, restore proof and approval.
 *
 * Invariants checked (see docs/execution/F2-SCHEMA.md):
 *  G1 each account has at most one human stable across all rooms
 *  G2 every live horse has exactly one owner stable, and horse keys are globally unique
 *  G3 each stable's horse list and the horses' owner fields agree
 *  G4 opening ledger balance of every stable equals its current guineas (≥ 0, whole)
 *  G5 pedigree parents resolve to a live or archived ("gone") horse of the same origin room
 *  G6 every human stable belongs to a known account
 */
import { accountKey, stableKey, houseStableKey, horseKey, roomKey } from "./ids.mjs";
import { createMemoryLedger, stableAccount, HOUSE } from "./ledger.mjs";

export function planImport({ users = [], rooms = [] }) {
  const problems = [];
  const warnings = [];
  const accounts = new Map();
  const stables = [];
  const horses = new Map(); // uuid -> row
  const pedigreeRefs = [];
  const knownByOrigin = new Map(); // `${origin}:${localId}` -> true (live or gone)

  for (const user of users) {
    accounts.set(user.id, { id: accountKey(user.id), legacyId: user.id, email: user.email, verified: Boolean(user.verified), wallet: user.wallet ?? null, createdAt: user.createdAt ?? null });
  }

  const seatOf = new Map(); // userId -> roomId
  for (const room of rooms) {
    const state = room.state ?? {};
    const roomUuid = roomKey(room.id);
    for (const gone of state.gone ?? []) knownByOrigin.set(`${gone.originRoomId ?? room.id}:${gone.id}`, true);
    for (const horse of state.horses ?? []) knownByOrigin.set(`${horse.originRoomId ?? room.id}:${horse.id}`, true);

    for (const stable of state.stables ?? []) {
      const human = Boolean(stable.player);
      if (human) {
        if (seatOf.has(stable.player)) problems.push(`G1 account ${stable.player} has stables in ${seatOf.get(stable.player)} and ${room.id}`);
        seatOf.set(stable.player, room.id);
        if (!accounts.has(stable.player)) problems.push(`G6 stable ${room.id}/${stable.id} belongs to unknown account ${stable.player}`);
      }
      const id = human ? stableKey(stable.player) : houseStableKey(room.id, stable.id);
      if (!Number.isSafeInteger(stable.guineas) || stable.guineas < 0) problems.push(`G4 stable ${room.id}/${stable.id} has invalid guineas ${stable.guineas}`);
      stables.push({ id, legacyId: stable.id, roomId: roomUuid, legacyRoomId: room.id, accountId: human ? accountKey(stable.player) : null, name: stable.name, guineas: stable.guineas, house: !human, horseIds: stable.horses ?? [] });
    }

    const stableUuidByLocal = new Map(stables.filter((s) => s.legacyRoomId === room.id).map((s) => [s.legacyId, s.id]));
    for (const horse of state.horses ?? []) {
      const origin = horse.originRoomId ?? room.id;
      const id = horseKey(origin, horse.id);
      if (horses.has(id)) problems.push(`G2 horse ${origin}/${horse.id} appears twice`);
      const ownerId = horse.owner ? stableUuidByLocal.get(horse.owner) ?? null : null;
      if (horse.owner && !ownerId) problems.push(`G2 horse ${room.id}/${horse.id} owned by missing stable ${horse.owner}`);
      horses.set(id, {
        id, legacyId: horse.id, originRoomId: roomKey(origin), legacyOriginRoomId: origin, roomId: roomUuid, ownerStableId: ownerId,
        name: horse.name, sex: horse.sex, lineage: horse.lineage, bornSeason: horse.bornSeason ?? 0,
        genome: horse.genome, // immutable after import (trigger in schema.sql)
        sireId: horse.sire ? horseKey(origin, horse.sire) : null, damId: horse.dam ? horseKey(origin, horse.dam) : null,
        breederStableId: null, // not recorded before F2; fixed at foaling from now on
      });
      for (const parent of [horse.sire, horse.dam]) if (parent) pedigreeRefs.push({ child: `${origin}/${horse.id}`, key: `${origin}:${parent}` });
    }
  }

  // G3: the two sides of ownership agree
  const horseByRoomLocal = new Map([...horses.values()].map((h) => [`${h.roomId}:${h.legacyId}`, h]));
  for (const stable of stables) {
    for (const local of stable.horseIds) {
      const horse = horseByRoomLocal.get(`${stable.roomId}:${local}`);
      if (!horse) problems.push(`G3 stable ${stable.legacyRoomId}/${stable.legacyId} lists missing horse ${local}`);
      else if (horse.ownerStableId !== stable.id) problems.push(`G3 horse ${local} listed by ${stable.legacyId} but owned by another stable`);
    }
  }
  for (const ref of pedigreeRefs) if (!knownByOrigin.has(ref.key)) warnings.push(`G5 ${ref.child} parent ${ref.key} not found (founder or pre-archive data)`);
  for (const [userId] of accounts) if (!seatOf.has(userId)) warnings.push(`account ${userId} has no stable (legacy state; not recreated automatically)`);

  // G4: opening balances become ledger entries, one per stable, keyed so a re-run is a no-op.
  const ledger = createMemoryLedger({ now: () => "import" });
  for (const stable of stables) {
    if (!Number.isSafeInteger(stable.guineas) || stable.guineas <= 0) continue;
    ledger.post({ key: `opening:${stable.id}`, kind: "opening_balance", postings: [{ account: HOUSE.treasury, amount: -stable.guineas }, { account: stableAccount(stable.id), amount: stable.guineas }], meta: { legacyRoomId: stable.legacyRoomId, legacyStableId: stable.legacyId } });
  }
  for (const stable of stables) {
    const booked = ledger.balance(stableAccount(stable.id));
    if (Number.isSafeInteger(stable.guineas) && booked !== stable.guineas) problems.push(`G4 stable ${stable.legacyId} ledger ${booked} ≠ guineas ${stable.guineas}`);
  }
  const audit = ledger.audit();
  if (!audit.ok) problems.push(...audit.problems.map((p) => `ledger: ${p}`));

  const humanGuineas = stables.filter((s) => !s.house).reduce((n, s) => n + (s.guineas ?? 0), 0);
  return {
    ok: problems.length === 0,
    problems,
    warnings,
    counts: { accounts: accounts.size, stables: stables.length, humanStables: stables.filter((s) => !s.house).length, horses: horses.size, entries: audit.entries, humanGuineas },
    rows: { accounts: [...accounts.values()], stables, horses: [...horses.values()] },
    ledger,
  };
}
