import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {reservationMailIndex,reservationMailButton,reservationMailHistoryHTML,openReservationMailHistory,loadReservationMailHistory,reservationMailDisclosure,bindReservationMailDisclosure} from './public/reservation-mail-history.mjs';
import {renderExcelOverview} from './public/excel-overview.mjs';
const booking=(id,date='2026-12-10')=>({id,date,time:'19:00',people:4,status:'Bestätigt',data:JSON.stringify({first:'Anna',last:'Muster',email:'anna@example.test'})});
test('only associated received or actually sent mail creates the envelope',()=>{
 const a=booking('a'),b=booking('b','2026-12-11'),c=booking('c','2026-12-12');
 const inbox=[{id:'m',reservation_id:'a',state:'ignored',received_at:'2026-11-01T12:00:00Z'}];
 const sent=[{id:'o',reservation_id:'a',mail_id:'m',state:'sent',sent_at:'2026-11-01T13:00:00Z'},{id:'unsent',reservation_id:'c',state:'failed'}];
 const replies=[{id:'reply',mail_id:'m',state:'sent',sent_at:'2026-11-02T12:00:00Z'},{id:'pending',mail_id:'m',state:'queued'},{id:'unrelated',mail_id:'other',state:'sent'}];
 const index=reservationMailIndex([a,b,c],inbox,sent,replies);assert.deepEqual(index.get('a').map(m=>m.id),['m','o','reply']);assert(reservationMailButton(a,index).includes('✉'));assert.equal(reservationMailButton(b,index),'');assert.equal(reservationMailButton(c,index),'');
});
test('shared addresses and ambiguous matches do not expose another reservation thread',()=>{
 const a=booking('a'),b=booking('b','2026-12-11');const mail={id:'reply',draft:{date:a.date,time:'19:00',people:4,data:{email:'anna@example.test'}}};
 let index=reservationMailIndex([a,b],[mail]);assert.equal(index.get('a').length,1);assert(!index.has('b'));
 index=reservationMailIndex([a,booking('duplicate')],[mail]);assert.equal(index.size,0);
 const changed={id:'changed',draft:{date:'2026-12-20',time:'18:00',people:5,is_reply:true,data:{email:'anna@example.test'},thread_references:[{date:a.date,time:a.time,people:a.people,data:{email:'anna@example.test'}}]}};
 index=reservationMailIndex([a,b],[changed]);assert(index.has('a'));assert(!index.has('b'));
});
test('sent confirmations without an incoming message still have a history',()=>{const a=booking('a');const index=reservationMailIndex([a],[],[{id:'s',reservation_id:'a',state:'sent'}]);assert.equal(index.get('a')[0].type,'confirmation');assert(reservationMailButton(a,index));});
test('mail content and headers are escaped and every direction stays readable',()=>{
 const html=reservationMailHistoryHTML([{type:'incoming',subject:'<script>x</script>',sender:'<img src=x>',body:'<svg onload=x>\nOriginal text'},{type:'reply',recipient:'anna@example.test',subject:'Antwort',message_text:'Reply text'}]);
 assert(!html.includes('<script>'));assert(!html.includes('<svg'));assert(html.includes('&lt;svg'));assert(html.includes('Original text'));assert(html.includes('Antwort gesendet'));assert(html.includes('Reply text'));
});
test('Excel envelopes open the reservation thread without saving or dirtying the row',()=>{
 const {document,window}=parseHTML('<div id="root"></div>');globalThis.document=document;globalThis.window=window;const root=document.querySelector('#root'),a=booking('a'),b=booking('b'),index=reservationMailIndex([a,b],[{id:'m',reservation_id:'a'}]);let opened=null,saved=0;
 renderExcelOverview(root,{rows:[a,b],date:a.date,mailButton:r=>reservationMailButton(r,index),onOpenMail:id=>opened=id,save:()=>saved++,onSaved:()=>{},onDate:()=>{},notice:()=>{}});
 assert.equal(root.querySelectorAll('[data-reservation-mail]').length,1);root.querySelector('[data-reservation-mail]').dispatchEvent(new window.Event('click',{bubbles:true}));assert.equal(opened,'a');assert.equal(saved,0);assert.equal(root.querySelectorAll('[data-dirty="true"]').length,0);delete globalThis.document;delete globalThis.window;
});
test('history dialog reads incoming and outgoing bodies and does not mutate reservations',async()=>{
 const {document}=parseHTML('<dialog></dialog>'),dialog=document.querySelector('dialog');dialog.close=()=>dialog.open=false;dialog.showModal=()=>dialog.open=true;const requests=[];
 await openReservationMailHistory(dialog,booking('a'),[{id:'m',type:'incoming'},{id:'s',type:'confirmation'},{id:'r',type:'reply'}],async url=>{requests.push(url);return [{id:url.includes('mail_inbox')?'m':'s',sender:'Guest',recipient:'Guest',subject:'Reservation',body:'Original inquiry',message_text:'Sent reply'}];});
 assert.equal(requests.length,3);assert(requests.some(s=>s.includes('mail_replies')));assert(dialog.textContent.includes('Original inquiry'));assert(dialog.textContent.includes('Sent reply'));assert.equal(dialog.querySelectorAll('.reservation-mail-message').length,3);
});

