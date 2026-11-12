import {test} from 'node:test';import assert from 'node:assert/strict';
import {automaticMessage,runAutomaticConfirmation} from './server/resend-mail/automatic-core.mjs';
const context={enabled:true,eligible:true,reservation:{date:'2099-01-01',time:'18:00',people:2,revision:0,data:{last:'Muster',first:'Alex',email:'guest@example.invalid'}},settings:{updated:'snapshot',body:'Vielen Dank für deine Reservation.',signature:'Sabrina und Oliver',subject:'Deine Reservation'}};
test('disabled preparation never calls domain checks, delivery, or mutating RPCs',async()=>{
 const calls=[];const result=await runAutomaticConfirmation('mail',{rpc:async name=>{calls.push(name);return {enabled:false};},domainReady:()=>{throw Error('Not allowed');},send:()=>{throw Error('Not allowed');}});
 assert.equal(result.state,'disabled');assert.deepEqual(calls,['automatic_confirmation_context']);
});
test('manual candidates and unverified sending domains never queue confirmation',async()=>{
 for(const c of [{...context,eligible:false},context]){
  const calls=[];await runAutomaticConfirmation('mail',{rpc:async n=>{calls.push(n);return c;},domainReady:async()=>false,send:()=>{throw Error('No send');}});assert.deepEqual(calls,['automatic_confirmation_context']);
 }
});
test('automatic confirmation preserves one frozen outbox identity and marks accepted delivery',async()=>{
 const calls=[],frozen={id:'fixed-id',recipient:'guest@example.invalid',state:'pending',message_text:'Frozen',message_html:'Frozen',subject:'Frozen'};
 const result=await runAutomaticConfirmation('mail',{rpc:async(n,p)=>{calls.push({n,p});return n==='automatic_confirmation_context'?context:frozen;},domainReady:async()=>true,send:async o=>{assert.equal(o.id,'fixed-id');return {id:'provider-id'};}});
 assert.equal(result.state,'sent');assert.equal(calls.at(-1).p.p.action,'sent');assert.equal(calls.find(x=>x.n==='automatic_confirmation_prepare').p.p.revision,0);
});
test('already sent mail cannot send again and connection failures remain visible for manual retry',async()=>{
 let result=await runAutomaticConfirmation('mail',{rpc:async()=>({enabled:true,outbox:{id:'fixed',state:'sent'}}),domainReady:()=>{throw Error('No call');},send:()=>{throw Error('No call');}});assert.equal(result.state,'already_sent');
 const actions=[];result=await runAutomaticConfirmation('mail',{rpc:async(n,p)=>{if(n==='automatic_confirmation_context')return {enabled:true,outbox:{id:'fixed',state:'failed'}};actions.push(p.p.action);return {id:'fixed',state:'failed'};},domainReady:async()=>true,send:async()=>{throw Error('Network');}});assert.equal(result.state,'pending_manual_retry');assert.deepEqual(actions,['claim','failed']);
});
test('mail draft uses neutral greeting, exact reservation details and the existing signature',()=>{
 const m=automaticMessage(context);assert(m.text.startsWith('Hallo Alex'));assert(m.text.includes('18:00 Uhr, 2 Personen'));assert(m.text.includes('Sabrina und Oliver'));assert.equal(m.recipient,'guest@example.invalid');
 assert.throws(()=>automaticMessage({...context,reservation:{...context.reservation,time:''}}));
});
