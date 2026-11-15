import {replyMessage} from './public/reply-core.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {confirmationMessage,FROM} from './public/confirmation-core.mjs';
const source=stripTypeScriptTypes(fs.readFileSync('server/confirmation-mail/index.ts','utf8').replace(/^import .*\n/gm,''),{mode:'strip'});
const reservation={id:'synthetic',date:'2026-11-19',time:'19:00',people:2,gondola:true,data:{first:'Sybille',salutation:'Liebe',email:'guest@example.com'}};
const message=confirmationMessage({reservation});
function setup({verified=true,active=true,sendFailure=false,alreadySent=false}={}){
 const calls=[],apiCalls=[];let handler;
 const frozen={id:'frozen-uuid',reservation_id:'synthetic',in_reply_to:'<original@example.invalid>',state:alreadySent?'sent':'pending',recipient:'guest@example.com',subject:message.subject,message_text:message.text,message_html:message.html};
 const client={auth:{getUser:async jwt=>({data:{user:jwt==='valid'?{id:'member',email_confirmed_at:'yes'}:null},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{active}})})})}),rpc:async(name,p)=>{calls.push({name,p});if(name==='mail_credentials')return{data:{enabled:true,api_key:'fake-secret-never-live'}};if(name==='mail_reply_prepare'||name==='mail_reply_retry')return{data:{...frozen,in_reply_to:'<original@example.invalid>'}};if(name==='mail_reply_delivery'&&p.p.action==='sent')return{data:{...frozen,state:'sent'}};if(name==='confirmation_delivery'&&p.p.action==='sent')return{data:{...frozen,state:'sent'}};return{data:frozen};}};
 const sandbox={replyMessage,confirmationMessage,FROM,createClient:()=>client,Response,Request,AbortSignal,JSON,Error,Number,Math,Promise,setTimeout:fn=>{fn();},Deno:{env:{get:()=> 'fake-runtime'},serve:fn=>handler=fn},fetch:async(url,options)=>{apiCalls.push({url,options});if(url.endsWith('/domains'))return Response.json({data:[{id:'domain',name:'fonduehuesli.ch'}]});if(url.endsWith('/domains/domain'))return Response.json({status:verified?'verified':'not_started',capabilities:{sending:'enabled'},records:[]});if(url.endsWith('/emails')){if(sendFailure)throw Error('Synthetic connection loss');return Response.json({id:'provider-id'});}throw Error('Unexpected API path');}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 const request=(body,token='valid')=>handler(new Request('https://local.test',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 return {calls,apiCalls,request};
}
test('confirmation endpoint rejects invalid identities and blocks unverified domain before mutation',async()=>{
 let app=setup();assert.equal((await app.request({action:'send'},'invalid')).status,401);assert.equal(app.apiCalls.length,0);
 app=setup({active:false});assert.equal((await app.request({action:'send'})).status,403);
 app=setup({verified:false});assert.equal((await app.request({action:'send',reservation,recipient_reviewed:true})).status,409);assert.ok(!app.calls.some(c=>c.name==='confirmation_prepare'));
});
test('confirmation sends to saved guest with frozen body, fixed sender and idempotency key, then archives',async()=>{
 const app=setup();const result=await app.request({action:'send',reservation,recipient_reviewed:true});assert.equal(result.status,200);
 const sent=app.apiCalls.find(c=>c.url.endsWith('/emails'));const payload=JSON.parse(sent.options.body);assert.deepEqual(payload.to,['guest@example.com']);assert.equal(payload.from,FROM);assert.equal(payload.reply_to,'reservation@fonduehuesli.ch');assert.equal(payload.text,message.text);assert.ok(payload.text.includes('Fonduegondel'));assert.equal(sent.options.headers['Idempotency-Key'],'reservation-confirmation/frozen-uuid');assert.equal(app.calls.at(-1).p.p.action,'sent');
});
test('failure remains retryable; replay of a completed confirmation never sends again',async()=>{
 let app=setup({sendFailure:true});assert.equal((await app.request({action:'send',reservation,recipient_reviewed:true})).status,502);assert.equal(app.calls.at(-1).p.p.action,'failed');
 app=setup({alreadySent:true});const result=await app.request({action:'retry',id:'frozen-uuid',recipient:'attacker@example.com'});assert.equal(result.status,200);assert.ok(!app.apiCalls.some(c=>c.url.endsWith('/emails')));
});

test('reply-only endpoint uses a separate reply outbox and never invokes reservation confirmation, conversion or status updates',async()=>{
 const app=setup();const result=await app.request({action:'reply',id:'reply-uuid',mail_id:'mail',recipient:'guest@example.com',subject:'Re: Frage',body:'Welche Zeit passt euch?',first:'Anna',salutation:'Liebe',recipient_reviewed:true,reservation:{...reservation,status:'Bestätigt'}});assert.equal(result.status,200);
 assert(app.calls.some(c=>c.name==='mail_reply_prepare'));assert(app.calls.some(c=>c.name==='mail_reply_delivery'));assert(!app.calls.some(c=>/confirmation_prepare|save_reservation|mail_review|confirmation_delivery/.test(c.name)));
 const sent=app.apiCalls.find(c=>c.url.endsWith('/emails'));assert.equal(sent.options.headers['Idempotency-Key'],'reservation-confirmation/reply/frozen-uuid');const payload=JSON.parse(sent.options.body);assert.equal(payload.headers['In-Reply-To'],'<original@example.invalid>');assert.equal(payload.headers.References,'<original@example.invalid>');
});
test('failed replies remain retryable and reply retries never create or confirm reservations',async()=>{
 const app=setup({sendFailure:true});const response=await app.request({action:'reply_retry',id:'frozen-uuid'});assert.equal(response.status,502);assert.equal(app.calls.at(-1).name,'mail_reply_delivery');assert.equal(app.calls.at(-1).p.p.action,'failed');assert(!app.calls.some(c=>c.name==='confirmation_prepare'));
 const done=setup({alreadySent:true});assert.equal((await done.request({action:'reply_retry',id:'frozen-uuid'})).status,200);assert(!done.apiCalls.some(c=>c.url.endsWith('/emails')));
});
