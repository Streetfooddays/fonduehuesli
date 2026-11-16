import {test} from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {filterSentConfirmations,renderConfirmationSearch} from './public/confirmation-search.mjs';
const rows=[{id:'r',date:'2026-12-10',time:'18:30',data:JSON.stringify({first:'Claudia',last:'Müller',email:'guest@example.invalid'})}];
const outbox=[{id:'sent',reservation_id:'r',recipient:'actual@example.invalid',subject:'Dein Fondueabend',state:'sent',sent_at:'2026-11-16T09:00:00Z'},{id:'other',recipient:'other@example.invalid',subject:'Gruppe',state:'sent',sent_at:'2026-11-15T09:00:00Z'},{id:'pending',reservation_id:'r',recipient:'actual@example.invalid',subject:'Pending',state:'pending'}];
test('search sent confirmations by guest, actual recipient, subject, reservation and sent date',()=>{
 for(const query of ['claudia muller','actual@example.invalid','Fondueabend','10.12.2026','16.11.2026','18:30'])assert.deepEqual(filterSentConfirmations(outbox,rows,query).map(o=>o.id),['sent']);
 assert.equal(filterSentConfirmations(outbox,rows,'').length,2);assert.equal(filterSentConfirmations(outbox,rows,'Pending').length,0);assert.equal(outbox.length,3);
});
test('filtering and clearing preserve the search field and detail buttons without sending or retrying',()=>{
 const {document}=parseHTML('<main></main>');let binds=0;const queries=[];renderConfirmationSearch(document.querySelector('main'),{outbox,rows,bind:()=>binds++,onQuery:q=>queries.push(q)});
 const input=document.querySelector('input');input.value='muller';input.oninput();assert.equal(document.querySelector('input'),input);assert.equal(document.querySelectorAll('[data-sent-mail]').length,1);assert.equal(document.querySelector('[data-sent-mail]').dataset.sentMail,'sent');assert.match(document.querySelector('#confirmation-search-count').textContent,/1 von 2/);
 input.value='not-found';input.oninput();assert.match(document.querySelector('#confirmation-search-results').textContent,/Keine passenden/);document.querySelector('#confirmation-search-clear').onclick();assert.equal(input.value,'');assert.equal(document.querySelectorAll('[data-sent-mail]').length,2);assert.equal(document.querySelector('#confirmation-search-clear').disabled,true);assert.equal(binds,4);assert.deepEqual(queries,['','muller','not-found','']);
});
test('search text and confirmation fields are escaped and incomplete dates do not break rendering',()=>{
 const {document}=parseHTML('<main></main>');renderConfirmationSearch(document.querySelector('main'),{outbox:[{id:'safe',state:'sent',recipient:'<img src=x>',subject:'<script>bad</script>',sent_at:null}],rows:[],query:''});assert.equal(document.querySelector('img,script'),null);assert.match(document.querySelector('#confirmation-search-results').textContent,/Versanddatum offen/);
});
