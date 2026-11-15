import {test} from 'node:test';import assert from 'node:assert/strict';
import {tableReuseCandidate,ensureTableReuse,askTableReuse} from './public/table-reuse.mjs';
import {floorOccupancy} from './public/floor-plan.mjs';
import {tableAssignmentState} from './public/table-assignment-state.mjs';
import {parseHTML} from 'linkedom';
const old={id:'old',date:'2099-01-01',table_no:'5, 55',people:4,status:'Bestätigt',arrived:true,time:'17:00',period:'abend'};
const next={id:'next',date:old.date,table_no:'55',people:2,status:'Bestätigt',time:'19:00',period:'abend'};
test('all reservation and table mutation entry points request the guard, but replies and reads do not',()=>{
 for(const path of ['save_reservation','save_walk_in'])assert.equal(tableReuseCandidate('/rest/v1/rpc/'+path,{payload:{action:'save',reservation:next}}),next);
 assert.equal(tableReuseCandidate('/rest/v1/rpc/mail_review',{p:{action:'convert',reservation:next}}),next);
 assert.equal(tableReuseCandidate('/functions/v1/confirmation-mail',{action:'send',reservation:next}),next);
 assert.deepEqual(tableReuseCandidate('/rest/v1/rpc/set_reservation_arrival',{p:{id:'next',arrived:true}}),{id:'next',arrived:true,arriving:true});
 for(const path of ['set_reservation_table','set_reservation_people'])assert.equal(tableReuseCandidate('/rest/v1/rpc/'+path,{p:next}),next);
 assert.equal(tableReuseCandidate('/rest/v1/rpc/set_reservation_arrival',{p:{arrived:false}}),null);
 assert.equal(tableReuseCandidate('/functions/v1/confirmation-mail',{action:'reply',reservation:next}),null);
 assert.equal(tableReuseCandidate('/rest/v1/rpc/mail_review',{p:{action:'ignore'}}),null);
});
test('declining the popup never releases tables and cancels the original assignment',async()=>{
 let releases=0;await assert.rejects(ensureTableReuse(next,{check:async()=>[{id:'old',tables:['55']}],ask:async()=>false,release:async()=>releases++}),{code:'TABLE_REUSE_CANCELLED'});assert.equal(releases,0);
});
test('accepting releases the exact checked snapshot and updates operational state once',async()=>{
 const conflicts=[{id:'old',revision:3,date:old.date,tables:['55']}],steps=[];
 await ensureTableReuse(next,{check:async()=>conflicts,ask:async c=>{assert.equal(c,conflicts);steps.push('ask');return true;},release:async c=>{assert.equal(c,conflicts);steps.push('release');return [{id:'old',released_tables:['55']}];},onReleased:rows=>{steps.push('update');assert.deepEqual(rows[0].released_tables,['55']);}});assert.deepEqual(steps,['ask','release','update']);
 await ensureTableReuse(next,{check:async()=>[],ask:()=>{throw Error('No prompt for free tables');}});
});
test('release conflicts or network failures block assignment instead of silently continuing',async()=>{
 await assert.rejects(ensureTableReuse(next,{check:async()=>[{id:'old'}],ask:async()=>true,release:async()=>{throw Error('Belegung geändert');}}),/Belegung geändert/);
});
test('partial table release preserves arrival history and only removes green on the released table in all plans',()=>{
 const previous={...old,released_tables:['55']};
 for(const scope of ['all','mittag','abend']){const plan=floorOccupancy([previous,next],old.date,scope);assert.equal(plan.occupancy['5'].state,'arrived');assert.notEqual(plan.occupancy['55'].state,'arrived');}
 const plan=floorOccupancy([previous,next],old.date);assert.deepEqual(plan.occupancy['55'].bookings.map(r=>r.id),['next']);assert.equal(previous.arrived,true);
 assert.equal(tableAssignmentState(next,[previous,next]).state,'assigned');assert.equal(tableAssignmentState(next,[old,next]).state,'conflict');
});
test('the compact popup supports yes, no and Escape with safe default focus',async()=>{
 const {document,window}=parseHTML('<html><body></body></html>');const prior=globalThis.document;globalThis.document=document;
 window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
 try{
  for(const choice of ['yes','no','escape']){const pending=askTableReuse([{tables:['55'],name:'<Synthetic>',time:'17:00'}]);const dialog=document.querySelector('dialog');assert.equal(dialog.querySelector('li').textContent,'55 · <Synthetic> · 17:00');assert.equal(dialog.querySelector('Synthetic'),null);
   if(choice==='escape')dialog.oncancel({preventDefault(){}});else dialog.querySelector('[data-reuse-'+choice+']').onclick();assert.equal(await pending,choice==='yes');assert.equal(document.querySelector('dialog'),null);}
 }finally{if(prior)globalThis.document=prior;else delete globalThis.document;}
});
