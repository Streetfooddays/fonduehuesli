import {test} from 'node:test';import assert from 'node:assert/strict';import {compareDayReservations} from './public/day-sort.mjs';
const row=(id,table_no,time,last,first='',status='Bestätigt')=>({id,table_no,time,status,data:JSON.stringify({last,first})});
const sorted=(rows,key)=>[...rows].sort((a,b)=>compareDayReservations(a,b,key)).map(r=>r.id);
test('tables sort numerically, including groups and gondolas, with unassigned and cancelled last',()=>{
 const rows=[row('55','55','18:00','A'),row('none','','17:00','B'),row('2','2','19:00','C'),row('5','5','18:00','D'),row('group','10, 21','18:00','E'),row('G2','G2','18:00','F'),row('G1','G1','18:00','G'),row('cancelled','1','17:00','A','','Storniert')];
 assert.deepEqual(sorted(rows,'table'),['2','5','group','55','G1','G2','none','cancelled']);
});
test('names sort by surname and then first name, regardless of accents and case',()=>{
 const rows=[row('z','1','18:00','Zürcher'),row('b','1','18:00','Meier','Zoe'),row('a','1','18:00','meier','Anna'),row('m','1','18:00','Müller'),row('unknown','1','18:00','')];
 assert.deepEqual(sorted(rows,'name'),['a','b','m','z','unknown']);
});
test('arrival time is chronological, unknown time follows, and cancellation stays at bottom in all modes',()=>{
 const rows=[row('late','5','19:30','D'),row('unknown','1','','B'),row('early','2','17:30','C'),row('cancel','1','17:00','A','','Storniert')];
 assert.deepEqual(sorted(rows,'time'),['early','late','unknown','cancel']);
 for(const mode of ['table','name','time'])assert.equal(sorted(rows,mode).at(-1),'cancel');
});
