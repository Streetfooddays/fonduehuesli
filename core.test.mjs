import {test} from 'node:test';
import assert from 'node:assert/strict';
import {totals,bookingSummary,dayOccupancy,canConfirm,csv,period,escapeHTML} from './public/core.mjs';
test('70 guests includes new booking and excludes cancelled, open and lunch',()=>{const rows=[{id:'1',people:66,status:'Bestätigt',period:'abend'},{id:'2',people:10,status:'Storniert',period:'abend'},{id:'3',people:10,status:'Offen',period:'abend'},{id:'4',people:30,status:'Bestätigt',period:'mittag'}];assert.equal(canConfirm(rows,null,4,'abend'),true);assert.equal(canConfirm(rows,null,5,'abend'),false);assert.equal(canConfirm(rows,'1',70,'abend'),true);assert.equal(canConfirm(rows,null,50,'mittag'),true);assert.deepEqual(totals(rows),{abend:66,mittag:30,ungeklaert:0,offen:10,storniert:10,rueckfrage:0});});
test('unknown times count conservatively and CSV escapes formulas and quotes',()=>{assert.equal(period(''),'ungeklaert');assert.equal(period('15:59'),'mittag');assert.equal(period('16:00'),'abend');assert.equal(canConfirm([{people:68,status:'Bestätigt',period:'ungeklaert'}],null,3,'abend'),false);const out=csv([{date:'2026-12-01',people:2,data:JSON.stringify({last:'=HYPERLINK("x")',first:'A;B'})}]);assert.ok(out.includes("'="));assert.ok(out.includes('"A;B"'));assert.ok(out.includes('""x""'));assert.equal(escapeHTML('<script>'),'&lt;script&gt;');});

test('reservation and revenue totals include open bookings, ignore cancellations and use 65 CHF per person',()=>{const rows=[{status:'Bestätigt',people:4},{status:'Offen',people:6},{status:'Storniert',people:30},{status:'Bestätigt',people:2}];assert.deepEqual(bookingSummary(rows),{reservations:3,people:12,revenue:780});assert.deepEqual(bookingSummary([]),{reservations:0,people:0,revenue:0});assert.deepEqual(bookingSummary([{status:'Storniert',people:10}]),{reservations:0,people:0,revenue:0});});

test('daily occupancy groups guests by arrival time, separates provisional guests and excludes cancellations and other days',()=>{
 const d='2026-11-19';const rows=[
  {date:d,time:'19:00',people:4,status:'Bestätigt'},
  {date:d,time:'19:00:00',people:2,status:'Offen'},
  {date:d,time:'18:30',people:3,status:'Rückfrage nötig'},
  {date:d,time:'',people:5,status:'Bestätigt'},
  {date:d,time:'19:00',people:30,status:'Storniert'},
  {date:'2026-11-20',time:'19:00',people:20,status:'Bestätigt'}];
 assert.deepEqual(dayOccupancy(rows,d),{reservations:4,people:14,slots:[{time:'18:30',confirmed:0,pending:3},{time:'19:00',confirmed:4,pending:2},{time:'',confirmed:5,pending:0}]});
 assert.deepEqual(dayOccupancy(rows,'2026-11-21'),{reservations:0,people:0,slots:[]});
});
