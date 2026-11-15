import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {renderExcelWorkspace} from './public/excel-workspace.mjs';
const row=(id,date='2099-01-01')=>({id,date,time:'18:00',people:4,status:'Offen',table_no:'1',data:JSON.stringify({first:'Anna',last:'Muster',email:'anna@example.invalid'})});
const request=(id,booking=null)=>({id,reservation_id:booking?.id||null,received_at:'2098-12-01T10:00:00Z',state:booking?'imported':'review',sender:'Anna Muster <anna@example.invalid>',subject:'Synthetic request',issues:[],draft:booking?{date:booking.date,time:booking.time,people:booking.people,data:JSON.parse(booking.data)}:{date:'',time:'',people:null,data:{}}});
function mount(t,{rows=[],inbox=[],body='',date='2099-01-01'}={}){
 const {window,document}=parseHTML('<html><body><main id="root"></main></body></html>');globalThis.window=window;globalThis.document=document;
 // LinkeDOM models DOM events. These three browser layout/dialog APIs are recorded rather than rendered.
 window.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true';};window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.getAttribute('data-test-value')||this.querySelector('option[selected]')?.getAttribute('value')||this.querySelector('option')?.getAttribute('value')||'';},set(v){this.setAttribute('data-test-value',v);},configurable:true});
 const state={rows,inbox,outbox:[],layouts:[]},calls=[];const controller=renderExcelWorkspace(document.querySelector('#root'),{date,getState:()=>state,needsAction:m=>!['confirmed','ignored'].includes(m.state),onDate(){},readMail:async()=>({body}),notice(){},editRequest:id=>calls.push(['edit',id]),transfer:async id=>{calls.push(['transfer',id]);return null;},ignore:async id=>{calls.push(['ignore',id]);state.inbox.find(m=>m.id===id).state='ignored';}});
 t.after(()=>{controller.dispose();delete globalThis.window;delete globalThis.document;});return {document,state,calls,controller};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('a linked request highlights its actual row, scrolls to its week and opens the table dialog',t=>{
 const r=row('r');const {document,calls}=mount(t,{rows:[r],inbox:[request('m',r)],date:'2098-02-01'});
 assert.equal(document.querySelectorAll('.sheet-current-request').length,1);assert.equal(document.querySelector('.sheet-current-request').dataset.sheetId,'r');assert.equal(document.querySelector('.sheet-current-request').dataset.scrolled,'true');
 const show=document.querySelector('#wb-show-booking');assert.equal(show.disabled,false);show.click();assert.equal(document.querySelector('[data-sheet-id="r"]').dataset.scrolled,'true');
 document.querySelector('#wb-open-plan').click();assert(document.querySelector('.wb-plan-dialog').hasAttribute('open'));assert(document.querySelector('#wb-plan-content [data-floor-day="2099-01-01"]'));assert.deepEqual(calls,[]);
});
test('an unimported request is always showable as a blinking preview without creating a booking',t=>{
 const m=request('new');m.draft={date:'2099-02-01',time:'19:00',people:6,data:{first:'Oliver',last:'Muster'}};
 const {document,state,calls}=mount(t,{inbox:[m]});const show=document.querySelector('#wb-show-booking');assert.equal(show.disabled,false);show.click();
 assert.equal(document.querySelector('.sheet-current-request').dataset.sheetId,'request-preview-new');assert(document.querySelector('.sheet-request-preview').textContent.includes('Noch nicht übernommen'));assert.equal(state.rows.length,0);assert.deepEqual(calls,[]);
 document.querySelector('#wb-open-plan').click();assert(document.querySelector('#wb-plan-content [data-floor-day="2099-02-01"]'));
});
test('an unknown date never disables the plan button or silently opens an unrelated day',t=>{
 const {document,calls}=mount(t,{inbox:[request('unknown')]});assert.equal(document.querySelector('#wb-open-plan').disabled,false);
 document.querySelector('#wb-open-plan').click();assert(document.querySelector('.wb-plan-dialog').hasAttribute('open'));assert.equal(document.querySelector('#wb-plan-content [data-floor-day]'),null);
 const day=document.querySelector('#wb-plan-day');day.value='2099-02-03';day.onchange({target:day});assert(document.querySelector('#wb-plan-content [data-floor-day="2099-02-03"]'));assert.equal(document.querySelector('#wb-apply-tables').disabled,true);assert.deepEqual(calls,[]);
});
test('switching requests moves the sole highlight to the new week and existing row',t=>{
 const a=row('a'),b=row('b','2099-02-01'),m1=request('first',a),m2={...request('second',b),received_at:'2098-12-02T10:00Z'};const {document}=mount(t,{rows:[a,b],inbox:[m1,m2]});
 const selector=document.querySelector('#wb-request-select');selector.value='second';selector.onchange();assert.equal(document.querySelectorAll('.sheet-current-request').length,1);assert.equal(document.querySelector('.sheet-current-request').dataset.sheetId,'b');assert.equal(document.querySelector('#wb-plan-day').value,'2099-02-01');
});
test('already-received free text is recognized on opening and appears in the preview without a database write',async t=>{
 const {document,state,calls}=mount(t,{inbox:[request('free')],body:'Wir möchten am 12. Dezember um 19 Uhr für 6 Personen reservieren.\nGruss\nAnna Muster'});await tick();await tick();
 const d=state.inbox[0].draft;assert.equal(d.date,'2098-12-12');assert.equal(d.time,'19:00');assert.equal(d.people,6);assert.equal(d.data.last,'Muster');assert(document.querySelector('.sheet-request-preview').textContent.includes('Muster'));assert.equal(document.querySelector('.sheet-current-request').dataset.scrolled,'true');assert.equal(state.rows.length,0);assert.deepEqual(calls,[]);
});
test('ignore advances to the next request and marks its row while keeping reservations intact',async t=>{
 const a=row('a'),b=row('b'),m1=request('first',a),m2={...request('second',b),received_at:'2098-12-02T10:00Z'};const {document,state,calls}=mount(t,{rows:[a,b],inbox:[m1,m2]});
 document.querySelector('#wb-ignore').click();await tick();assert.equal(state.rows.length,2);assert.equal(state.rows[0].status,'Offen');assert.equal(state.inbox[0].state,'ignored');assert.equal(document.querySelector('.sheet-current-request').dataset.sheetId,'b');assert.deepEqual(calls,[['ignore','first']]);
});
