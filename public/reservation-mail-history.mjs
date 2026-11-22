import {escapeHTML as e,guest} from './core.mjs';
import {resolveRequestBooking} from './request-matching.mjs';

export function reservationMailIndex(rows,inbox=[],outbox=[],replies=[]){
 const index=new Map(),byMail=new Map(),known=new Set(rows.map(r=>r.id));
 const add=(id,type,mail)=>{if(!known.has(id))return;let items=index.get(id);if(!items)index.set(id,items=[]);if(!items.some(x=>x.type===type&&x.id===mail.id))items.push({...mail,type});};
 for(const m of inbox){const match=resolveRequestBooking(m,rows);if(!match.booking||match.kind==='ambiguous')continue;byMail.set(m.id,match.booking.id);add(match.booking.id,'incoming',m);}
 for(const m of outbox){if(m.state!=='sent')continue;const id=known.has(m.reservation_id)?m.reservation_id:byMail.get(m.mail_id);if(!id)continue;add(id,'confirmation',m);if(m.mail_id&&!byMail.has(m.mail_id)){byMail.set(m.mail_id,id);add(id,'incoming',inbox.find(x=>x.id===m.mail_id)||{id:m.mail_id,subject:'Zugehörige Anfrage'});}}
 for(const m of replies)if(m.state==='sent')add(byMail.get(m.mail_id),'reply',m);
 for(const items of index.values())items.sort((a,b)=>String(a.received_at||a.sent_at||a.created||'').localeCompare(String(b.received_at||b.sent_at||b.created||''))||String(a.id).localeCompare(String(b.id)));
 return index;
}