test('complete history paginates past recent inbox and keeps other bookings separate',async()=>{
 const a=booking('a'),b=booking('b','2026-12-11'),calls=[];
 const messages=await loadReservationMailHistory(a,[a,b],async path=>{
  calls.push(path);const u=new URL(path,'https://test.invalid');
  if(u.searchParams.has('offset')){
   if(u.pathname.endsWith('mail_inbox'))return u.searchParams.get('offset')==='0'?Array.from({length:1000},(_,i)=>({id:'other'+i,reservation_id:'b'})):[{id:'old',reservation_id:'a',received_at:'2026-10-01'}];
   if(u.pathname.endsWith('mail_outbox'))return [{id:'confirmation',reservation_id:'a',mail_id:'old',state:'sent',sent_at:'2026-10-02'}];
   return [{id:'reply',mail_id:'old',state:'sent',sent_at:'2026-10-03'}];
  }
  const id=u.searchParams.get('id').slice(3);return [{id,body:'Original '+id,message_text:'Gesendet '+id}];
 });
 assert.deepEqual(messages.map(m=>m.id),['old','confirmation','reply']);
 assert(calls.some(path=>path.includes('offset=1000')));assert.equal(calls.filter(path=>!path.includes('offset=')).length,3);
});
test('editing history preserves unsaved fields and permits retry after a read failure',async()=>{
 const {document}=parseHTML('<form><input name="note" value="Ungespeicherte Änderung">'+reservationMailDisclosure()+'</form>');
 const details=document.querySelector('[data-booking-mail-history]');let calls=0;
 bindReservationMailDisclosure(details,async()=>{calls++;if(calls===1)throw Error('Verbindung unterbrochen');return [{type:'incoming',body:'Gesamte Anfrage'},{type:'reply',message_text:'Unsere Antwort'}];});
 details.open=true;await details.ontoggle();assert.equal(details.querySelector('[role=alert]').textContent.includes('Verbindung unterbrochen'),true);
 await details.querySelector('button').onclick();assert(details.textContent.includes('Gesamte Anfrage'));assert(details.textContent.includes('Unsere Antwort'));
 assert.equal(document.querySelector('input').value,'Ungespeicherte Änderung');await details.ontoggle();assert.equal(calls,2);
});
test('an empty conversation has an explicit empty state in both views',async()=>{
 const {document}=parseHTML('<dialog></dialog><section>'+reservationMailDisclosure()+'</section>');
 const dialog=document.querySelector('dialog');dialog.close=()=>dialog.open=false;dialog.showModal=()=>dialog.open=true;
 await openReservationMailHistory(dialog,booking('a'),[],null,async()=>[]);assert(dialog.textContent.includes('keine E-Mails hinterlegt'));
 const details=document.querySelector('details');bindReservationMailDisclosure(details,async()=>[]);details.open=true;await details.ontoggle();assert(details.textContent.includes('keine E-Mails hinterlegt'));
});
