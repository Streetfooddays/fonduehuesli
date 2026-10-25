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
 assert.equal(suggestSalutation('Sybille'),'Liebe');assert.equal(suggestSalutation('Oliver'),'Lieber');assert.equal(suggestSalutation('Kim'),'');assert.equal(suggestSalutation(''),'');
 for(const email of ['a@example.com,b@example.com','Someone <a@example.com>','a@example.com\r\nBcc:x@y.com'])assert.equal(validEmail(email),false);
 for(const data of [{first:'',salutation:'Liebe',email:'x@example.com'},{first:'Kim',salutation:'',email:'x@example.com'},{first:'Kim',salutation:'Liebe',email:'x@example.com, y@example.com'}])assert.throws(()=>confirmationMessage({reservation:{...booking,data}}));
 assert.throws(()=>confirmationMessage({reservation:{...booking,time:''}}));assert.throws(()=>confirmationMessage({reservation:booking,subject:'Subject\nBcc:x@y.com'}));
});