export function reservationMailButton(booking,index){
 const count=index.get(booking.id)?.length||0;
 return count?`<button type="button" class="quiet small reservation-mail-button no-print" data-reservation-mail="${e(booking.id)}" aria-label="Mailverlauf zur Reservation öffnen" title="Mailverlauf öffnen (${count} ${count===1?'Nachricht':'Nachrichten'})">✉</button>`:'';
}
const sentLabel=m=>m.type==='incoming'?'Eingegangen':m.type==='confirmation'?'Bestätigung gesendet':'Antwort gesendet';
function timestamp(m){const value=m.received_at||m.sent_at||m.created,date=new Date(value);return value&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('de-CH',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Zurich'}).format(date):'';}
export function reservationMailHistoryHTML(messages,{collapsible=true}={}){return messages.map(m=>{
 const heading=`${e(sentLabel(m))}${timestamp(m)?` · ${e(timestamp(m))}`:''} · ${e(m.subject||'Ohne Betreff')}`;
 const body=`<p>${m.type==='incoming'?'Von':'An'}: <strong>${e(m.type==='incoming'?m.sender:m.recipient)}</strong></p><pre class="mail-body">${e(m.type==='incoming'?m.body:m.message_text)}</pre>`;
 return collapsible?`<details class="reservation-mail-message" open><summary>${heading}</summary>${body}</details>`:`<section class="reservation-mail-message"><h4>${heading}</h4>${body}</section>`;
}).join('');}


async function readAll(req,table,fields,filter=''){
  const result=[];
  for(;;){
   const page=await req(`/rest/v1/${table}?select=${fields}${filter}&order=id.asc&limit=1000&offset=${result.length}`);
   result.push(...page);
   if(page.length<1000)return result;
  }
}

// Read every metadata page so older conversations are not cut off by the inbox view.
export async function loadReservationMailHistory(booking,rows,req){
 const [inbox,outbox,replies]=await Promise.all([
  readAll(req,'mail_inbox','id,sender,subject,draft,state,reservation_id,received_at'),
  readAll(req,'mail_outbox','id,reservation_id,mail_id,recipient,subject,state,created,sent_at','&state=eq.sent'),
  readAll(req,'mail_replies','id,mail_id,recipient,subject,state,created,sent_at','&state=eq.sent')
 ]);
 const items=reservationMailIndex(rows,inbox,outbox,replies).get(booking.id)||[];
 return readMessages(items,req);
}
// Load all associated incoming and sent messages even when the selected mail has
// not yet been linked. The caller has already parsed its complete original body.
export async function loadRequestMailHistory(mail,rows,req){
 const [inbox,outbox,replies]=await Promise.all([
  readAll(req,'mail_inbox','id,sender,subject,draft,state,reservation_id,received_at'),
  readAll(req,'mail_outbox','id,reservation_id,mail_id,recipient,subject,state,created,sent_at','&state=eq.sent'),
  readAll(req,'mail_replies','id,mail_id,recipient,subject,state,created,sent_at','&state=eq.sent')
 ]);
 const selected={...(inbox.find(m=>m.id===mail.id)||{}),...mail};
 const completeInbox=inbox.filter(m=>m.id!==mail.id).concat(selected);
 let match=resolveRequestBooking(selected,rows);
 if(match.kind==='none'){
  const ids=[...new Set(outbox.filter(o=>o.mail_id===mail.id).map(o=>o.reservation_id))];
  const candidates=rows.filter(r=>ids.includes(r.id)&&!r.deleted_at);
  if(candidates.length===1)match={booking:candidates[0],kind:'related',candidates};
 }
 const items=match.booking?(reservationMailIndex(rows,completeInbox,outbox,replies).get(match.booking.id)||[]):[];
 // Always retain the selected original and its direct replies, including ambiguous cases.
 const add=item=>{if(!items.some(m=>m.id===item.id&&m.type===item.type))items.push(item);};
 add({...selected,type:'incoming'});
 for(const o of outbox)if(o.mail_id===mail.id)add({...o,type:'confirmation'});
 for(const r of replies)if(r.mail_id===mail.id)add({...r,type:'reply'});
 return {...match,messages:await readMessages(items,req)};
}
async function readMessages(items,req){
 const messages=await Promise.all(items.map(async item=>{
  const table=item.type==='incoming'?'mail_inbox':item.type==='confirmation'?'mail_outbox':'mail_replies';
  const fields=item.type==='incoming'?'id,sender,subject,body,received_at':'id,recipient,subject,message_text,sent_at,created';
  const [message]=await req(`/rest/v1/${table}?select=${fields}&id=eq.${encodeURIComponent(item.id)}`);
  if(!message)throw Error('Eine zugehörige Nachricht konnte nicht geladen werden. Bitte erneut versuchen.');
  return {...item,...message};
 }));
 return messages.sort((a,b)=>String(a.received_at||a.sent_at||a.created||'').localeCompare(String(b.received_at||b.sent_at||b.created||'')));
}
const emptyHistory='<p class="muted">Für diese Reservation sind keine E-Mails hinterlegt.</p>';
export function reservationMailDisclosure(){
 return '<details data-booking-mail-history><summary>Gesamten Mailverlauf ansehen</summary><div data-mail-history-content></div></details>';
}
export function bindReservationMailDisclosure(details,load){
 let loaded=false,loading=false;
 details.ontoggle=async()=>{
  if(!details.open||loaded||loading)return;
  loading=true;
  const content=details.querySelector('[data-mail-history-content]');
  content.setAttribute('role','status');content.textContent='Mailverlauf wird geladen …';
  try{
   const messages=await load();
   content.removeAttribute('role');content.innerHTML=reservationMailHistoryHTML(messages)||emptyHistory;loaded=true;
  }catch(err){
   content.setAttribute('role','alert');content.textContent=err.message;
   const retry=content.ownerDocument.createElement('button');retry.type='button';retry.className='secondary small';retry.textContent='Erneut versuchen';
   retry.onclick=()=>details.ontoggle();content.append(retry);
  }finally{loading=false;}
 };
}
export async function openReservationMailHistory(dialog,booking,items,req,load){
 const token={};dialog.reservationMailToken=token;dialog.onclose=null;dialog.close();dialog.classList.remove('floor-dialog');
 const g=guest(booking),name=[g.first,g.last].filter(Boolean).join(' ')||g.company||'Reservation';
 dialog.innerHTML=`<div class="dialog-head"><h2>Mailverlauf · ${e(name)}</h2><button type="button" class="quiet" data-mail-history-close aria-label="Schliessen">✕</button></div><p>${e(booking.date)} · ${e(booking.time||'Zeit offen')} · ${e(booking.people)} Personen</p><div data-mail-history-content role="status">Mailverlauf wird geladen …</div>`;
 dialog.querySelector('[data-mail-history-close]').onclick=()=>dialog.close();dialog.showModal();
 try{
  const messages=await (load?load():readMessages(items||[],req));
  if(dialog.reservationMailToken!==token||!dialog.open)return;
  const content=dialog.querySelector('[data-mail-history-content]');content.removeAttribute('role');content.innerHTML=reservationMailHistoryHTML(messages)||emptyHistory;
 }catch(err){if(dialog.reservationMailToken===token&&dialog.open){const content=dialog.querySelector('[data-mail-history-content]');content.setAttribute('role','alert');content.textContent=err.message;}}
}
