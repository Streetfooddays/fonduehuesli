import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmationMessage,suggestSalutation,DEFAULT_BODY,DEFAULT_SIGNATURE,validEmail} from './public/confirmation-core.mjs';
const booking={date:'2026-11-19',time:'19:00',people:2,gondola:false,data:{first:'Sybille',salutation:'Liebe',email:'sybille@example.com'}};
test('confirmation uses first name, Du, booking details, matching signature and real banner',()=>{
 const m=confirmationMessage({reservation:booking});assert.equal(m.recipient,'sybille@example.com');assert.ok(m.text.startsWith('Liebe Sybille\n\nVielen Dank für deine Reservation'));assert.ok(m.text.includes('19. November 2026, 19:00 Uhr, 2 Personen'));assert.ok(m.text.includes('Sabrina'));assert.ok(m.html.includes('/mail-banner.png'));assert.ok(!m.text.includes('Fonduegondel'));
 const male=confirmationMessage({reservation:{...booking,data:{...booking.data,first:'Oliver',salutation:'Lieber'}}});assert.ok(male.text.startsWith('Lieber Oliver'));
});
test('custom response and gondola are included without HTML injection',()=>{
 const m=confirmationMessage({reservation:{...booking,gondola:true,data:{...booking.data,first:'Sybille <script>'}},body:DEFAULT_BODY+'\n\nWir haben deinen Wunsch vorgemerkt. {{zeit}}',signature:DEFAULT_SIGNATURE});assert.ok(m.text.includes('in einer Fonduegondel (maximal 4 Personen)'));assert.ok(m.text.includes('Wunsch vorgemerkt. 19:00'));assert.ok(!m.html.includes('<script>'));assert.ok(m.html.includes('&lt;script&gt;'));
});
test('ambiguous names and recipient addresses must be reviewed, incomplete booking cannot send',()=>{
 assert.equal(suggestSalutation('Sybille'),'Liebe');assert.equal(suggestSalutation('Oliver'),'Lieber');assert.equal(suggestSalutation('Kim'),'Hallo');assert.equal(suggestSalutation(''),'');
 for(const email of ['a@example.com,b@example.com','Someone <a@example.com>','a@example.com\r\nBcc:x@y.com'])assert.equal(validEmail(email),false);
 for(const data of [{first:'',salutation:'Liebe',email:'x@example.com'},{first:'Kim',salutation:'',email:'x@example.com'},{first:'Kim',salutation:'Liebe',email:'x@example.com, y@example.com'}])assert.throws(()=>confirmationMessage({reservation:{...booking,data}}));
 assert.throws(()=>confirmationMessage({reservation:{...booking,time:''}}));assert.throws(()=>confirmationMessage({reservation:booking,subject:'Subject\nBcc:x@y.com'}));
});

test('unknown first names automatically receive a neutral greeting and do not require guessing',()=>{const m=confirmationMessage({reservation:{...booking,data:{...booking.data,first:'Kim',salutation:suggestSalutation('Kim')}}});assert(m.text.startsWith('Hallo Kim'));});

test('voting poster is clickable through the final Swiss minute and absent afterwards',async()=>{
 const {VOTING_URL,VOTING_IMAGE}=await import('./public/confirmation-core.mjs');
 const {automaticMessage}=await import('./server/resend-mail/automatic-core.mjs');
 const server=await import('./server/confirmation-mail/confirmation-core.mjs');
 const webhook=await import('./server/resend-mail/confirmation-core.mjs');
 for(const [now,active] of [['2026-11-20T07:00:00+01:00',true],['2026-11-29T23:59:59.999+01:00',true],['2026-11-30T00:00:00+01:00',false],['2027-01-01T00:00:00+01:00',false]]){
  const manual=confirmationMessage({reservation:booking,now});
  assert.deepEqual(server.confirmationMessage({reservation:booking,now}),manual);
  assert.deepEqual(webhook.confirmationMessage({reservation:booking,now}),manual);
  for(const message of [manual,automaticMessage({reservation:booking},now)]){
   assert.equal(message.html.includes(`<a href="${VOTING_URL}"`),active);
   assert.equal(message.html.includes(`<img src="${VOTING_IMAGE}"`),active);
   assert.equal(message.text.includes(VOTING_URL),active);
   assert(message.html.includes('/mail-banner.png'));
  }
 }
});
