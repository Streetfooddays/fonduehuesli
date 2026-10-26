import {test} from 'node:test';import assert from 'node:assert/strict';
import {reservationNameKey,duplicateCandidates} from './public/duplicates.mjs';
const day='2026-11-19',data={first:'Oliver',last:'Oetjen'};
const booking=(id,date=day,time='19:00',people=4,status='Bestätigt')=>({id,date,time,people,status,data:JSON.stringify(data)});
const mail=(id,extra={})=>({id,state:'review',draft:{date:day,time:'18:00',people:2,data},...extra});
test('same date and full name warn even if time or people differ',()=>{
 const matches=duplicateCandidates({date:day,data,mailId:'new'},[booking('old',day,'20:00',9)],[]);assert.equal(matches.length,1);assert.equal(matches[0].id,'old');assert.equal(matches[0].people,9);
});
test('case, whitespace and a combined full-name field match without requiring a guessed name split',()=>{
 assert.equal(reservationNameKey({first:' OLIVER ',last:'Oetjen  '}),reservationNameKey({last:'Oliver Oetjen'}));
 assert.equal(duplicateCandidates({date:day,data:{last:'  oliver   OETJEN  '}},[booking('old')],[]).length,1);
});
test('the request own provisional reservation and its linked mail are not duplicates',()=>{
 const rows=[booking('own',day,'19:00',4,'Offen')],inbox=[mail('own-mail',{reservation_id:'own'})];assert.deepEqual(duplicateCandidates({date:day,data,reservationId:'own',mailId:'own-mail'},rows,inbox),[]);
});
test('other pending requests warn even before a reservation can be created',()=>{
 const incomplete=mail('other');incomplete.draft.people=null;incomplete.draft.time='';const matches=duplicateCandidates({date:day,data,mailId:'new'},[],[incomplete]);assert.equal(matches.length,1);assert.equal(matches[0].kind,'request');assert.equal(matches[0].people,null);
});
test('a booking and its original mail appear only once; other days, names and cancelled records do not warn',()=>{
 const rows=[booking('old'),booking('cancelled',day,'19:00',4,'Storniert'),booking('tomorrow','2026-11-20')];const inbox=[mail('old-mail',{reservation_id:'old'}),mail('ignored',{state:'ignored'}),mail('cancelled-mail',{reservation_id:'cancelled'})];assert.equal(duplicateCandidates({date:day,data,mailId:'new'},rows,inbox).length,1);
 assert.equal(duplicateCandidates({date:day,data:{first:'Mia',last:'Oetjen'}},rows,inbox).length,0);assert.equal(duplicateCandidates({date:'',data},rows,inbox).length,0);assert.equal(duplicateCandidates({date:day,data:{}},rows,inbox).length,0);
});
