import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {beforeSwissNoon,calendarColor,calendarPeople,renderCalendarAdmin} from './public/reservation-calendar.mjs';
test('capacity thresholds and every manual color',()=>{
 for(const [n,color] of [[0,'green'],[100,'green'],[101,'orange'],[140,'orange'],[141,'orange'],[500,'orange']])assert.equal(calendarColor(n),color);
 for(const color of ['green','orange','red'])assert.equal(calendarColor(200,color),color);
});
test('occupancy counts active people and excludes waiting, cancelled and deleted reservations',()=>{
 const rows=['Offen','Bestätigt','Rückfrage nötig','Warteliste','Storniert'].map(status=>({date:'2026-11-21',status,people:20}));
 rows.push({...rows[0],deleted_at:'2026-11-21',people:100},{...rows[0],date:'2026-11-22',people:100});
 assert.equal(calendarPeople(rows,'2026-11-21'),60);
});
test('same-day cutoff uses Zurich time at noon, including daylight saving time',()=>{
 assert(beforeSwissNoon('2026-11-21',new Date('2026-11-21T10:59:59Z')));
 assert(!beforeSwissNoon('2026-11-21',new Date('2026-11-21T11:00:00Z')));
 assert(!beforeSwissNoon('2026-11-20',new Date('2026-11-21T10:00:00Z')));
 assert(beforeSwissNoon('2026-11-22',new Date('2026-11-21T22:00:00Z')));
 assert(!beforeSwissNoon('2027-06-01',new Date('2027-06-01T10:00:00Z')));
});
const tick=()=>new Promise(r=>setImmediate(r));
function widget(){
 const {document,window}=parseHTML('<html><head></head><body><form><p>Für den gleichen Tag bitte anrufen ab 13.00 Uhr auf 079 484 46 84</p><input id="input-618423413317317508" name="date"><input id="input-367563345927268218" name="time"><button type="submit">Absenden</button></form></body></html>');
 window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};window.HTMLElement.prototype.setCustomValidity=function(v){this.validityMessage=v;};
 let now='2026-11-21T10:00:00Z',fail=false,api=[{date:'2026-11-21',status:'green',is_open:true,bookable:true},{date:'2026-11-22',status:'green',is_open:false,bookable:false},{date:'2026-11-24',status:'orange',is_open:true,bookable:true},{date:'2026-11-25',status:'red',is_open:true,bookable:false}];
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return new Date(now).getTime();}}
 vm.runInNewContext(readFileSync('public/website-calendar.js','utf8'),{document,window,Date:Clock,Intl,Event:window.Event,AbortController,setTimeout,clearTimeout,setInterval:()=>0,fetch:async()=>{if(fail)throw Error('offline');return {ok:true,json:async()=>api};}});
 return {document,setTime:v=>now=v,setAPI:v=>api=v,setFail:v=>fail=v};
}
test('website shows live colors, closed days and 19 quarter-hour arrival options',async()=>{
 const {document}=widget();document.querySelector('.fh-date-trigger').click();await tick();
 assert.equal(document.querySelector('[data-date="2026-11-21"]').disabled,false);
 assert.equal(document.querySelector('[data-date="2026-11-22"]').disabled,true);
 assert(document.querySelector('[data-date="2026-11-24"]').classList.contains('fh-orange'));
 assert.equal(document.querySelector('[data-date="2026-11-24"]').disabled,false);
 assert(document.querySelector('[data-date="2026-11-25"]').classList.contains('fh-red'));
 assert.equal(document.querySelector('[data-date="2026-11-25"]').disabled,true);
 const opts=[...document.querySelectorAll('[data-fh-time-select] option')].slice(1).map(o=>o.value);assert.equal(opts.length,19);assert.equal(opts[0],'17:00');assert.equal(opts.at(-1),'21:30');
 assert(document.querySelector('form p').textContent.includes('online bis 12.00 Uhr'));
});
test('selection rechecks the book and refuses a date newly set red',async()=>{
 const x=widget();x.document.querySelector('.fh-date-trigger').click();await tick();
 x.setAPI([{date:'2026-11-24',status:'red',is_open:true,bookable:false}]);x.document.querySelector('[data-date="2026-11-24"]').click();await tick();
 assert.equal(x.document.querySelector('#input-618423413317317508').value,'');assert(x.document.querySelector('#fh-date-dialog').open);
});
test('today becomes unavailable at noon even with a previously green response',async()=>{
 const x=widget();x.document.querySelector('.fh-date-trigger').click();await tick();x.setTime('2026-11-21T11:00:00Z');x.document.querySelector('[data-date="2026-11-21"]').click();await tick();
 assert.equal(x.document.querySelector('#input-618423413317317508').value,'');assert.equal(x.document.querySelector('[data-date="2026-11-21"]').disabled,true);
});
test('network errors fail closed and present a retry button',async()=>{
 const x=widget();x.setFail(true);x.document.querySelector('.fh-date-trigger').click();await tick();
 assert([...x.document.querySelectorAll('.fh-day')].every(b=>b.disabled));assert.equal(x.document.querySelector('#fh-calendar-retry').hidden,false);
});
test('admin saves all manual choices with revision and keeps failed changes visibly unsaved',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>');const oldDocument=globalThis.document;globalThis.document=document;
 const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.getAttribute('data-value')??this.querySelector('option[selected]')?.value??this.querySelector('option')?.value;},set(v){this.setAttribute('data-value',v);}});
 try{
  const root=document.querySelector('main'),calls=[];let revision=0,reject=false;
  await renderCalendarAdmin(root,{selected:'',rows:[],onDate(){},notice(){},req:async()=>[],rpc:async(name,body)=>{if(name==='reservation_calendar')return [{date:'2026-11-24',status:'green',is_open:true,bookable:true}];if(reject)throw Error('conflict');assert.equal(body.p.revision,revision);calls.push(body.p);return {...body.p,revision:++revision};}});
  const status=root.querySelector('[data-calendar-field="status"]');
  for(const value of ['green','orange','red','auto']){status.value=value;await status.onchange();}
  assert.deepEqual(calls.map(x=>x.status),['green','orange','red','auto']);
  reject=true;status.value='red';await status.onchange();assert.equal(status.value,'auto');assert(root.textContent.includes('Bitte aktualisieren'));
 }finally{if(descriptor)Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);else delete window.HTMLSelectElement.prototype.value;globalThis.document=oldDocument;}
});
