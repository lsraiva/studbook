/** Single-writer JSON bridge until Postgres. A durable journal is the commit
 * point; room JSON files are recoverable projections, NOT a two-file transaction.
 */
import { open, rename, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
const queues = new Map();

export function writeJsonDurable(path, value) {
  const text=JSON.stringify(value); // snapshot before waiting for a prior writer
  const previous=queues.get(path)??Promise.resolve();
  const pending=previous.catch(()=>{}).then(async()=>{
    await mkdir(dirname(path),{recursive:true});
    const parent=await open(dirname(dirname(path)),'r');
    try{await parent.sync();}finally{await parent.close();}
    const tmp=`${path}.${process.pid}.${randomUUID()}.tmp`;
    const file=await open(tmp,'wx',0o600);
    try{await file.writeFile(text);await file.sync();}finally{await file.close();}
    await rename(tmp,path);
    const directory=await open(dirname(path),'r');
    try{await directory.sync();}finally{await directory.close();}
  });
  queues.set(path,pending);
  pending.then(()=>{if(queues.get(path)===pending)queues.delete(path);},()=>{if(queues.get(path)===pending)queues.delete(path);});
  return pending;
}

export function roomSnapshots(plan, source, target, leagueDeadline) {
  if(plan.unchanged)throw new Error('No transfer required');
  if(source.version!==plan.expectedVersions.source||target.version!==plan.expectedVersions.target)throw new Error('Stale transfer plan');
  const from=structuredClone(source),to=structuredClone(target);
  const ids=new Set(plan.horses.map(h=>h.id));
  const archive=(horse)=>({...structuredClone(horse),owner:null,sold:true});
  from.state.stables=from.state.stables.filter(s=>s.player!==plan.userId);
  from.state.players=from.state.players.filter(p=>p!==plan.userId);
  if(from.state.owner===plan.userId)from.state.owner=from.state.players[0]??null;
  from.state.horses=from.state.horses.filter(h=>!ids.has(h.id));
  from.state.gone??=[];
  for(const horse of plan.horses)if(!from.state.gone.some(h=>h.id===horse.id))from.state.gone.push(archive(horse));
  to.state.stables.push(structuredClone(plan.stable));
  to.state.players.push(plan.userId);
  to.state.horses.push(...plan.horses.map(h=>({...structuredClone(h),originRoomId:h.originRoomId??source.id,certifiedBy:(h.certifiedBy??[]).filter(id=>id===plan.stableIdRemap.from).map(()=>plan.stable.id)})));
  to.state.gone??=[];
  for(const ancestor of plan.pedigreeSnapshots)to.state.gone.push(archive(ancestor));
  if(target.state.players.length===1)to.closesAt=leagueDeadline;
  from.version++;to.version++;
  return [from,to];
}

export async function commitRoomTransfer({directory,snapshots,userId,publish,writeRoom,afterJournal}) {
  const record={schema:1,id:randomUUID(),userId,rooms:structuredClone(snapshots)};
  await writeJsonDurable(join(directory,`${Date.now()}-${record.id}.json`),record);
  if(afterJournal)await afterJournal(); // injected only by isolated tests
  publish(record.rooms); // synchronous: both room views switch together
  const writes=await Promise.allSettled(record.rooms.map((room)=>Promise.resolve().then(()=>writeRoom(room))));
  return {materialized:writes.every((write)=>write.status==='fulfilled')}; // wait for both before releasing locks
}

export async function recoverRoomTransfers({directory,rooms,writeRoom}) {
  await mkdir(directory,{recursive:true});
  let repaired=0;
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.json')).sort()){
    const record=JSON.parse(await readFile(join(directory,name),'utf8'));
    if(record.schema!==1||!Array.isArray(record.rooms)||record.rooms.length!==2)throw new Error('Invalid room transfer journal');
    for(const snapshot of record.rooms){
      if(!/^r[0-9a-f]+$/.test(snapshot.id)||!Number.isSafeInteger(snapshot.version)||snapshot.version<1||!Array.isArray(snapshot.state?.players))throw new Error('Invalid transfer snapshot');
      const current=rooms.get(snapshot.id);
      if(!current||current.version<snapshot.version){await writeRoom(snapshot);rooms.set(snapshot.id,snapshot);repaired++;}
    }
  }
  return repaired;
}
