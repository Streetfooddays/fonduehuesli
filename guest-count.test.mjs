import {test} from 'node:test';import assert from 'node:assert/strict';
import {bindGuestCounts,guestCountField} from './public/guest-count.mjs';
import {bookingSummary} from './public/core.mjs';
function setup(save){
 const r={id:'test',date:'2099-01-01',people:4,revision:2,status:'Bestätigt',data:'{"last":"Synthetic"}'},feedback={textContent:''},print={textContent:''},attrs={};
 const td={querySelector:s=>s.includes('feedback')?feedback:print};
 const input={value:'4',dataset:{guestCount:'test'},closest:()=>td,setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],blur(){return this.onblur();}};
 let total=260;const calls=[];
 bindGuestCounts({querySelectorAll:()=>[input]},{find:()=>r,save:async p=>{calls.push(p);return save?save(p):{id:r.id,people:p.people,revision:3};},saved:()=>total=bookingSummary([r]).revenue});
 return {input,r,feedback,attrs,calls,get total(){return total;}};
}
test('inline save updates effective counts and totals, accepts zero, and skips unchanged blur',async()=>{
 const s=setup();await s.input.onblur();assert.equal(s.calls.length,0);
 s.input.value='0';await s.input.onblur();assert.equal(s.calls[0].revision,2);assert.equal(s.r.people,0);assert.equal(s.total,0);assert.equal(s.feedback.textContent,'Gespeichert');assert.equal(s.input.readOnly,false);
});
test('bad values never reach server and failed saves preserve counts and expose errors',async()=>{
 const s=setup(()=>{throw Error('Bitte aktualisieren.');});
 for(const value of ['','-1','2.5','1001']){s.input.value=value;await s.input.onblur();assert.equal(s.calls.length,0);assert.equal(s.r.people,4);}
 s.input.value='3';await s.input.onblur();assert.equal(s.r.people,4);assert.equal(s.total,260);assert.equal(s.feedback.textContent,'Bitte aktualisieren.');assert.equal(s.attrs['aria-invalid'],'true');assert.equal(s.input.readOnly,false);
 s.input.onkeydown({key:'Escape',preventDefault(){}});assert.equal(s.input.value,'4');
});
test('double blur cannot submit the same change twice and feedback waits for persistence',async()=>{
 let finish;const s=setup(p=>new Promise(resolve=>finish=()=>resolve({people:p.people,revision:3})));
 s.input.value='6';const pending=s.input.onblur();await s.input.onblur();assert.equal(s.calls.length,1);assert.equal(s.total,260);finish();await pending;assert.equal(s.total,390);
});
test('day field is accessible, printable, escaped and lockable',()=>{
 const h=guestCountField({id:'x',date:'2099-01-01',people:4,data:'{"last":"<Test>"}'},true);
 assert(h.includes('Personenzahl für &lt;Test&gt;'));assert(h.includes('disabled'));assert(h.includes('min="0"'));assert(h.includes('guest-count-print'));
});
