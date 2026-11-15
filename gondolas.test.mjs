import {test} from 'node:test';import assert from 'node:assert/strict';
import {isGondolaReservation,gondolaRowClass,gondolaAvailability} from './public/gondolas.mjs';
const day='2099-01-01',r=(id,extra={})=>({id,date:day,time:'18:00',people:2,status:'Bestätigt',data:'{}',...extra});
test('gondolas are detected from canonical flag, guest data or exact G1–G3 table numbers',()=>{
 for(const booking of [r('a',{gondola:1}),r('b',{data:'{"gondola":"Ja"}'}),r('c',{table_no:'G 2'}),r('d',{gondola:true})])assert(isGondolaReservation(booking));
 for(const booking of [r('a',{gondola:0}),r('b',{data:'{"gondola":"Nein"}'}),r('c',{table_no:'1'}),r('d',{gondola:'0'})])assert(!isGondolaReservation(booking));
});
test('active gondolas are yellow while waiting, cancelled and deleted entries retain their own styling',()=>{for(const status of ['Bestätigt','Offen','Rückfrage nötig'])assert.equal(gondolaRowClass(r('a',{status,gondola:1})),'gondola-reservation');for(const status of ['Warteliste','Storniert'])assert.equal(gondolaRowClass(r('a',{status,gondola:1})),'');assert.equal(gondolaRowClass(r('a',{gondola:1,deleted_at:'2098-01-01'})),'');});
test('free count uses three gondolas, service times independently, and unknown times in both services',()=>{
 const rows=[r('a',{time:'12:00',table_no:'G1'}),r('b',{gondola:1}),r('c',{status:'Warteliste',table_no:'G3'}),r('d',{status:'Storniert',gondola:1}),r('other',{date:'2099-01-02',gondola:1})];
 assert.deepEqual(gondolaAvailability(rows,day),{free:2,midday:2,evening:2,total:3});rows.push(r('unknown',{time:'',gondola:1}));assert.equal(gondolaAvailability(rows,day).free,1);rows.push(r('third',{gondola:1}),r('overbooked',{gondola:1}));assert.equal(gondolaAvailability(rows,day).free,0);
});

test('released gondolas stop consuming current capacity while arrival history and row styling remain',()=>{const old=r('old',{gondola:1,table_no:'G1',arrived:true,released_tables:['G1']});assert.equal(gondolaAvailability([old],day).free,3);assert.equal(gondolaRowClass(old),'gondola-reservation');assert.equal(old.arrived,true);});
