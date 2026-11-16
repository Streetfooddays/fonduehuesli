import {test} from 'node:test';import assert from 'node:assert/strict';
import {TABLES} from './public/floor-layout.mjs';
import {TABLE_NUMBERS,DUPLICATE_NUMBERS,tableAssignments,floorOccupancy,floorPlan} from './public/floor-plan.mjs';
const day='2026-11-20';const booking=(id,table_no,status='Bestätigt',time='18:00')=>({id,date:day,time,period:time===''?'ungeklaert':time<'16:00'?'mittag':'abend',people:2,table_no,status,data:JSON.stringify({last:'Synthetic',first:'Test'})});
test('geometry retains final numbering with no duplicates',()=>{assert.equal(TABLES.length,56);assert.equal(TABLE_NUMBERS.length,56);assert.equal(TABLES.filter(t=>t.number==='20').length,1);assert.ok(TABLE_NUMBERS.includes('T1'));assert.ok(TABLE_NUMBERS.includes('263'));assert.ok(TABLE_NUMBERS.includes('223'));assert.deepEqual(DUPLICATE_NUMBERS,[]);assert.ok(TABLE_NUMBERS.includes('30'));assert.ok(TABLE_NUMBERS.includes('68'));assert.equal(floorOccupancy([booking('one','66')],day).occupancy['66'].state,'confirmed');});
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
test('three gondolas stand to the right of T1, T2, T3 and have independent occupancy and assignment',()=>{
 for(const i of [1,2,3]){const g=TABLES.find(t=>t.number==='G'+i),t=TABLES.find(t=>t.number==='T'+i);assert.equal(g.kind,'gondola');assert(g.x>t.x+t.width);assert(Math.abs((g.y+g.height/2)-(t.y+t.height/2))<.02);}
 assert.deepEqual(tableAssignments('G1, G2, G3').tables,['G1','G2','G3']);assert.deepEqual(tableAssignments('G 1, T2, 1').tables,['G1','T2','1']);
 const rows=[booking('g','G1')];const plan=floorOccupancy(rows,day);assert.equal(plan.occupancy.G1.state,'confirmed');assert.equal(plan.occupancy.G2.state,'free');assert.equal(plan.occupancy['1'].state,'free');assert(floorPlan(rows,day).includes('Gondel G1'));assert(floorPlan(rows,day).includes('maximal 4 Personen'));
});

// Hover highlighting changes only classes on existing table groups.
test('hover blinks assigned tables exactly, supports multiple tables and clears without rebuilding SVG',async()=>{
 const {highlightFloorTables}=await import('./public/floor-plan.mjs');
 const groups=['1','2','G1'].map(number=>({dataset:{floorTable:number},classes:new Set(),get classList(){return {toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c)};}}));
 const classes=new Set(),root={classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c)},querySelectorAll:()=>groups};
 highlightFloorTables(root,'1, G1');assert(classes.has('reservation-hover'));assert(groups[0].classes.has('row-hover-highlight'));assert(!groups[1].classes.has('row-hover-highlight'));assert(groups[2].classes.has('row-hover-highlight'));
 highlightFloorTables(root,'');assert(groups.every(g=>!g.classes.has('row-hover-highlight')));
 highlightFloorTables(root,null);assert(!classes.has('reservation-hover'));
});

test('arrival colors all assigned tables in every scope of its day and reverses when unchecked',()=>{
 const arrived={...booking('arrived','1, G1','Bestätigt','12:00'),arrived:true};
 const other=booking('later','1','Bestätigt','19:00');
 for(const scope of ['all','mittag','abend']){
  const m=floorOccupancy([arrived,other],day,scope);
  assert.equal(m.occupancy['1'].state,'arrived');assert.equal(m.occupancy.G1.state,'arrived');
  assert.match(floorPlan([arrived,other],day,scope),/floor-table arrived/);
 }
 assert.equal(floorOccupancy([arrived,other],'2026-11-21').occupancy['1'].state,'free');
 assert.equal(floorOccupancy([{...arrived,arrived:false},other],day,'abend').occupancy['1'].state,'confirmed');
 assert.equal(floorOccupancy([{...arrived,status:'Storniert'},other],day).occupancy.G1.state,'free');
 assert.equal(floorOccupancy([{...arrived,table_no:'2'},other],day).occupancy['1'].state,'confirmed');
 assert.match(floorPlan([arrived],day),/Grün · angekommen/);
});

test('renumbered tables retain physical positions without duplicate numbers',()=>{for(const [number,x,y] of [['30',386.92,525.27],['130',326.44,525.27],['31',388.17,427.61],['131',327.68,427.61],['32',390.87,343.19],['132',330.38,343.19]]){const t=TABLES.find(t=>t.number===number);assert.equal(t.x,x);assert.equal(t.y,y);}assert(!TABLE_NUMBERS.includes('33'));assert(!TABLE_NUMBERS.includes('133'));});

test('waiting reservations never occupy a table even if they retain a proposed assignment',()=>{assert.equal(floorOccupancy([booking('w','30','Warteliste')],day).occupancy['30'].state,'free');});

test('table tooltips show ten places for tables 20, 121 and 124',()=>{const html=floorPlan([],day);for(const number of ['20','121','124'])assert(html.includes(`<title>Tisch ${number} · bis 10 Personen`));});
