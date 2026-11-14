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
 assert.throws(()=>tableGroupAssignment('7',7),/maximal 6 Personen/);assert.match(tableGroupHint('5',3),/5, 55/);
});

test('large groups use 4, 6, 8 and 11-guest limits with the confirmed fourth-table mapping',()=>{
 for(const group of LARGE_TABLE_GROUPS)for(let people=1;people<=11;people++){
  const n=people<=4?1:people<=6?2:people<=8?3:4;
  assert.equal(tableGroupAssignment(group[0],people),group.slice(0,n).join(', '));
  assert.equal(tableGroupAssignment(group.join(', '),people),group.slice(0,n).join(', '));
 }
 assert.equal(tableGroupAssignment('20',10),'20, 120, 220, 131');assert.equal(tableGroupAssignment('23',11),'23, 123, 223, 133');
 assert.throws(()=>tableGroupAssignment('21',12),/maximal 11/);assert.equal(tableGroupAssignment('20, 21',14),'20, 21');
});
