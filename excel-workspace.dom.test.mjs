import {openReplyComposer} from './public/reply-composer.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {renderExcelWorkspace} from './public/excel-workspace.mjs';
const row=(id,date='2099-01-01')=>({id,date,time:'18:00',people:4,status:'Offen',table_no:'1',data:JSON.stringify({first:'Anna',last:'Muster',email:'anna@example.invalid'})});
const request=(id,booking=null)=>({id,reservation_id:booking?.id||null,received_at:'2098-12-01T10:00:00Z',state:booking?'imported':'review',sender:'Anna Muster <anna@example.invalid>',subject:'Synthetic request',issues:[],draft:booking?{date:booking.date,time:booking.time,people:booking.people,data:JSON.parse(booking.data)}:{date:'',time:'',people:null,data:{}}});
function mount(t,{rows=[],inbox=[],body='',date='2099-01-01',saveOverride=null,deleteRequest=null,confirmOverride=null,historyOverride=null}={}){
 const {window,document}=parseHTML('<html><body><main id="root"></main></body></html>');globalThis.window=window;globalThis.document=document;
 // LinkeDOM models DOM events. These three browser layout/dialog APIs are recorded rather than rendered.
 window.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true';};window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){const value=this.getAttribute('data-test-value');if(value!==null)return value;const option=this.querySelector('option[selected]')||this.querySelector('option');return option?(option.getAttribute('value')??option.textContent):'';},set(v){this.setAttribute('data-test-value',v);},configurable:true});
 const state={rows,inbox,outbox:[],layouts:[]},calls=[];const saveReservation=async payload=>{calls.push(['save',structuredClone(payload)]);if(saveOverride)await saveOverride(payload,state);const i=state.rows.findIndex(r=>r.id===(payload.id||payload.createId)),old=state.rows[i]||{};const saved={...old,id:payload.id||payload.createId,date:payload.date,time:payload.time,people:payload.people,status:payload.status,table_no:payload.tableNo,note:payload.note,data:JSON.stringify(payload.data),revision:(old.revision||0)+1};if(i>=0)state.rows[i]=saved;else state.rows.push(saved);};const controller=renderExcelWorkspace(document.querySelector('#root'),{date,...(historyOverride?{loadRequestHistory:historyOverride}:{}),confirm:confirmOverride||(()=>{}),saveReservation,afterSave:async(p,id)=>state.rows.find(r=>r.id===(p.id||id)),getState:()=>state,needsAction:m=>!['confirmed','ignored'].includes(m.state),onDate(){},readMail:async()=>({body}),notice(){},replyOnly:id=>calls.push(['reply-only',id]),deleteReservation:id=>{calls.push(['delete-request',id]);deleteRequest?.(id);},editRequest:id=>calls.push(['edit',id]),transfer:async id=>{calls.push(['transfer',id]);return null;},ignore:async id=>{calls.push(['ignore',id]);state.inbox.find(m=>m.id===id).state='ignored';}});
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

const inputEvent=(doc,field)=>field.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
const key=(tr,field,value)=>tr.onkeydown({target:field,key:value,preventDefault(){}});
test('Tab and Enter save changed rows without replacing inputs or disabling the next field',async t=>{
 const {document,state,calls,controller}=mount(t,{rows:[row('r')]});const tr=document.querySelector('[data-sheet-id="r"]'),phone=tr.querySelector('[name="phone"]'),first=tr.querySelector('[name="first"]');
 phone.value='079 000 00 00';inputEvent(document,phone);key(tr,phone,'Tab');assert.equal(first.disabled,false);await tick();await tick();
 assert.equal(state.rows[0].data.includes('079 000 00 00'),true);assert.equal(document.querySelector('[data-sheet-id="r"] [name="phone"]'),phone);assert.equal(controller.isDirty(),false);
 first.value='Oliver';inputEvent(document,first);key(tr,first,'Enter');await tick();assert.equal(JSON.parse(state.rows[0].data).first,'Oliver');assert.equal(calls.filter(c=>c[0]==='save').length,2);
});
test('rapid Tab edits are serialized with the latest revision and never overwrite input typed during a save',async t=>{
 let release;const gate=new Promise(resolve=>release=resolve);let count=0;const {document,state,calls}=mount(t,{rows:[{...row('r'),revision:4}],saveOverride:async()=>{if(++count===1)await gate;}});
 const tr=document.querySelector('[data-sheet-id="r"]'),first=tr.querySelector('[name="first"]'),phone=tr.querySelector('[name="phone"]');first.value='Oliver';inputEvent(document,first);key(tr,first,'Tab');
 phone.value='079 000 00 01';inputEvent(document,phone);key(tr,phone,'Tab');release();await tick();await tick();
 const saves=calls.filter(c=>c[0]==='save');assert.equal(saves.length,2);assert.equal(saves[0][1].revision,4);assert.equal(saves[1][1].revision,5);assert.equal(JSON.parse(state.rows[0].data).phone,'079 000 00 01');assert.equal(phone.value,'079 000 00 01');
});
test('failed automatic saves retain the edited text and can be retried with Enter',async t=>{
 let fail=true;const {document,state,controller}=mount(t,{rows:[row('r')],saveOverride:async()=>{if(fail)throw Error('Verbindung unterbrochen');}});
 const tr=document.querySelector('[data-sheet-id="r"]'),phone=tr.querySelector('[name="phone"]');phone.value='079 000 00 02';inputEvent(document,phone);key(tr,phone,'Tab');await tick();assert.equal(phone.value,'079 000 00 02');assert.equal(controller.isDirty(),true);assert(tr.textContent.includes('Verbindung unterbrochen'));
 fail=false;key(tr,phone,'Enter');await tick();assert.equal(JSON.parse(state.rows[0].data).phone,'079 000 00 02');assert.equal(controller.isDirty(),false);
});
test('every day has its own sticky scrollbar synchronized in both directions',t=>{
 const {document}=mount(t,{rows:[row('r')]});const days=[...document.querySelectorAll('[data-sheet-section]')];assert.equal(days.length,7);
 for(const day of days){const pane=day.querySelector('.table-scroll'),rail=day.querySelector('.sheet-horizontal-rail');assert(rail);rail.scrollLeft=150;rail.onscroll();assert.equal(pane.scrollLeft,150);pane.scrollLeft=270;pane.onscroll();assert.equal(rail.scrollLeft,270);}
});

test('new lines autosave only after name and guest count are complete and keep one empty entry row',async t=>{
 const {document,state,calls}=mount(t);const day=document.querySelector('[data-sheet-section="2099-01-01"]'),tr=day.querySelector('tr[data-sheet-new="true"]'),last=tr.querySelector('[name="last"]'),people=tr.querySelector('[name="people"]');
 last.value='Muster';inputEvent(document,last);key(tr,last,'Tab');await tick();assert.equal(calls.length,0);
 people.value='3';inputEvent(document,people);key(tr,people,'Tab');await tick();await tick();assert.equal(state.rows.length,1);assert.equal(state.rows[0].people,3);assert.equal(day.querySelectorAll('tr[data-sheet-new="true"]').length,1);assert.equal(tr.dataset.sheetNew,'false');
});

test('open requests can be skipped with arrows without confirmation, ignoring or reservation writes',t=>{
 const a=row('a'),b=row('b'),one=request('one',a),two={...request('two',b),received_at:'2098-12-02T10:00Z'};const {document,state,calls}=mount(t,{rows:[a,b],inbox:[one,two]});
 assert.equal(document.querySelector('#wb-prev-request').disabled,true);document.querySelector('#wb-next-request').click();assert.equal(document.querySelector('.sheet-current-request').dataset.sheetId,'b');assert.equal(document.querySelector('#wb-next-request').disabled,true);
 document.querySelector('#wb-prev-request').click();assert.equal(document.querySelector('.sheet-current-request').dataset.sheetId,'a');assert.deepEqual(state.inbox.map(m=>m.state),['imported','imported']);assert.deepEqual(calls,[]);
});
test('day scrollbar is rendered before the table, and gondola color and free count update after autosave',async t=>{
 const {document,state}=mount(t,{rows:[row('r')]});const day=document.querySelector('[data-sheet-section="2099-01-01"]'),rail=day.querySelector('.sheet-horizontal-rail'),pane=day.querySelector('.table-scroll');assert.equal(rail.nextElementSibling,pane);
 const tr=day.querySelector('[data-sheet-id="r"]'),table=tr.querySelector('[name="tableNo"]');table.value='G2';inputEvent(document,table);key(tr,table,'Tab');await tick();await tick();assert(tr.classList.contains('gondola-reservation'));assert(day.querySelector('[data-sheet-total]').textContent.includes('2 freie Gondeln'));
 table.value='1';inputEvent(document,table);key(tr,table,'Tab');await tick();await tick();assert(!tr.classList.contains('gondola-reservation'));assert(day.querySelector('[data-sheet-total]').textContent.includes('3 freie Gondeln'));assert.equal(state.rows.length,1);
});

test('each saved reservation exposes its own delete action; preview and blank entry rows do not',t=>{
 const {document,state,calls}=mount(t,{rows:[row('r')],inbox:[request('new')]});const saved=document.querySelector('[data-sheet-id="r"]');assert(saved.querySelector('[data-sheet-delete]'));assert.equal(document.querySelector('[data-sheet-new="true"] [data-sheet-delete]'),null);assert.equal(document.querySelector('[data-sheet-preview] [data-sheet-delete]'),null);
 saved.querySelector('[data-sheet-delete]').click();assert.deepEqual(calls,[['delete-request','r']]);assert.equal(state.rows.length,1,'Only the confirmation is requested at this stage');
});

test('only reply opens the response composer for unimported and linked requests without saving or confirming a reservation',t=>{
 const r=row('r'),m=request('m',r);const {document,state,calls}=mount(t,{rows:[r],inbox:[m]});document.querySelector('#wb-reply-only').click();assert.deepEqual(calls,[['reply-only','m']]);assert.equal(state.rows.length,1);assert.equal(state.rows[0].status,'Offen');assert.equal(state.inbox[0].state,'imported');
});

test('the reply editor submits an email-only payload and preserves the linked reservation and request state',async t=>{
 const r=row('r'),m=request('m',r),snapshot=structuredClone(r);const {document,state}=mount(t,{rows:[r],inbox:[m]});const dialog=document.createElement('dialog');document.body.append(dialog);const calls=[];
 openReplyComposer(dialog,{mail:m,booking:r,signature:'Sabrina',send:async payload=>calls.push(payload),readDelivery:async()=>null,retry:async()=>{},sent:async()=>{}});
 dialog.querySelector('[name=body]').value='Welche Ankunftszeit passt euch?';dialog.querySelector('[name=recipientReviewed]').checked=true;await dialog.querySelector('[data-reply-form]').onsubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(calls[0].mail_id,'m');assert.equal(calls[0].recipient,'anna@example.invalid');assert.equal(calls[0].body,'Welche Ankunftszeit passt euch?');assert.equal(calls[0].recipient_reviewed,true);for(const key of ['reservation','date','time','people','status','tableNo'])assert(!(key in calls[0]));assert.deepEqual(state.rows[0],snapshot);assert.equal(state.inbox[0].state,'imported');assert.equal(dialog.hasAttribute('open'),false);
});

test('a failed standalone reply retries the frozen answer with the same ID instead of composing a second send',async t=>{
 const m=request('m');const {document}=mount(t,{inbox:[m]});const dialog=document.createElement('dialog');document.body.append(dialog);let payload,done=0;const retryIds=[];
 openReplyComposer(dialog,{mail:m,signature:'Sabrina',send:async p=>{payload=p;throw Error('Synthetic offline');},readDelivery:async id=>({id,state:'failed',recipient:'anna@example.invalid',subject:'Re: Synthetic request',message_text:'Saved response'}),retry:async id=>retryIds.push(id),sent:async()=>done++});
 dialog.querySelector('[name=body]').value='Bitte melde uns deine Ankunftszeit.';dialog.querySelector('[name=recipientReviewed]').checked=true;await dialog.querySelector('[data-reply-form]').onsubmit({preventDefault(){}});
 assert(dialog.querySelector('[name=body]').disabled);assert.equal(dialog.querySelector('[data-reply-preview]').textContent,'Saved response');assert.equal(dialog.querySelector('[data-reply-retry]').hidden,false);await dialog.querySelector('[data-reply-retry]').onclick();assert.deepEqual(retryIds,[payload.id]);assert.equal(done,1);
});

test('overcapacity is a visible warning and does not stop Excel autosave',async t=>{
 const booking={...row('manual-capacity'),people:7,table_no:'7, 77, 777'};const {document,calls}=mount(t,{rows:[booking]});
 const tr=document.querySelector('[data-sheet-id="manual-capacity"]');assert.match(tr.querySelector('.sheet-table-capacity').textContent,/7 Personen bei 6/);
 const first=tr.querySelector('[name=first]');first.value='Updated';tr.oninput();tr.onkeydown({target:first,key:'Tab',preventDefault(){}});await tick();await tick();
 assert.equal(calls.filter(c=>c[0]==='save').length,1);assert.equal(calls[0][1].people,7);assert.equal(calls[0][1].tableNo,'7, 77, 777');assert.match(tr.querySelector('.sheet-table-capacity').textContent,/7 Personen bei 6/);
});

test('request panel shows customer remarks and the full original without opening a disclosure',async t=>{
 const body='Nachname: Muster\nVorname: Anna\nDatum: 01.01.2099\nUhrzeit: 18:00\nAnzahl Personen: 4\nE-Mail: anna@example.invalid\nTelefon: 01234\nBemerkungen: Ein Kinderstuhl bitte';
 const m=request('compact');const {document,calls}=mount(t,{inbox:[m],body});await tick();await tick();
 const panel=document.querySelector('#wb-request-content');assert.match(panel.querySelector('.request-summary').textContent,/Kinderstuhl/);assert.match(panel.querySelector('.request-summary').textContent,/01234/);assert.equal(panel.querySelector('.request-original'),null);assert.equal(panel.querySelector('.wb-mail-history .mail-body').textContent,body);assert.deepEqual(calls,[]);
});
test('a changed reply highlights the original reservation without creating another row',async t=>{
 const existing={...row('original','2099-01-01'),people:4};const m=request('changed');m.subject='Re: Reservation';
 const body='Wir kommen nun mit 6 Personen.\nGruss Anna Muster\n\n-----Original Message-----\nVon: Anna Muster <anna@example.invalid>\n\nNachname: Muster\nVorname: Anna\nDatum: 01.01.2099\nUhrzeit: 18:00\nAnzahl Personen: 4\nE-Mail: anna@example.invalid';
 const {document,state,calls}=mount(t,{rows:[existing],inbox:[m],body});await tick();await tick();
 assert.equal(document.querySelector('.sheet-current-request').dataset.sheetId,'original');assert.equal(document.querySelector('#wb-transfer').textContent,'Abweichung prüfen');assert.equal(document.querySelector('#wb-confirm').textContent,'Bestehende Reservation prüfen');assert.equal(state.rows.length,1);assert.deepEqual(calls,[]);
});

test('confirmation review and errors remain visible in the request panel',async t=>{
 const booking=row('approval'),m=request('approval-mail',booking);let outcome={outcome:'review'};
 const {document}=mount(t,{rows:[booking],inbox:[m],confirmOverride:async()=>outcome});await tick();document.querySelector('#wb-confirm').click();await tick();assert.match(document.querySelector('#wb-request-feedback').textContent,/manuelle Freigabe/);
 outcome={outcome:'error',message:'Versandverbindung unterbrochen.'};document.querySelector('#wb-confirm').click();await tick();assert.equal(document.querySelector('#wb-request-feedback').textContent,'Versandverbindung unterbrochen.');
});

test('selected request automatically shows the whole received and sent thread plus its matched booking',async t=>{
 const r=row('matched'),m=request('thread',r);
 const historyOverride=async()=>({booking:r,kind:'linked',candidates:[r],messages:[{type:'incoming',subject:'Anfrage',body:'Vollständige ursprüngliche Anfrage'},{type:'reply',subject:'Rückfrage',message_text:'Unsere vollständige Antwort'},{type:'incoming',subject:'Re: Rückfrage',body:'Vollständige Antwort des Gastes'},{type:'confirmation',message_text:'Unsere Bestätigung'}]});
 const {document,calls}=mount(t,{rows:[r],inbox:[m],historyOverride});await tick();await tick();
 const history=document.querySelector('[data-request-history]');assert.equal(history.querySelectorAll('.reservation-mail-message').length,4);assert.equal(history.querySelectorAll('details').length,0);assert(history.textContent.includes('Unsere vollständige Antwort'));assert(history.textContent.includes('Unsere Bestätigung'));assert.equal(document.querySelector('[data-request-booking]').dataset.requestBooking,'matched');assert.equal(document.querySelector('.sheet-current-request').dataset.sheetId,'matched');assert.deepEqual(calls,[]);
});
test('ambiguous requests offer reservation candidates without selecting or linking one',async t=>{
 const a=row('a'),b=row('b','2099-02-01'),m=request('ambiguous');m.draft={is_reply:true,data:{email:'anna@example.invalid'}};
 const {document,calls}=mount(t,{rows:[a,b],inbox:[m]});await tick();await tick();
 assert.equal(document.querySelectorAll('[data-request-booking]').length,2);assert(document.querySelector('[data-request-match]').textContent.includes('Mehrere mögliche'));document.querySelector('[data-request-booking="b"]').click();assert.equal(document.querySelector('.sheet-current-request').dataset.sheetId,'b');assert.deepEqual(calls,[]);assert.equal(m.reservation_id,null);
});
test('switching requests ignores a slower previous history and allows retry after a history failure',async t=>{
 let release;const gate=new Promise(resolve=>release=resolve),a=row('a'),b=row('b','2099-02-01'),m1=request('one',a),m2=request('two',b);let attempts=0;
 const {document}=mount(t,{rows:[a,b],inbox:[m1,m2],historyOverride:async m=>{if(m.id==='one'){await gate;return {booking:a,messages:[{type:'incoming',body:'Old request thread'}]};}if(++attempts===1)throw Error('Connection lost');return {booking:b,messages:[{type:'incoming',body:'Current complete thread'}]};}});await tick();
 const select=document.querySelector('#wb-request-select');select.value='two';select.onchange();await tick();await tick();assert(document.querySelector('[data-request-history][role=alert]'));release();await tick();assert(!document.querySelector('[data-request-history]').textContent.includes('Old request thread'));
 document.querySelector('[data-request-history] button').click();await tick();await tick();assert(document.querySelector('[data-request-history]').textContent.includes('Current complete thread'));assert.equal(document.querySelector('[data-request-history]').hasAttribute('role'),false);
});

test('contact search lists all reservations matching email or telephone even with a linked date match',async t=>{
 const a=row('a'),b={...row('b','2099-02-01'),data:JSON.stringify({first:'Other',last:'Name',email:'other@example.invalid',phone:'0791234567'})},c=row('c','2099-03-01'),m=request('all-hits',a);m.draft.data.phone='+41 79 123 45 67';
 const {document,calls}=mount(t,{rows:[a,b,c],inbox:[m]});await tick();await tick();
 assert.equal(document.querySelectorAll('[data-request-booking]').length,3);const hits=document.querySelector('[data-request-match]');assert(hits.textContent.includes('Telefon'));assert(hits.textContent.includes('E-Mail'));assert(hits.textContent.includes('01.02.2099'));assert.deepEqual(calls,[]);
});
