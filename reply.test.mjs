import {test} from 'node:test';import assert from 'node:assert/strict';
import {replyMessage,replySubject} from './public/reply-core.mjs';
import {replyMessage as backendReplyMessage} from './server/confirmation-mail/reply-core.mjs';
const values={recipient:'guest@example.invalid',subject:'Re: Frage',first:'Anna',salutation:'Liebe',body:'Könntest du uns bitte die gewünschte Uhrzeit mitteilen?'};
test('standalone replies contain only the written response, greeting and signature, without automatic confirmation data',()=>{
 const m=replyMessage({...values,reservation:{date:'2099-12-01',people:10,status:'Bestätigt'}});assert(m.text.startsWith('Liebe Anna'));assert(m.text.includes(values.body));assert(!m.text.includes('Deine Reservation:'));assert(!m.text.includes('gerne bestätigen'));assert(!m.text.includes('2099'));assert.deepEqual(backendReplyMessage(values),m);
 assert(replyMessage({...values,first:'',salutation:'Hallo'}).text.startsWith('Guten Tag'));
});
test('reply subjects and recipients block header injection, body is HTML escaped and missing fields cannot send',()=>{
 assert.equal(replySubject('Reservation'),'Re: Reservation');assert.equal(replySubject('AW: Frage'),'AW: Frage');assert.equal(replySubject('Frage\nTest'),'Re: Frage Test');
 for(const override of [{recipient:'x@example.invalid, y@example.invalid'},{subject:'Test\r\nBcc:x@y.invalid'},{body:''}])assert.throws(()=>replyMessage({...values,...override}));
 const m=replyMessage({...values,body:'<img src=x onerror=alert(1)>'});assert(!m.html.includes('<img src=x'));assert(m.html.includes('&lt;img'));assert.deepEqual(backendReplyMessage({...values,body:'"Quoted" & <tag> text'}),replyMessage({...values,body:'"Quoted" & <tag> text'}));
});
