import {test} from 'node:test';import assert from 'node:assert/strict';import {tableNumberSummary,tableNumberList} from './public/table-number-list.mjs';
const day='2099-01-01';const row=(id,table_no,people=2)=>({id,date:day,time:'18:00',table_no,people,status:'Bestätigt'});
test('occupied tables sort naturally and empty tables are omitted',()=>{
 const m=tableNumberSummary([row('a','55'),row('b','5',3),row('c','G2'),row('d','G1'),row('e','21'),row('f','2'),row('empty','1',0)],day);
 assert.deepEqual(m.tables.map(t=>t.number),['2','5','21','55','G1','G2']);assert.equal(m.tables.find(t=>t.number==='5').people,3);assert(!m.tables.some(t=>t.number==='1'));
});
test('sums all reservations for the chosen day and omits cancellations and deleted entries',()=>{
 const m=tableNumberSummary([row('a','4',2),{...row('b','4',3),time:'19:00'},{...row('c','4',10),status:'Storniert'},{...row('d','4',20),deleted_at:'now'},{...row('e','4',30),date:'2099-01-02'}],day);
 assert.equal(m.tables[0].people,5);assert.equal(m.people,5);assert.equal(m.tables[0].bookings,2);assert.equal(m.tables[0].times.size,2);
});
test('multiple-table groups appear once under the smallest number with their full guest count',()=>{
 const m=tableNumberSummary([row('a','4, 5',8),row('b','4',2),row('c','',3),row('d','777, 7, 77',5)],day);
 assert.equal(m.people,18);assert.deepEqual(m.tables.map(t=>t.number),['4','7']);assert.equal(m.tables[0].people,10);assert.equal(m.tables[1].people,5);assert.equal(m.unassigned.length,1);
 const html=tableNumberList([row('a','7, 77, 777',5)],day);assert.match(html,/<strong>7<\/strong>/);assert.match(html,/<strong>5<\/strong>/);assert(!html.includes('<strong>77</strong>'));assert(!html.includes('<strong>777</strong>'));
});
test('an explicit table outside the plan is retained and empty days have an empty state',()=>{
 assert.equal(tableNumberSummary([row('x','99',3)],day).tables[0].people,3);assert.match(tableNumberList([],day),/Noch keine Tische zugeordnet/);
});
