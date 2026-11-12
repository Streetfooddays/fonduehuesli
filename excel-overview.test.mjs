import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weekDays,sheetPayload,sheetTotals} from './public/excel-overview.mjs';
test('weekly overview spans Monday to Sunday across season and year boundaries',()=>{
 assert.deepEqual(weekDays('2027-01-01'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
 assert.equal(weekDays('2026-11-15')[0],'2026-11-09');
 assert.equal(weekDays('2026-11-16')[0],'2026-11-16');
});
const values={date:'2026-12-01',last:' Muster ',first:'Anna',time:'18:30',people:'4',tableNo:'G1, G2',phone:'079 123 45 67',email:'anna@example.test',comment:'Hochstuhl',status:'Bestätigt'};
test('manual entry uses the common reservation payload with stable creation ID',()=>{
 const p=sheetPayload(null,values,'stable-id');assert.equal(p.createId,'stable-id');assert.equal(p.id,undefined);assert.equal(p.date,values.date);assert.equal(p.people,4);assert.equal(p.data.last,'Muster');assert.equal(p.gondola,true);assert.equal(p.data.comment,'Hochstuhl');assert.equal(p.override,false);
});
test('inline edit retains provenance, internal notes, address and revision and permits actual zero guests',()=>{
 const r={id:'existing',revision:7,note:'Interne Notiz',gondola:0,status:'Offen',data:JSON.stringify({last:'Muster',first:'Anna',street:'Testweg 1',excel_source:{file:'original.xlsx'},salutation:'Liebe',company:'Test AG'})};
 const p=sheetPayload(r,{...values,people:'0',tableNo:'1'},'unused');assert.equal(p.id,r.id);assert.equal(p.revision,7);assert.equal(p.people,0);assert.equal(p.note,r.note);assert.equal(p.data.street,'Testweg 1');assert.equal(p.data.company,'Test AG');assert.deepEqual(p.data.excel_source,{file:'original.xlsx'});assert.equal(p.gondola,false);
});
test('invalid unnamed or fractional entries cannot be saved and capacity exceptions are explicit',()=>{
 for(const people of ['','-1','2.5','1001'])assert.throws(()=>sheetPayload(null,{...values,people},'id'));
 assert.throws(()=>sheetPayload(null,{...values,last:'',first:''},'id'));
 assert.equal(sheetPayload(null,{...values,override:true},'id').override,true);
});
test('daily guest totals exclude cancellations and other days',()=>{
 assert.deepEqual(sheetTotals([{date:values.date,status:'Bestätigt',people:4},{date:values.date,status:'Offen',people:3},{date:values.date,status:'Storniert',people:50},{date:'2026-12-02',status:'Bestätigt',people:7}],values.date),{reservations:2,people:7});
});
