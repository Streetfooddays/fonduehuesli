import {test} from 'node:test';import assert from 'node:assert/strict';
import {TABLES} from './public/floor-layout.mjs';
import {TABLE_NUMBERS,DUPLICATE_NUMBERS,tableAssignments,floorOccupancy,floorPlan} from './public/floor-plan.mjs';
const day='2026-11-20';const booking=(id,table_no,status='Bestätigt',time='18:00')=>({id,date:day,time,period:time===''?'ungeklaert':time<'16:00'?'mittag':'abend',people:2,table_no,status,data:JSON.stringify({last:'Synthetic',first:'Test'})});
test('geometry retains final numbering with no duplicates',()=>{assert.equal(TABLES.length,53);assert.equal(TABLE_NUMBERS.length,53);assert.equal(TABLES.filter(t=>t.number==='20').length,1);assert.ok(TABLE_NUMBERS.includes('T1'));assert.ok(TABLE_NUMBERS.includes('263'));assert.ok(TABLE_NUMBERS.includes('223'));assert.deepEqual(DUPLICATE_NUMBERS,[]);assert.ok(TABLE_NUMBERS.includes('33'));assert.ok(TABLE_NUMBERS.includes('68'));assert.equal(floorOccupancy([booking('one','66')],day).occupancy['66'].state,'confirmed');});
test('assignments are exact, handle multiple tables, and never reinterpret an unnamed gondola as table 1',()=>{
 assert.deepEqual(tableAssignments('4 und 5').tables,['4','5']);assert.deepEqual(tableAssignments('T1 / 63').tables,['T1','63']);assert.deepEqual(tableAssignments('Tisch 1').tables,['1']);assert.deepEqual(tableAssignments('1-3').tables,['1','2','3']);assert.equal(tableAssignments('63(62').unclear,true);assert.deepEqual(tableAssignments('Gondel 1').tables,[]);assert.deepEqual(tableAssignments('Anbau').tables,[]);assert.deepEqual(tableAssignments('Godel').tables,[]);assert.deepEqual(tableAssignments('20').tables,['20']);
});
test('daily colors distinguish confirmation from provisional and ignore cancelled bookings',()=>{
 const rows=[booking('a','1'),booking('b','2','Offen'),booking('c','3','Rückfrage nötig'),booking('d','4','Storniert'),booking('e','63(62'),booking('f','','Bestätigt'),{...booking('other-day','5'),date:'2026-11-21'}];
 const m=floorOccupancy(rows,day);assert.equal(m.occupancy['1'].state,'confirmed');assert.equal(m.occupancy['2'].state,'pending');assert.equal(m.occupancy['3'].state,'pending');assert.equal(m.occupancy['4'].state,'free');assert.equal(m.occupancy['5'].state,'free');assert.equal(m.occupancy['63'].state,'pending');assert.equal(m.occupancy['62'].state,'pending');assert.equal(m.unassigned.length,1);assert.equal(m.unclear.length,1);
});
test('service scopes include unknown time and do not assume departure after another arrival',()=>{
 const rows=[booking('lunch','1','Bestätigt','12:00'),booking('dinner','2','Bestätigt','18:00'),booking('later','2','Bestätigt','20:00'),booking('unknown','3','Bestätigt','')];
 assert.equal(floorOccupancy(rows,day,'mittag').occupancy['2'].state,'free');assert.equal(floorOccupancy(rows,day,'abend').occupancy['1'].state,'free');assert.equal(floorOccupancy(rows,day,'abend').occupancy['3'].state,'confirmed');assert.deepEqual(floorOccupancy(rows,day,'abend').occupancy['2'].times,['18:00','20:00']);const html=floorPlan(rows,day);assert.ok(html.includes('18:00 / 20:00'));assert.ok(html.includes('Keine automatische Freigabe'));assert.ok(html.includes('data-floor-table="263"'));assert.ok(floorPlan(rows,'').includes('Datum ergänzen'));
});

test('reservation locator highlights only its exact tables, including multiple assignments',()=>{
 const rows=[booking('a','4, 5')];const html=floorPlan(rows,day,'abend','4, 5');
 assert.equal((html.match(/class="floor-locator"/g)||[]).length,2);
 assert.ok(html.includes('Blau blinkend: Tisch 4, 5 dieser Reservation.'));
 assert.equal((floorPlan(rows,day,'abend','').match(/class="floor-locator"/g)||[]).length,0);
 assert.equal((floorPlan(rows,day,'abend','Gondel 1').match(/class="floor-locator"/g)||[]).length,0);
});
