import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {guest,escapeHTML} from './public/core.mjs';
const app=readFileSync(new URL('./public/app.mjs',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function bindDayReservationDeletes(){'),app.indexOf('\nfunction compactDayTable('));
function setup(fail=false){
 const controls=Object.fromEntries(['close-day-delete','cancel-day-delete','confirm-day-delete','day-delete-error'].map(id=>['#'+id,{disabled:false,textContent:''}]));
 const trash={dataset:{deleteDay:'sample'}},calls=[];
 const ctx={rows:[{id:'sample',date:'2099-01-01',time:'19:00',people:2,table_no:'4',revision:7,data:'{"last":"Muster","first":"Anna"}'}],inbox:[{id:'mail',reservation_id:'sample',state:'imported'}],document:{querySelectorAll:()=>[trash]},dialog:{classList:{remove(){}},close(){this.open=false;},showModal(){this.open=true;}},$:s=>controls[s],guest,e:escapeHTML,fmt:d=>d,rpc:async(name,p)=>{calls.push([name,p]);if(fail)throw Error('Reservation wurde zwischenzeitlich geändert.');},render:()=>{ctx.rendered=true;},notice:msg=>{ctx.message=msg;}};
 vm.runInNewContext(source+'\nbindDayReservationDeletes();',ctx);return {ctx,controls,trash,calls};
}
test('trash opens an in-app confirmation without relying on browser confirm; cancel leaves data untouched',()=>{
 const {ctx,controls,trash,calls}=setup();trash.onclick();assert.equal(ctx.dialog.open,true);assert.match(ctx.dialog.innerHTML,/Anna/);assert.match(ctx.dialog.innerHTML,/Reservation löschen/);assert.equal(calls.length,0);controls['#cancel-day-delete'].onclick();assert.equal(ctx.dialog.open,false);assert.equal(ctx.rows.length,1);assert.equal(calls.length,0);
});
test('confirm passes date and revision, removes the row, archives its request and refreshes the view',async()=>{
 const {ctx,controls,trash,calls}=setup();trash.onclick();await controls['#confirm-day-delete'].onclick();assert.equal(calls.length,1);assert.equal(calls[0][0],'delete_day_reservation');assert.equal(calls[0][1].p.revision,7);assert.equal(calls[0][1].p.date,'2099-01-01');assert.equal(ctx.rows.length,0);assert.equal(ctx.inbox[0].state,'ignored');assert.equal(ctx.dialog.open,false);assert.equal(ctx.rendered,true);assert.equal(ctx.message,'Reservation gelöscht.');
});
test('save errors remain visible in the dialog and the original reservation remains available',async()=>{
 const {ctx,controls,trash}=setup(true);trash.onclick();await controls['#confirm-day-delete'].onclick();assert.equal(ctx.dialog.open,true);assert.equal(ctx.rows.length,1);assert.match(controls['#day-delete-error'].textContent,/zwischenzeitlich geändert/);assert.equal(controls['#confirm-day-delete'].disabled,false);assert.equal(ctx.rendered,undefined);
});
