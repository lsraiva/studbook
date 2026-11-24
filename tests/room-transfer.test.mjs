import assert from 'node:assert/strict';
import { setup, applyAction } from '../assets/engine.js';
import { planRoomTransfer } from '../server/room-transfer.mjs';

let passed=0;
const test=(name,fn)=>{fn();passed++;console.log(`PASS transfer: ${name}`);};
function fixture(){
  let state=setup(['owner'],'transfer-source',10000);
  state=applyAction(state,'owner',{type:'takeStarterOffer'});
  state.stables[0].name='Persistent yard';
  state.stables[0].firsts.win={season:1,horse:'Kept history'};
  state.stables[0].items={blanket:1};
  return {source:{id:'source',state,version:3,closesAt:5000},target:{id:'target',state:setup(['host'],'transfer-target',30000),version:2,closesAt:5000},userId:'owner',now:1000};
}
function refused(code,change){const f=fixture();change(f);const before=JSON.stringify(f);assert.throws(()=>planRoomTransfer(f),e=>e.code===code);assert.equal(JSON.stringify(f),before);}

test('preserves balance, horse identity, genome, coverings and stable history',()=>{
  const f=fixture(), before=JSON.stringify(f), old=f.source.state.stables[0];
  const p=planRoomTransfer(f);
  assert.equal(p.stable.guineas,1980);
  assert.deepEqual({...p.stable,id:old.id},old);
  assert.deepEqual(p.horses.map(h=>({...h,owner:old.id})),f.source.state.horses.filter(h=>old.horses.includes(h.id)));
  assert.equal(JSON.stringify(f),before);
  assert.equal(p.stable.id,'stable-owner');
  assert.deepEqual(p.expectedVersions,{source:3,target:2});
  assert.deepEqual(planRoomTransfer(f),p);
});
test('copies a covering sire without creating ownership',()=>{
  const f=fixture(),p=planRoomTransfer(f),sire=f.source.state.stables[0].straws[0].sire;
  assert(p.pedigreeSnapshots.some(h=>h.id===sire));
  assert(!p.stable.horses.includes(sire));
  p.stable.guineas=0;p.horses[0].genome={};
  assert.equal(f.source.state.stables[0].guineas,1980);
  assert.notDeepEqual(f.source.state.horses[0].genome,{});
});
test('same room is a no-op, even at capacity',()=>{const f=fixture();f.source.state.players.push(...Array.from({length:11},(_,i)=>`p${i}`));f.target=f.source;assert.deepEqual(planRoomTransfer(f),{unchanged:true,roomId:'source'});});
test('rejects full destination',()=>refused('full',f=>{f.target.state.players=Array.from({length:12},(_,i)=>`p${i}`);}));
test('rejects mismatched season or meeting without changing either room',()=>{refused('calendar',f=>f.target.state.season++);refused('calendar',f=>f.target.state.meeting++);});
test('rejects an elapsed deadline',()=>refused('deadline',f=>f.now=5000));
test('preserves race entries by refusing an unsafe move',()=>refused('entries',f=>f.source.state.stables[0].entries=[f.source.state.stables[0].horses[0]]));
test('preserves pregnancies by refusing an unsafe move',()=>refused('pregnancy',f=>f.source.state.foaling=[{stableId:'st1',mareId:f.source.state.stables[0].horses[0]}]));
test('preserves listed assets and wanted orders',()=>{refused('market',f=>f.source.state.listings.push({seller:'st1'}));refused('market',f=>f.source.state.wants.push({stable:'st1'}));});
test('refuses minted/pending ownership until reconciliation is implemented',()=>{for(const status of ['minted','pending'])refused('mint',f=>f.mintIntents=[{owner:'owner',status}]);});
test('rejects invalid membership, balance and horse identity',()=>{refused('membership',f=>f.userId='outsider');refused('balance',f=>f.source.state.stables[0].guineas=-1);refused('collision',f=>f.target.state.horses.push(structuredClone(f.source.state.horses[0])));});
test('requires every covering sire to exist',()=>refused('pedigree',f=>f.source.state.stables[0].straws[0].sire='missing'));
test('retains unclaimed mint identity for the future atomic adapter',()=>{const f=fixture();f.mintIntents=[{owner:'owner',status:'unclaimed',nullifier:'stable-identity',roomId:'source'}];assert.deepEqual(planRoomTransfer(f).unclaimedMintIntents,f.mintIntents);});
console.log(`${passed} room transfer preparation cases passed; online route is unchanged.`);
