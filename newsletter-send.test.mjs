import test from 'node:test';
import assert from 'node:assert/strict';
import {messages,validateDraft} from './server/newsletter-mail/send-core.mjs';
import {DEFAULT_NEWSLETTER,importEmails,mergeContacts} from './public/newsletter.mjs';
const token='00000000-0000-4000-8000-000000000001';
test('each recipient has an isolated envelope and personal unsubscribe link',()=>{
 const draft={...DEFAULT_NEWSLETTER,title:'<script>alert(1)</script>'};
 const result=messages({draft,recipients:[{email:'a@example.com',token},{email:'b@example.com',token:'00000000-0000-4000-8000-000000000002'}]},'https://example.com/newsletter');
 assert.equal(result.length,2);assert.deepEqual(result[0].to,['a@example.com']);assert.ok(!result[0].html.includes('<script>'));assert.ok(result[0].html.includes('token='+token));assert.ok(!result[1].html.includes('token='+token));assert.ok(result[0].headers['List-Unsubscribe-Post']);
});
test('refuse header injection, incomplete content and non-HTTPS assets',()=>{
 assert.throws(()=>validateDraft({...DEFAULT_NEWSLETTER,subject:'hello\r\nBcc: victim@example.com'}));
 assert.throws(()=>validateDraft({...DEFAULT_NEWSLETTER,body:''}));
 assert.throws(()=>validateDraft({...DEFAULT_NEWSLETTER,image:'javascript:alert(1)'}));
 assert.throws(()=>messages({draft:DEFAULT_NEWSLETTER,recipients:[{email:'x@example.com, y@example.com',token}]},'https://example.com'));
});
test('imports stay unapproved and existing approval is not overwritten',()=>{
 const added=importEmails('A@example.com;a@example.com;reservation@fonduehuesli.ch','test');assert.equal(added.length,1);assert.equal(added[0].approved,false);
 assert.equal(mergeContacts([{email:'a@example.com',approved:true}],added)[0].approved,true);
});
test('promotion sections stay ordered, escape text and match preview and plain text',async()=>{
 const {newsletterHTML}=await import('./public/newsletter.mjs');
 const draft={...DEFAULT_NEWSLETTER,nominationTitle:'Nomination <script>',nominationText:'Danke!',nominationUrl:'https://www.blick.ch/',shopTitle:'Fondue zuhause',shopText:'35 Sorten',shopLogo:'https://www.artoffondue.ch/logo.png',shopImage1:'https://www.artoffondue.ch/fondue.jpg',shopImage2:'https://www.artoffondue.ch/raclette.jpg',shopUrl:'https://www.artoffondue.ch/',closing:'Bis bald'};
 const m=messages({draft,recipients:[{email:'a@example.com',token}]},'https://example.com/newsletter')[0];
 assert.ok(m.html.indexOf('Nomination &lt;script&gt;')<m.html.indexOf('Fondue zuhause'));
 assert.ok(m.html.includes('raclette.jpg'));assert.ok(!m.html.includes('<script>'));
 assert.equal(m.html,newsletterHTML({...draft,unsubscribe:'https://example.com/newsletter/unsubscribe?token='+token}));
 assert.ok(m.text.includes(draft.nominationUrl));assert.ok(m.text.includes(draft.shopText));
 assert.throws(()=>validateDraft({...draft,shopImage1:'javascript:alert(1)'}));
});
