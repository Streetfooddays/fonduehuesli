import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {messages,validateDraft} from './server/newsletter-mail/send-core.mjs';
import {DEFAULT_NEWSLETTER} from './public/newsletter.mjs';
const source=stripTypeScriptTypes(fs.readFileSync('server/newsletter-mail/index.ts','utf8').replace(/^import .*\n/gm,''),{mode:'strip'});
const id='00000000-0000-4000-8000-000000000001';
function setup({role='owner',email='admin@example.com',active=true,fail=false,done=false}={}){
 let handler;const external=[],writes=[],calls=[];
 const batch={id,recipients:[{email:'guest@example.com',token:id}],draft:DEFAULT_NEWSLETTER};
 const makeQuery=table=>{const q={select(){return q;},eq(){return q;},not(){return q;},in(){return q;},order(){return q;},limit(){return q;},update(data){writes.push({table,data});return q;},single:async()=>({data:{draft:DEFAULT_NEWSLETTER}}),maybeSingle:async()=>({data:{role,email,active}}),then(resolve){return Promise.resolve({data:table==='newsletter_campaigns'?[]:[]}).then(resolve);}};return q;};
 const client={auth:{getUser:async jwt=>({data:{user:jwt==='valid'?{id,email_confirmed_at:'yes'}:null}})},from:makeQuery,rpc:async(name,p)=>{calls.push({name,p});return {data:name==='mail_credentials'?{enabled:true,api_key:'mock-only'}:name==='newsletter_claim'?(done?null:batch):id};}};
 const sandbox={messages,validateDraft,createClient:()=>client,Response,Request,URL,URLSearchParams,AbortSignal,JSON,Error,Array,Date,Deno:{env:{get:()=> 'https://local.test'},serve:fn=>handler=fn},fetch:async(url,options)=>{external.push({url,options});if(fail)throw Error('Synthetic network error');return Response.json({data:[{id:'mock-provider'}]});}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return {external,writes,calls,request:(body,token='valid')=>handler(new Request('https://local.test/newsletter-mail',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)})),getUnsubscribe:()=>handler(new Request('https://local.test/newsletter-mail/unsubscribe?token='+id))};
}
test('unknown users and unrelated staff cannot prepare or send; dedicated reservation account can',async()=>{
 let a=setup();assert.equal((await a.request({action:'send',id},'invalid')).status,401);assert.equal(a.external.length,0);
 a=setup({role:'staff'});assert.equal((await a.request({action:'prepare',id})).status,403);assert.equal(a.calls.length,0);
 a=setup({role:'staff',email:'reservation@fonduehuesli.ch'});assert.equal((await a.request({action:'send',id})).status,200);
});
test('preparing a campaign requires review and never calls mail provider',async()=>{
 const a=setup();assert.equal((await a.request({action:'prepare',id})).status,400);
 assert.equal((await a.request({action:'prepare',id,reviewed:true,revision:1})).status,200);assert.equal(a.external.length,0);
});
test('batch retry uses persistent identity and a network error remains resumable',async()=>{
 const a=setup({fail:true});assert.equal((await a.request({action:'send',id})).status,502);assert.equal(a.writes.at(-1).data.state,'failed');
 assert.equal(a.external[0].options.headers['Idempotency-Key'],'fh-newsletter/'+id);
 const b=setup({done:true});assert.equal((await b.request({action:'send',id})).status,200);assert.equal(b.external.length,0);
});
test('opening unsubscribe URL does not change subscription before explicit POST',async()=>{
 const a=setup();assert.equal((await a.getUnsubscribe()).status,200);assert.equal(a.writes.length,0);assert.equal(a.external.length,0);
});
