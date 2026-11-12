import {test} from 'node:test';import assert from 'node:assert/strict';
import {requestPlanContext,validReservationDay} from './public/request-plan.mjs';
test('request plan uses the requested day, including unlinked requests and unknown times',()=>{
 assert.deepEqual(requestPlanContext({draft:{date:'2026-12-18',time:''}},[]),{day:'2026-12-18',scope:'all',highlightTable:''});
 assert.deepEqual(requestPlanContext({reservation_id:'r',draft:{date:'2026-12-18'}},[{id:'r',date:'2026-12-18',table_no:'4'}]),{day:'2026-12-18',scope:'all',highlightTable:'4'});
});
test('missing, impossible, ambiguous or conflicting dates cannot show a stale plan',()=>{
 for(const date of ['',undefined,'2026-02-30','2026-13-01','18.12.2026'])assert.equal(requestPlanContext({draft:{date}},[]),null);
 assert.equal(requestPlanContext({draft:{date:'2026-12-18'},issues:['Mehrere Angaben: Datum']},[]),null);
 assert.equal(requestPlanContext({draft:{date:'2026-12-18'},reservation_id:'r'},[{id:'r',date:'2026-12-19',revision:0}]),null);
 assert.equal(validReservationDay('2028-02-29'),true);
});
test('manually reviewed reservation date overrides outdated extraction warnings',()=>{
 assert.equal(requestPlanContext({reservation_id:'r',draft:{date:'2026-12-18'},issues:['Datum fehlt oder ist nicht eindeutig.']},[{id:'r',date:'2026-12-19',revision:1}]).day,'2026-12-19');
});
