import {test} from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {filterMailRequests,renderMailSearch} from './public/mail-search.mjs';
const items=[{id:'open',sender:'team@example.invalid',subject:'Neue Reservation',received_at:'2026-11-16T08:00:00Z',draft:{date:'2026-12-10',data:{first:'Aline',last:'Muster'}}},{id:'archive',reservation_id:'booking',state:'confirmed',sender:'gast@example.invalid',subject:'Fondue am Abend',draft:{data:{last:'Altername'}}}];
const rows=[{id:'booking',date:'2026-12-11',time:'18:30',status:'Bestätigt',data:JSON.stringify({first:'Christian',last:'Stächele',email:'christian@example.invalid'})}];
test('mail search includes open and archived mail, booking details, original draft and local dates',()=>{
 for(const query of ['Stachele','CHRISTIAN','christian@example.invalid','11.12.2026','18:30','Altername','Fondue Abend'])assert.deepEqual(filterMailRequests(items,rows,query).map(m=>m.id),['archive']);
 for(const query of ['Aline','10.12.2026','2026-12-10','16.11.2026'])assert.deepEqual(filterMailRequests(items,rows,query).map(m=>m.id),['open']);
 assert.equal(filterMailRequests(items,rows,'  ').length,2);assert.equal(filterMailRequests(items,rows,'Muster Fondue').length,0);assert.equal(items.length,2);
});
test('typing reveals matching archive entries immediately, preserves focus and clears without actions',t=>{
 const prior=globalThis.document;const {document}=parseHTML('<main id="root"></main>');globalThis.document=document;t.after(()=>{if(prior)globalThis.document=prior;else delete globalThis.document;});let binds=0;const searches=[];
 renderMailSearch(document.querySelector('#root'),{items,rows,needsAction:m=>m.id==='open',cards:matches=>matches.map(m=>`<article data-request-id="${m.id}">${m.subject}</article>`).join(''),bind:()=>binds++,onQuery:q=>searches.push(q)});
 const input=document.querySelector('input');assert(!document.querySelector('details').hasAttribute('open'));input.value='stachele';input.oninput();assert.equal(document.querySelector('input'),input);assert(document.querySelector('details').hasAttribute('open'));assert.equal(document.querySelectorAll('article').length,1);assert.match(document.querySelector('#mail-search-count').textContent,/1 von 2/);
 input.value='does-not-exist';input.oninput();assert.match(document.querySelector('#mail-search-results').textContent,/Keine passenden/);
 document.querySelector('#mail-search-clear').onclick();assert.equal(input.value,'');assert.equal(document.querySelectorAll('article').length,2);assert.equal(document.querySelector('#mail-search-clear').disabled,true);assert.equal(binds,4);assert.deepEqual(searches,['','stachele','does-not-exist','']);
});
test('saved search text is escaped and never interpreted as markup',()=>{
 const {document}=parseHTML('<main></main>');renderMailSearch(document.querySelector('main'),{items:[],rows:[],needsAction:()=>false,cards:()=>'',query:'"><img src=x onerror=alert(1)>'});assert.equal(document.querySelector('img'),null);assert.match(document.querySelector('input').value,/img src/);
});
