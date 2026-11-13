import {test} from 'node:test';import assert from 'node:assert/strict';import {saveArrival} from './public/arrival-save.mjs';
test('arrival retries once with the latest revision after an overlapping inline edit',async()=>{
 const r={id:'test',revision:1},calls=[];
 const result=await saveArrival(r,true,{save:async p=>{calls.push(p);if(calls.length===1)throw Object.assign(Error('Reservation wurde zwischenzeitlich geändert.'),{status:409});return {arrived:true,revision:3};},latest:async()=>({id:'test',revision:2,status:'Bestätigt',table_no:'4'})});
 assert.equal(calls.length,2);assert.equal(calls[1].revision,2);assert.equal(calls[1].arrived,true);assert.equal(r.table_no,'4');assert.equal(result.arrived,true);
});
test('arrival never retries inactive reservations or network errors',async()=>{
 let n=0;await assert.rejects(saveArrival({id:'x',revision:0},true,{save:async()=>{n++;throw Object.assign(Error('Conflict'),{status:409});},latest:async()=>({status:'Storniert',revision:1})}),/nicht mehr aktiv/);assert.equal(n,1);
 await assert.rejects(saveArrival({id:'x',revision:0},false,{save:async()=>{throw Error('Offline');},latest:async()=>{throw Error('Unexpected retry');}}),/Offline/);
});
