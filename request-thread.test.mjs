import {test} from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {parseMail,reservationCandidate} from './public/mail-core.mjs';import {resolveRequestBooking} from './public/request-matching.mjs';import {compactRequestHTML} from './public/request-summary.mjs';
const original='Von: Anna Muster <anna@example.invalid>\nGesendet: Montag, 2. November 2026\nBetreff: Reservation\n\nNachname: Muster\nVorname: Anna\nDatum: 12.12.2026\nUhrzeit: 18:30\nAnzahl Personen: 6\nE-Mail: anna@example.invalid\nBemerkungen: Ein Kinderstuhl bitte';
const booking={id:'booking',date:'2026-12-12',time:'18:30',people:6,status:'Bestätigt',data:JSON.stringify({first:'Anna',last:'Muster',email:'anna@example.invalid'})};
function message(top,subject='Re: Reservation 12.12.2026'){return {id:'response',...parseMail(top+'\n\n-----Original Message-----\n'+original,{receivedAt:'2026-11-16',subject,sender:'Anna Muster <anna@example.invalid>'})};}
test('a reply uses the whole thread to find the original booking after changing date and guest count',()=>{
 const mail=message('Bitte auf den 21. Dezember 2026 verschieben. Wir kommen nun mit 8 Personen.\nGruss Anna Muster');
 assert.equal(mail.draft.date,'2026-12-21');assert.equal(mail.draft.people,8);assert(mail.draft.thread_references.some(r=>r.date==='2026-12-12'&&r.people===6));
 const match=resolveRequestBooking(mail,[booking]);assert.equal(match.booking.id,'booking');assert.equal(match.kind,'related');assert.equal(reservationCandidate(mail),false);assert.equal(booking.people,6);
});
test('short replies inherit original reservation details without treating transport dates as booking dates',()=>{
 const mail=message('Vielen Dank, das passt.\nGruss Anna Muster');assert.equal(mail.draft.date,'2026-12-12');assert.equal(mail.draft.people,6);assert.equal(resolveRequestBooking(mail,[booking]).booking.id,'booking');assert.equal(reservationCandidate(mail),false);assert.match(mail.draft.data.comment,/Kinderstuhl/);
});
test('quoted confirmation recipient can identify the guest instead of the restaurant signature',()=>{
 const body='Danke.\n\n-----Original Message-----\nVon: Fonduehüsli <reservation@fonduehuesli.ch>\nAn: Anna Muster <anna@example.invalid>\nGesendet: Montag, 16. November 2026\n\nDeine Reservation: 12. Dezember 2026, 18:30 Uhr, 6 Personen.\nFreundliche Grüsse\nSabrina Oliver';
 const parsed=parseMail(body,{receivedAt:'2026-11-16',sender:'anna@example.invalid',subject:'Re: Bestätigung'});assert.equal(parsed.draft.data.email,'anna@example.invalid');assert.equal(resolveRequestBooking({id:'reply',...parsed},[booking]).booking.id,'booking');
});
test('shared addresses and conflicting thread references never choose an arbitrary reservation',()=>{
 const mail={draft:{is_reply:true,date:booking.date,data:{email:'anna@example.invalid'}}};assert.equal(resolveRequestBooking(mail,[booking,{...booking,id:'other',time:'19:00'}]).kind,'ambiguous');
 assert.equal(resolveRequestBooking({draft:{is_reply:true,data:{email:'anna@example.invalid'}}},[booking]).kind,'none');
 assert.equal(resolveRequestBooking(message('Danke'),[{...booking,status:'Storniert'}]).booking,null);
 assert.equal(resolveRequestBooking(message('Danke'),[{...booking,deleted_at:'now'}]).booking,null);
});
test('a previously auto-created reply entry does not hide the uniquely matching original booking',()=>{
 const mail=message('Wir kommen mit 8 Personen.');mail.reservation_id='mail-'+mail.id;assert.equal(resolveRequestBooking(mail,[booking,{...booking,id:mail.reservation_id,people:8}]).booking.id,'booking');
});
test('customer remarks from the new message and original form survive compact extraction',()=>{
 const mail=message('Wir benötigen zusätzlich einen Rollstuhlplatz.\nGruss Anna Muster');assert.match(mail.draft.data.comment,/Rollstuhl/);assert.match(mail.draft.data.comment,/Kinderstuhl/);
 const {document}=parseHTML(compactRequestHTML(mail,booking));assert.match(document.querySelector('.request-summary').textContent,/Rollstuhl/);assert.match(document.querySelector('.request-summary').textContent,/Kinderstuhl/);assert(!document.querySelector('.request-original').hasAttribute('open'));assert.match(document.querySelector('summary').textContent,/Originalanfrage/);
});
test('compact summary uses the stored guest identity for replies and safely escapes customer text',()=>{
 const {document}=parseHTML(compactRequestHTML({subject:'<script>bad</script>',draft:{is_reply:true,date:'2026-12-21',people:8,data:{first:'Sabrina',last:'Oliver',comment:'<img src=x> Allergie'}}},booking));assert.equal(document.querySelector('h3').textContent,'Anna Muster');assert.match(document.querySelector('dl').textContent,/21.12.2026/);assert.equal(document.querySelector('script,img'),null);
});

test('restaurant instructions in a quoted confirmation do not become customer remarks',()=>{
 const text='Danke.\n\n-----Original Message-----\nVon: Fonduehüsli <reservation@fonduehuesli.ch>\nAn: anna@example.invalid\n\nDeine Reservation: 12. Dezember 2026, 18:30 Uhr, 6 Personen.\nBitte Allergien vorher melden.\nFreundliche Grüsse\nSabrina Oliver';
 const parsed=parseMail(text,{receivedAt:'2026-11-16',sender:'anna@example.invalid',subject:'Re: Bestätigung'});assert(!parsed.draft.data.comment?.includes('Allergien vorher melden'));
});

test('the compact inbox can retain direct navigation to the reservation day',()=>{const {document}=parseHTML(compactRequestHTML({id:'request',draft:{date:'2026-12-12',data:{}}},null,{dateLink:true}));assert.equal(document.querySelector('[data-request-day]').dataset.requestDay,'request');assert.match(document.querySelector('[data-request-day]').textContent,/12.12.2026/);});
