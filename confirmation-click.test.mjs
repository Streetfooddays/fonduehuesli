import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {isGondolaReservation,confirmGondolaReservation} from './public/gondolas.mjs';
import {guest} from './public/core.mjs';
import {confirmationMessage,suggestSalutation,DEFAULT_BODY,DEFAULT_SIGNATURE} from './public/confirmation-core.mjs';
import {confirmationReviewReason,confirmationNeedsManualReview} from './public/confirmation-review.mjs';
const source=readFileSync(new URL('./public/app.mjs',import.meta.url),'utf8');
const candidate={id:'candidate',date:'2026-11-26',time:'18:30',people:3,revision:0,status:'Offen',data:JSON.stringify({first:'Anna',last:'Muster',email:'anna@example.invalid'})};
function setup({capacity=0,manual=false,issues=[],sendError=null,afterLoad=()=>{},booking=candidate,acceptGondola=true,tableOverride=undefined}={}){
 const button={disabled:false};const calls=[],edits=[],notices=[],mail={id:'incoming',reservation_id:candidate.id,issues,draft:{date:booking.date,time:booking.time,people:booking.people,data:guest(booking)}};
 const questions=[];const context={isGondolaReservation,confirmGondolaReservation,window:{confirm:message=>{questions.push(message);return acceptGondola;}},tableAssignments:v=>({tables:String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}),rows:[{...booking},...(capacity?[{id:'other',date:candidate.date,time:'19:00',people:capacity,status:'Bestätigt'}]:[])],days:manual?[{date:candidate.date,manual_only:1}]:[],outbox:[],guest,suggestSalutation,confirmationMessage,confirmationReviewReason,confirmationNeedsManualReview,crypto:{randomUUID:()=> 'create-id'},document:{querySelectorAll:()=>[button]},CSS:{escape:s=>s},mailSettings:{body:DEFAULT_BODY,signature:DEFAULT_SIGNATURE},notice:m=>notices.push(m),load:async()=>afterLoad(context),render:()=>calls.push('render'),ensureMailDetails:async()=>mail,relatedRequestBooking:()=>null,excelRequestProposal:()=>({...booking}),dialog:{close(){}},edit:(r,id,options)=>edits.push({r,id,options}),req:async(path,{body})=>{calls.push(body);if(sendError)throw sendError;context.rows[0].status='Bestätigt';context.outbox.push({id:'delivery',mail_id:'incoming',reservation_id:candidate.id,state:'sent'});return {ok:true};}};
 vm.createContext(context);vm.runInContext('const sendingConfirmations=new Set();'+source.slice(source.indexOf('async function quickConfirmation('),source.indexOf('\nfunction pendingDeliveries('))+source.slice(source.indexOf('async function prepareMail('),source.indexOf('\nfunction deleteMail(')),context);
 return {context,calls,edits,notices,questions,button,click:()=>context.prepareMail('incoming',false,tableOverride)};
}
test('over 70 guests opens manual approval without sending or changing the reservation',async()=>{
 const s=setup({capacity:122});const result=await s.click();assert.equal(result.outcome,'review');assert.equal(s.calls.length,0);assert.equal(s.edits.length,1);assert.match(s.edits[0].options.reviewMessage,/70.*manuelle Freigabe/);assert.equal(s.context.rows[0].status,'Offen');assert.equal(s.context.outbox.length,0);
});
test('a day marked manual-only opens the approval form before any send',async()=>{const s=setup({manual:true});assert.equal((await s.click()).outcome,'review');assert.match(s.edits[0].options.reviewMessage,/manuellen Prüfung/);assert.equal(s.calls.length,0);});
test('uncertain name order opens the existing editor instead of sending a guessed greeting',async()=>{const s=setup({issues:['Nameaufteilung bitte prüfen: Reihenfolge nicht eindeutig.']});assert.equal((await s.click()).outcome,'review');assert.match(s.edits[0].options.reviewMessage,/Nameaufteilung/);assert.equal(s.calls.length,0);});
test('ordinary confirmation sends once, keeps approval false and refreshes confirmed status',async()=>{const s=setup({capacity:67});assert.equal((await s.click()).outcome,'sent');assert.equal(s.calls.filter(c=>c?.action==='send').length,1);assert.equal(s.calls[0].reservation.override,false);assert.equal(s.context.rows[0].status,'Bestätigt');assert.equal(s.context.outbox.length,1);assert.equal(s.edits.length,0);});
test('a concurrent capacity change opens approval after a rejected send without retrying',async()=>{const error=Object.assign(Error('Mehr als 70 Personen. Bitte die manuelle Freigabe markieren.'),{status:400});const s=setup({sendError:error,afterLoad:c=>c.rows.push({id:'concurrent',date:candidate.date,time:'18:00',people:80,status:'Bestätigt'})});assert.equal((await s.click()).outcome,'review');assert.equal(s.calls.length,1);assert.equal(s.edits.length,1);assert.match(s.edits[0].options.reviewMessage,/70/);assert.equal(s.context.rows[0].status,'Offen');});
test('send failures stay errors rather than being reported as completed confirmations',async()=>{const s=setup({sendError:Object.assign(Error('Versandverbindung unterbrochen.'),{status:503})});const result=await s.click();assert.equal(result.outcome,'error');assert.equal(result.message,'Versandverbindung unterbrochen.');assert.equal(s.calls.length,1);assert.equal(s.edits.length,0);assert.equal(s.context.rows[0].status,'Offen');assert.equal(s.button.disabled,false);});
test('a queued delivery after a failed response is reported for retry without a second send',async()=>{const s=setup({sendError:Error('Antwort unterbrochen'),afterLoad:c=>{c.rows[0].status='Bestätigt';c.outbox.push({id:'delivery',mail_id:'incoming',reservation_id:candidate.id,state:'failed'});}});assert.equal((await s.click()).outcome,'pending');assert.equal(s.calls.filter(c=>c?.action==='send').length,1);assert.equal(s.edits.length,0);});
test('review excludes lunch, cancelled and waitlisted guests and ignores other dates',()=>{const others=[{...candidate,id:'lunch',time:'12:00',people:200,status:'Bestätigt'},{...candidate,id:'cancelled',people:200,status:'Storniert'},{...candidate,id:'waiting',people:200,status:'Warteliste'},{...candidate,id:'other-day',date:'2026-11-27',people:200,status:'Bestätigt'}];assert.equal(confirmationReviewReason(candidate,others), '');assert.equal(confirmationNeedsManualReview({status:503,message:'Mehr als 70 Personen'}),false);});

