import {DEFAULT_BODY,DEFAULT_SIGNATURE,FROM,BANNER,validEmail} from './confirmation-core.mjs';
export {FROM};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function automaticMessage(context){
 const r=context.reservation,d=typeof r.data==='string'?JSON.parse(r.data):r.data||{},s=context.settings||{};
 const name=String(d.first||d.last||'').trim();
 if(!name||name.length>200||/[\r\n]/.test(name)||!validEmail(d.email)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)||!Number.isInteger(r.people)||r.people<1||r.people>70)throw Error('Angaben manuell prüfen.');
 const date=new Date(r.date+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==r.date)throw Error('Datum manuell prüfen.');
 const day=new Intl.DateTimeFormat('de-CH',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Zurich'}).format(date);
 const body=s.body??DEFAULT_BODY,signature=s.signature??DEFAULT_SIGNATURE,subject=s.subject||'Deine Reservationsbestätigung · Fonduehüsli Bülach';
 if(!body.trim()||body.length>12000||signature.length>4000||subject.length>200||/[\r\n]/.test(subject))throw Error('Bestätigungsvorlage prüfen.');
 const greeting=d.first&&['Liebe','Lieber'].includes(d.salutation)?`${d.salutation} ${name}`:`Hallo ${name}`;
 const text=`${greeting}\n\n${body.replaceAll('{{datum}}',day).replaceAll('{{zeit}}',r.time).replaceAll('{{personen}}',String(r.people)).trim()}\n\nDeine Reservation: ${day}, ${r.time} Uhr, ${r.people} ${r.people===1?'Person':'Personen'}.\n\n${signature.trim()}`;
 return {recipient:d.email.trim().toLowerCase(),subject,text,html:`<!doctype html><html lang="de"><body style="margin:0;padding:24px;font:15px Arial,sans-serif;color:#171717"><div style="max-width:650px">${text.split('\n\n').map(p=>'<p style="margin:0 0 22px">'+esc(p).replaceAll('\n','<br>')+'</p>').join('')}<img src="${BANNER}" width="630" alt="Fonduehüsli Lindenhof · Bülach" style="display:block;max-width:100%;height:auto"></div></body></html>`};
}
export async function runAutomaticConfirmation(mailId,{rpc,domainReady,send}){
 const context=await rpc('automatic_confirmation_context',{p:{mail_id:mailId}});
 // No provider call, reservation update or outbox creation while disabled.
 if(context?.enabled!==true)return {state:'disabled'};
 if(context.outbox?.state==='sent')return {state:'already_sent'};
 if(!context.outbox&&context.eligible!==true)return {state:'manual'};
 if(!await domainReady())return {state:'manual',reason:'Absenderdomain nicht versandbereit.'};
 let outbox=context.outbox;
 if(!outbox)outbox=await rpc('automatic_confirmation_prepare',{p:{mail_id:mailId,revision:context.reservation.revision,settings_updated:context.settings.updated,message:automaticMessage(context)}});
 if(outbox?.enabled===false)return {state:'disabled'};
 if(!outbox?.id)return {state:'manual'};
 if(outbox.state==='sent')return {state:'already_sent'};
 let claimed=false,accepted=false;
 try{
  outbox=await rpc('confirmation_delivery',{p:{id:outbox.id,action:'claim'}});
  if(outbox.state==='sent')return {state:'already_sent'};
  claimed=true;const result=await send(outbox);if(!result?.id)throw Error('Keine Versand-ID erhalten.');accepted=true;
  await rpc('confirmation_delivery',{p:{id:outbox.id,action:'sent',provider_id:result.id}});
  return {state:'sent'};
 }catch(error){
  if(claimed&&!accepted)await rpc('confirmation_delivery',{p:{id:outbox.id,action:'failed',error:error instanceof Error?error.message:'Versand fehlgeschlagen.'}}).catch(()=>{});
  return {state:'pending_manual_retry'};
 }
}
