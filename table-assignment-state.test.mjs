import {test} from 'node:test';import assert from 'node:assert/strict';import {tableAssignmentState} from './public/table-assignment-state.mjs';
const row=(id,table_no,time='18:00')=>({id,table_no,time,date:'2099-01-01',period:time?'abend':'ungeklaert',people:2,status:'Bestätigt'});
test('unassigned is orange, assigned is green, exact table conflicts are red',()=>{
 const own=row('own','');assert.equal(tableAssignmentState(own,[]).state,'unassigned');assert.equal(tableAssignmentState({...own,table_no:'2'},[row('other','20')]).state,'assigned');
 const state=tableAssignmentState({...own,table_no:'2'},[row('other','2')]);assert.equal(state.state,'conflict');assert.deepEqual(state.conflictTables,['2']);
});
test('cancelled, deleted, empty, self and other-day entries do not block assignments',()=>{
 const own=row('own','5');const others=[own,{...row('c','5'),status:'Storniert'},{...row('d','5'),deleted_at:'now'},{...row('zero','5'),people:0},{...row('day','5'),date:'2099-01-02'}];assert.equal(tableAssignmentState(own,others).state,'assigned');assert.equal(tableAssignmentState({...own,status:'Storniert'},others).state,'inactive');
});
test('lunch and dinner are independent, but unknown time blocks both',()=>{
 const own=row('own','G1');assert.equal(tableAssignmentState(own,[{...row('lunch','G1','12:00'),period:'mittag'}]).state,'assigned');assert.equal(tableAssignmentState(own,[row('unknown','G1','')]).state,'conflict');
});
test('typing previews side tables from the group rules and clears conflicts when choosing another group',()=>{
 const own={...row('own',''),people:4},other=row('other','55');assert.equal(tableAssignmentState(own,[other],'5',true).state,'conflict');assert.equal(tableAssignmentState(own,[other],'6',true).state,'assigned');assert.equal(tableAssignmentState(own,[other],'',true).state,'unassigned');
 assert.equal(tableAssignmentState({...own,people:8},[],'5',true).state,'unassigned');
});
test('stored assignments are not expanded retroactively and explicit off-plan numbers work',()=>{
 assert.equal(tableAssignmentState({...row('own','5'),people:4},[row('other','55')]).state,'assigned');assert.equal(tableAssignmentState(row('own','99'),[row('other','99')]).state,'conflict');
});