for(const [label,extra] of [['canonical flag',{gondola:1}],['guest selection',{data:JSON.stringify({...guest(candidate),gondola:'Ja'})}],['assigned table',{table_no:'G2'}]]){
 test(`gondola ${label} requires OK before sending and cancellation leaves reservation open`,async()=>{
  const booking={...candidate,...extra},cancelled=setup({booking,acceptGondola:false,tableOverride:''});
  assert.equal((await cancelled.click()).outcome,'cancelled');assert.deepEqual(cancelled.questions,['Habt ihr gesehen, dass diese Reservation in einer Fonduegondel ist?']);assert.equal(cancelled.calls.length,0);assert.equal(cancelled.context.rows[0].status,'Offen');
  const accepted=setup({booking});assert.equal((await accepted.click()).outcome,'sent');assert.deepEqual(accepted.questions,['Habt ihr gesehen, dass diese Reservation in einer Fonduegondel ist?']);assert.equal(accepted.calls[0].reservation.gondola,true);
 });
}
test('normal table reservations do not ask the gondola question',async()=>{const s=setup();await s.click();assert.equal(s.questions.length,0);});

test('checking an existing reservation carries the incoming form gondola wish into the editor',()=>{
 const start=source.indexOf('function excelRequestProposal('),end=source.indexOf('\nasync function editExcelRequest(',start);
 const ctx={isGondolaReservation,guest};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 for(const revision of [0,3]){
  const booking={...candidate,revision,gondola:0},mail={draft:{data:{gondola:'Ja'}},issues:[]};
  const reviewed=ctx.excelRequestProposal(mail,booking);assert.equal(reviewed.gondola,1);assert.equal(guest(reviewed).gondola,'Ja');assert.equal(booking.gondola,0);
 }
});
