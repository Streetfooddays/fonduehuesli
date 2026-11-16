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

test('a signed reply is parsed from the entire thread and never enters automatic creation or sending',async()=>{
 const {parseMail,htmlText,reservationCandidate}=await import('./server/resend-mail/mail-core.mjs');const calls=[],providerCalls=[];let handler;
 const client={rpc:async(name,p)=>{calls.push([name,p]);return {data:name==='mail_credentials'?{enabled:true,api_key:'synthetic',signing_secret:'synthetic'}:{ok:true,reservation_id:null}};}};
 const text='Wir kommen mit 8 Personen.\n\n-----Original Message-----\nVon: Anna Muster <anna@example.invalid>\n\nNachname: Muster\nVorname: Anna\nDatum: 12.12.2026\nUhrzeit: 18:30\nAnzahl Personen: 6\nE-Mail: anna@example.invalid';
 const source=stripTypeScriptTypes(fs.readFileSync('server/resend-mail/index.ts','utf8').replace(/^import .*\n/gm,''),{mode:'strip'});
 const sandbox={createClient:()=>client,runAutomaticConfirmation:()=>{throw Error('Replies must remain manual');},FROM,parseMail,htmlText,verifySignature:async()=>true,reservationCandidate,Response,Request,AbortSignal,JSON,Error,Deno:{env:{get:()=> 'synthetic'},serve:fn=>handler=fn},fetch:async url=>{providerCalls.push(url);assert(url.includes('/emails/receiving/'));return Response.json({to:['reservation@uesheuante.resend.app'],text,from:'anna@example.invalid',subject:'Re: Reservation',created_at:'2026-11-16T12:00:00Z'});}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);const result=await handler(new Request('https://synthetic.invalid',{method:'POST',headers:{'svix-id':'synthetic'},body:JSON.stringify({type:'email.received',data:{email_id:'00000000-0000-4000-8000-000000000002'}})}));
 assert.equal(result.status,200);const ingest=calls.find(([name])=>name==='mail_ingest')[1].p;assert.equal(ingest.candidate,false);assert.equal(ingest.draft.people,8);assert.equal(ingest.draft.thread_references[0].people,6);assert.equal((await result.json()).automatic.state,'manual');assert.equal(providerCalls.length,1);
});
