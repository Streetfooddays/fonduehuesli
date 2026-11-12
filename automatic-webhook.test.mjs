import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
import {runAutomaticConfirmation,FROM} from './server/resend-mail/automatic-core.mjs';
test('signed incoming webhook still saves the provisional entry but cannot send with automation disabled',async()=>{
 const rpcCalls=[],providerCalls=[];let handler;
 const client={rpc:async(name,p)=>{rpcCalls.push(name);return {data:name==='mail_credentials'?{enabled:true,api_key:'synthetic',signing_secret:'synthetic'}:name==='automatic_confirmation_context'?{enabled:false}:{ok:true,reservation_id:'synthetic-provisional'}};}};
 const source=stripTypeScriptTypes(fs.readFileSync('server/resend-mail/index.ts','utf8').replace(/^import .*\n/gm,''),{mode:'strip'});
 const sandbox={createClient:()=>client,runAutomaticConfirmation,FROM,parseMail:()=>({draft:{},issues:[],complete:true}),htmlText:()=>'',verifySignature:async()=>true,reservationCandidate:()=>true,Response,Request,AbortSignal,JSON,Error,Deno:{env:{get:()=> 'synthetic-runtime'},serve:fn=>handler=fn},fetch:async(url)=>{providerCalls.push(url);assert(url.includes('/emails/receiving/'),'Disabled automation must not call domain or sending endpoints');return Response.json({to:['reservation@uesheuante.resend.app'],text:'Synthetic',from:'test@example.invalid',subject:'Synthetic'});}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 const response=await handler(new Request('https://synthetic.invalid',{method:'POST',headers:{'svix-id':'synthetic'},body:JSON.stringify({type:'email.received',data:{email_id:'00000000-0000-4000-8000-000000000001'}})}));
 assert.equal(response.status,200);assert.equal((await response.json()).automatic.state,'disabled');assert.deepEqual(rpcCalls,['mail_credentials','mail_ingest','automatic_confirmation_context']);assert.equal(providerCalls.length,1);
});
