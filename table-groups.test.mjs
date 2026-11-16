import {test} from 'node:test';import assert from 'node:assert/strict';import {tableGroupAssignment,tableGroupHint,TABLE_GROUPS,LARGE_TABLE_GROUPS} from './public/table-groups.mjs';
test('all four groups expand and contract in pairs of two guests',()=>{
 for(const group of TABLE_GROUPS)for(let people=1;people<=6;people++){
  const expected=group.slice(0,Math.ceil(people/2)).join(', ');
  assert.equal(tableGroupAssignment(group[0],people),expected);assert.equal(tableGroupAssignment(group.join(', '),people),expected);
 }
});
test('other tables, mixed groups, unclear assignments and empty zero-person assignments are preserved',()=>{
 for(const value of ['4','G1','5, 6','5, 21','55','5 (55?)',''])assert.equal(tableGroupAssignment(value,4),value);
 assert.equal(tableGroupAssignment('5, 55',0),'5, 55');assert.equal(tableGroupAssignment('Tisch 6 und 66',5),'6, 66, 666');
 assert.equal(tableGroupAssignment('7',7),'7, 77, 777');assert.match(tableGroupHint('7',7),/7 Personen bei 6/);assert.match(tableGroupHint('5',3),/5, 55/);
});

test('table 20 grows at five and nine guests; other large groups retain their original rules',()=>{
 for(const [i,group] of LARGE_TABLE_GROUPS.entries())for(let people=1;people<=20;people++){
  const limits=i===0?[4,8,11]:[4,6,8,11];const first=limits.findIndex(n=>people<=n),n=first<0?group.length:first+1;
  assert.equal(tableGroupAssignment(group[0],people),group.slice(0,n).join(', '));assert.equal(tableGroupAssignment(group.join(', '),people),group.slice(0,n).join(', '));
 }
 assert.equal(tableGroupAssignment('20',4),'20');assert.equal(tableGroupAssignment('20',5),'20, 120');assert.equal(tableGroupAssignment('20',8),'20, 120');assert.equal(tableGroupAssignment('20',9),'20, 120, 220');assert.equal(tableGroupAssignment('20',11),'20, 120, 220');
 assert.match(tableGroupHint('20',12),/12 Personen bei 11/);assert.equal(tableGroupAssignment('20',12),'20, 120, 220');
 assert.equal(tableGroupAssignment('21',9),'21, 121, 221, 130');assert.equal(tableGroupAssignment('23',11),'23, 123, 223, 132');
 assert.equal(tableGroupAssignment('20, 21',14),'20, 21');
});
test('121 and 124 are no longer special ten-seat tables',()=>{
 for(const table of ['121','124']){assert.equal(tableGroupAssignment(table,11),table);assert.equal(tableGroupHint(table,11),'');}
});
