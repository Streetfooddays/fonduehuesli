import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {todayInZurich} from './public/day-start.mjs';import {compactDayTable} from './public/day-list.mjs';
const source=readFileSync(new URL('./public/app.mjs',import.meta.url),'utf8');
test('login day uses Swiss local date, including midnight and summer time',()=>{
 assert.equal(todayInZurich(new Date('2026-11-14T22:30:00Z')),'2026-11-14');assert.equal(todayInZurich(new Date('2026-11-14T23:30:00Z')),'2026-11-15');assert.equal(todayInZurich(new Date('2026-07-14T22:30:00Z')),'2026-07-15');
});
test('each successful login resets previous day, filters and request context to today',async()=>{
 const start=source.indexOf('async function enter(){'),end=source.indexOf('\nasync function load()',start);let rendered=false;
 const c={view:'pending',date:'2000-01-01',search:'old',status:'Offen',focusedRequestId:'old',floorScope:'mittag',floorPreviewState:{},floorPreviewRequestId:'old',req:async()=>{},rpc:async()=>({}),load:async()=>{},todayInZurich:()=> '2099-01-02',render:()=>rendered=true,clear:()=>{},renderAuth:()=>{throw Error('Unexpected auth failure');}};
 vm.runInNewContext(source.slice(start,end),c);await c.enter();assert.equal(c.view,'day');assert.equal(c.date,'2099-01-02');assert.equal(c.search,'');assert.equal(c.status,'');assert.equal(c.floorPreviewState,null);assert.equal(c.floorScope,'all');assert.equal(rendered,true);
});
const booking={id:'test',date:'2099-01-01',time:'18:00',people:2,status:'Offen',revision:3,data:'{}'};
test('only open reservations expose the direct confirm button',()=>{
 const options={arrival:()=>'',people:()=>'',table:()=>'',origin:()=>'',locked:()=>false};
 assert.match(compactDayTable([booking],options),/data-confirm-day="test"/);
 for(const status of ['Bestätigt','Rückfrage nötig','Storniert'])assert(!compactDayTable([{...booking,status}],options).includes('data-confirm-day='));
});
test('single-click status confirm calls its dedicated no-mail RPC and refreshes local booking state',async()=>{
 const start=source.indexOf('function bindDayStatusButtons(){'),end=source.indexOf('\nfunction bindDayReservationDeletes(){',start);const feedback={};const button={dataset:{confirmDay:'test'},parentElement:{querySelector:()=>feedback}};const calls=[];
 const c={rows:[{...booking}],inbox:[{reservation_id:'test',state:'imported'}],document:{querySelectorAll:()=>[button]},rpc:async(name,body)=>{calls.push([name,body]);return {reservation:{...booking,status:'Bestätigt',revision:4},over_capacity:false};},render:()=>{},notice:()=>{}};
 vm.runInNewContext(source.slice(start,end)+'\nbindDayStatusButtons();',c);await button.onclick();assert.equal(calls.length,1);assert.equal(calls[0][0],'confirm_day_reservation');assert.equal(calls[0][1].p.revision,3);assert.equal(c.rows[0].status,'Bestätigt');assert.equal(c.inbox[0].state,'confirmed');
});
