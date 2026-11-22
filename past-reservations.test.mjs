import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {reservationIsPast,requestIsPast,deliveryIsPast} from './public/past-reservations.mjs';
import {renderMailSearch} from './public/mail-search.mjs';
import {guest} from './public/core.mjs';
import {isVoucherRequest} from './public/voucher-request.mjs';
const source=readFileSync('public/app.mjs','utf8');
const now=new Date('2026-11-21T23:00:00Z');
const bookings=[{id:'past',date:'2026-11-21',status:'Offen',data:'{"last":"Muster"}'},{id:'today',date:'2026-11-22',status:'Rückfrage nötig',data:'{}'},{id:'future',date:'2026-11-23',status:'Offen',data:'{}'}];
const mails=[{id:'past-mail',reservation_id:'past',state:'question',draft:{date:'2026-12-01'}},{id:'today-mail',reservation_id:'today',state:'imported'},{id:'future-mail',reservation_id:'future',state:'review'},{id:'draft-past',state:'review',draft:{date:'2026-11-21'}},{id:'unclear',state:'review',draft:{date:''}}];
function workflow(){
 const outbox=[{id:'failed-past',reservation_id:'past',mail_id:'past-mail',state:'failed'}];
 const c={rows:structuredClone(bookings),inbox:structuredClone(mails),outbox,replyOutbox:[],view:'pending',date:'2026-11-22',status:'',search:'',cancellationsLast:(a,b)=>a.date.localeCompare(b.date),guest,isVoucherRequest,reservationIsPast:r=>reservationIsPast(r,now),requestIsPast:(m,rows)=>requestIsPast(m,rows,now)};
 vm.createContext(c);
 for(const [start,end] of [['function filtered(){','\nfunction render(){'],['function mailNeedsAction(','\nfunction canDeleteMail('],['function mailLabel(','\nfunction requestChart(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),c);
 return c;
}
test('archives only dates before today in Zurich at winter and summer midnight',()=>{
 assert(!reservationIsPast('2026-11-21',new Date('2026-11-21T22:59:59Z')));assert(reservationIsPast('2026-11-21',now));assert(!reservationIsPast('2026-11-22',now));assert(!reservationIsPast('2026-11-23',now));
 assert(reservationIsPast('2026-07-21',new Date('2026-07-21T22:00:00Z')));
 for(const date of ['',null,'2026-02-30','21.11.2026','2026-13-01'])assert(!reservationIsPast(date,now));
});
test('the saved booking date wins over stale mail; moving to the future reopens it',()=>{
 const c=workflow();assert(!c.mailNeedsAction(c.inbox[0]));assert.equal(c.mailLabel(c.inbox[0]),'Erledigt · Datum vergangen');assert(!c.mailNeedsAction(c.inbox[3]));assert(c.mailNeedsAction(c.inbox[1]));assert(c.mailNeedsAction(c.inbox[4]));
 c.rows[0].date='2026-11-25';assert(c.mailNeedsAction(c.inbox[0]));assert.notEqual(c.mailLabel(c.inbox[0]),'Erledigt · Datum vergangen');
});
test('pending rows and counts omit past days, while all and historical day views retain bookings and original statuses',()=>{
 const c=workflow(),before=JSON.stringify(c.rows);assert.deepEqual(Array.from(c.filtered(),r=>r.id),['today','future']);
 c.view='all';assert.equal(c.filtered().length,3);c.view='day';c.date='2026-11-21';assert.equal(c.filtered()[0].id,'past');assert.equal(JSON.stringify(c.rows),before);
 assert(deliveryIsPast(c.outbox[0],c.rows,c.inbox,now));assert(deliveryIsPast({mail_id:'draft-past'},c.rows,c.inbox,now));assert(!deliveryIsPast({mail_id:'unclear'},c.rows,c.inbox,now));
});
test('past mail remains searchable in the completed archive without mutating the mail or creating deliveries',()=>{
 const c=workflow(),before=JSON.stringify(c.inbox),oldDocument=globalThis.document;
 const {document}=parseHTML('<main></main>');globalThis.document=document;
 try{renderMailSearch(document.querySelector('main'),{items:c.inbox,rows:c.rows,needsAction:c.mailNeedsAction,cards:items=>items.map(m=>`<article>${m.id}</article>`).join(''),query:'Muster'});const archive=document.querySelector('details');assert(archive);assert(archive.hasAttribute('open'));assert(archive.textContent.includes('past-mail'));assert.equal(JSON.stringify(c.inbox),before);assert.equal(c.outbox.length,1);}finally{if(oldDocument)globalThis.document=oldDocument;else delete globalThis.document;}
});
test('midnight refresh waits for unfinished edits and open dialogs, then updates once',()=>{
 const start=source.indexOf('let pastArchiveDay='),end=source.indexOf("window.addEventListener('focus',refreshPastReservationArchive)",start);let today='2026-11-21',renders=0,editing=false;
 const c={todayInZurich:()=>today,session:{},dialog:{open:false},view:'pending',document:{activeElement:{matches:()=>editing}},render:()=>renders++};vm.createContext(c);vm.runInContext(source.slice(start,end),c);
 today='2026-11-22';c.dialog.open=true;c.refreshPastReservationArchive();assert.equal(renders,0);c.dialog.open=false;editing=true;c.refreshPastReservationArchive();assert.equal(renders,0);editing=false;c.refreshPastReservationArchive();assert.equal(renders,1);c.refreshPastReservationArchive();assert.equal(renders,1);
});

test('voucher orders remain open until delivery and a sent voucher archives its source inquiry',()=>{
 const c=workflow();
 const order={id:'voucher-order',subject:'Neue Formulareingabe: Gutschein Bestellung',state:'review',draft:{date:'2026-11-21'}};
 assert(c.mailNeedsAction(order));
 assert.equal(c.mailLabel(order),'Offen · Gutscheinbestellung');
 const sent={...order,state:'ignored',voucher_sent_at:'2026-11-22T17:00:00Z'};
 assert(!c.mailNeedsAction(sent));
 assert.equal(c.mailLabel(sent),'Erledigt · Gutschein versendet');
 assert(!c.mailNeedsAction({...sent,subject:'Reservation',draft:{date:'2026-11-25'}}));
});
