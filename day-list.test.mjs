import {test} from 'node:test';import assert from 'node:assert/strict';
import {reservationRemarks,compactDayTable,bindInlineTimes} from './public/day-list.mjs';
test('compact list has arrival first, separate names and all three inline controls',()=>{
 const row={id:'x',date:'2099-01-01',people:4,time:'18:00',status:'Bestätigt',table_no:'2',period:'abend',arrived:true,note:'Unser Hinweis',data:JSON.stringify({last:'Muster',first:'Anna',phone:'079 123 45 67',email:'hidden@example.invalid',comment:'Ohne Alkohol'})};
 const html=compactDayTable([row],{arrival:()=>'<input data-arrival="x" checked>',people:()=>'<input data-guest-count="x">',table:()=>'<input data-table-inline="x">',origin:()=>'<details>?</details>',locked:()=>false});
 assert(html.indexOf('data-arrival="x"')<html.indexOf('Muster'));assert(html.indexOf('Muster')<html.indexOf('Anna'));for(const text of ['data-guest-count','data-time-inline','data-table-inline','079 123 45 67','Unser Hinweis','Ohne Alkohol','<details>?'])assert(html.includes(text));assert(!html.includes('hidden@example.invalid'));
 assert(compactDayTable([{...row,data:'{"last":"<script>","comment":"<img>"}'}],{arrival:()=>'',people:()=>'',table:()=>'',origin:()=>'',locked:()=>true}).includes('&lt;img&gt;'));
});
test('remarks retain team and mail text once, excluding import metadata and tracking pixels',()=>{
 assert.equal(reservationRemarks({note:'Unser Hinweis · Excel-Abgleich 11.11.2026: Woche / Zeile 21',data:'{"comment":"Bitte Fenstertisch"}'}),'Unser Hinweis\nBitte Fenstertisch');
 assert.equal(reservationRemarks({note:'Bitte Fenstertisch · Import aus aktueller Excel-Liste; bisher manuell bestätigt.',data:'{"comment":"Bitte Fenstertisch"}'}),'Bitte Fenstertisch');
 assert.equal(reservationRemarks({note:'Maileingang: Reservierung',data:'{"comment":"[http://click.promote.weebly.com/wf/open?upn=123]"}'}),'');
});
test('time edits save once with revision, update service and preserve prior value after failures',async()=>{
 const booking={id:'x',time:'18:00',period:'abend',revision:2};let callbacks=0,fail=false;const calls=[],feedback={},print={};
 const cell={querySelector:s=>s.includes('feedback')?feedback:print};const input={value:'18:00',dataset:{timeInline:'x'},validity:{badInput:false},closest:()=>cell,setAttribute(){},removeAttribute(){},blur(){return this.onblur();}};
 bindInlineTimes({querySelectorAll:()=>[input]},{find:()=>booking,save:async p=>{calls.push(p);if(fail)throw Error('Zwischenzeitlich geändert');return {time:p.time,period:p.time<'16:00'?'mittag':'abend',revision:3};},saved:()=>callbacks++});
 input.value='12:30';await input.onblur();assert.equal(calls[0].revision,2);assert.equal(booking.period,'mittag');assert.equal(print.textContent,'12:30');assert.equal(callbacks,1);await input.onblur();assert.equal(calls.length,1);
 input.value='25:00';await input.onblur();assert.equal(calls.length,1);
 fail=true;input.value='19:00';await input.onblur();assert.equal(booking.time,'12:30');assert.equal(callbacks,1);assert.equal(feedback.textContent,'Zwischenzeitlich geändert');assert.equal(input.readOnly,false);
 input.onkeydown({key:'Escape',preventDefault(){}});assert.equal(input.value,'12:30');
});
