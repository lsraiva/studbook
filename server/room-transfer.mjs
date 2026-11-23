/** Pure transfer preparation. NOT wired to /api/room/join yet.
 * The caller must lock both rooms, recheck versions/deadlines, and atomically
 * commit removal + insertion + identity/ledger updates before exposing success.
 */
const copy = (value) => structuredClone(value);
const refuse = (code, message) => { const error = new Error(message); error.code = code; throw error; };

export function planRoomTransfer({ source, target, userId, now, mintIntents = [] }) {
  if (!source?.state || !target?.state || !Number.isFinite(now)) refuse('invalid', 'A source, target and server time are required.');
  const stable = source.state.stables.find((s) => s.player === userId);
  if (!stable || !source.state.players.includes(userId)) refuse('membership', 'No owned stable in the source room.');
  if (source.id === target.id) return { unchanged: true, roomId: source.id };
  if (target.state.players.includes(userId) || target.state.stables.some((s) => s.player === userId)) refuse('membership', 'Already seated in the destination.');
  if (target.state.players.length >= 12) refuse('full', 'The destination room is full.');
  if (source.state.season !== target.state.season || (source.state.meeting ?? 1) !== (target.state.meeting ?? 1)) refuse('calendar', 'Join a room on the same season and meeting; your stable has not changed.');
  if (![source, target].every((room) => Number.isFinite(room.closesAt) && room.closesAt > now)) refuse('deadline', 'A meeting is resolving; wait before transferring.');
  if (source.state.clock || target.state.clock || stable.entries?.length) refuse('entries', 'Withdraw race entries before transferring.');
  const owned = new Set(stable.horses);
  if (source.state.foaling?.some((f) => f.stableId === stable.id || owned.has(f.mareId))) refuse('pregnancy', 'Finish the current pregnancy before transferring.');
  if (source.state.listings?.some((l) => l.seller === stable.id) || source.state.wants?.some((w) => w.stable === stable.id)) refuse('market', 'Close active market commitments before transferring.');
  if (mintIntents.some((m) => m.owner === userId && m.status !== 'unclaimed')) refuse('mint', 'Token ownership must be reconciled before this transfer.');
  if (!Number.isSafeInteger(stable.guineas) || stable.guineas < 0) refuse('balance', 'Invalid balance; transfer requires reconciliation.');
  if (owned.size !== stable.horses.length) refuse('integrity', 'Duplicate horse reference.');

  const horses = stable.horses.map((id) => {
    const matches = source.state.horses.filter((h) => h.id === id);
    if (matches.length !== 1 || matches[0].owner !== stable.id || matches[0].listed) refuse('integrity', 'Horse ownership is inconsistent.');
    return matches[0];
  });
  const destinationIds = new Set([...(target.state.horses ?? []), ...(target.state.gone ?? [])].map((h) => h.id));
  if (horses.some((h) => destinationIds.has(h.id))) refuse('collision', 'Destination already has this horse identity; reconcile first.');
  const destinationStraws = new Set(target.state.stables.flatMap((s) => (s.straws ?? []).map((x) => x.id)));
  if ((stable.straws ?? []).some((s) => destinationStraws.has(s.id))) refuse('collision', 'Covering identity collision.');

  // Referenced ancestors/sires remain history, not newly owned tradable animals.
  const history = new Map();
  const visiting = new Set();
  function ancestor(id) {
    if (!id || owned.has(id) || history.has(id)) return;
    if (visiting.has(id)) refuse('pedigree', 'Pedigree cycle requires reconciliation.');
    const row = source.state.horses.find((h) => h.id === id) ?? source.state.gone?.find((h) => h.id === id);
    if (!row) refuse('pedigree', 'A parent or covering sire is missing.');
    const existing = target.state.horses.find((h) => h.id === id) ?? target.state.gone?.find((h) => h.id === id);
    if (existing && JSON.stringify([existing.genome, existing.sire, existing.dam]) !== JSON.stringify([row.genome, row.sire, row.dam])) refuse('pedigree', 'Conflicting pedigree identity.');
    visiting.add(id);
    ancestor(row.sire); ancestor(row.dam);
    visiting.delete(id);
    if (!existing) history.set(id, copy(row));
  }
  for (const horse of horses) { ancestor(horse.sire); ancestor(horse.dam); }
  for (const straw of stable.straws ?? []) ancestor(straw.sire);

  const stableId = `stable-${userId}`;
  if (target.state.stables.some((s) => s.id === stableId)) refuse('collision', 'Destination stable identity collision.');
  return {
    unchanged: false,
    sourceRoomId: source.id, targetRoomId: target.id, userId,
    expectedVersions: { source: source.version, target: target.version },
    expectedCalendar: { season: source.state.season, meeting: source.state.meeting ?? 1 },
    deadlines: { source: source.closesAt, target: target.closesAt },
    stableIdRemap: { from: stable.id, to: stableId },
    stable: { ...copy(stable), id: stableId },
    horses: horses.map((h) => ({ ...copy(h), owner: stableId })),
    pedigreeSnapshots: [...history.values()],
    unclaimedMintIntents: copy(mintIntents.filter((m) => m.owner === userId)),
  };
}
