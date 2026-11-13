import {test} from 'node:test';import assert from 'node:assert/strict';import {tableGroupAssignment,tableGroupHint,TABLE_GROUPS} from './public/table-groups.mjs';
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
