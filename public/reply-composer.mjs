import {guest,escapeHTML as e} from './core.mjs';
import {suggestSalutation} from './confirmation-core.mjs';
import {replyMessage,replySubject} from './reply-core.mjs';
export function openReplyComposer(dialog,{mail,booking,signature,send,readDelivery,retry,sent,initialBody='',recipientOverride,firstOverride,salutationOverride}){
 const original=booking?guest(booking):mail.draft?.data||{},d={...original,...(recipientOverride!==undefined?{email:recipientOverride}:{}),...(firstOverride!==undefined?{first:firstOverride}:{}),...(salutationOverride!==undefined?{salutation:salutationOverride}:{})},sourceEmail=String(mail.sender||'').match(/(?:<|^)([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?$/)?.[1]||'',id=crypto.randomUUID();let busy=false,frozen=null;
 dialog.onclose=null;dialog.classList.remove('floor-dialog');dialog.close();
 dialog.innerHTML=`<div class="dialog-head"><h2>Nur antworten</h2><button type="button" class="quiet" data-reply-close aria-label="Schliessen">✕</button></div><p>Deine Antwort wird als E-Mail gesendet. Der bisherige Status der Anfrage und die Reservation bleiben unverändert.</p><form class="stack" data-reply-form><label>E-Mail-Adresse<input name="recipient" type="email" required maxlength="254" value="${e(d.email||sourceEmail)}"></label><div class="two"><label>Vorname<input name="first" maxlength="100" value="${e(d.first||'')}"></label><label>Anrede<select name="salutation">${['Liebe','Lieber','Hallo'].map(s=>`<option ${s===(d.salutation||suggestSalutation(d.first)||'Hallo')?'selected':''}>${s}</option>`).join('')}</select></label></div><label>Betreff<input name="subject" required maxlength="200" value="${e(replySubject(mail.subject))}"></label><label>Deine Antwort<textarea name="body" rows="8" required minlength="3" maxlength="12000" placeholder="Antworttext schreiben …">${e(initialBody)}</textarea></label><label class="check"><input name="recipientReviewed" type="checkbox" checked required>Empfängeradresse geprüft.</label><details><summary>Vollständige Antwort ansehen</summary><pre class="reply-preview" data-reply-preview></pre></details><p class="error-text" role="alert" data-reply-error></p><div class="actions"><button type="button" class="secondary" data-reply-close>Abbrechen</button><button type="submit" data-reply-send>Antwort senden</button><button type="button" data-reply-retry hidden>Gespeicherte Antwort erneut senden</button></div></form>`;
 const $=s=>dialog.querySelector(s),form=$('[data-reply-form]'),error=$('[data-reply-error]'),preview=$('[data-reply-preview]');
 const values=()=>Object.fromEntries([...form.querySelectorAll('[name]')].map(el=>[el.name,el.type==='checkbox'?el.checked:el.value]));
 const lock=()=>{form.querySelectorAll('input,textarea,select').forEach(el=>el.disabled=busy||!!frozen);$('[data-reply-send]').disabled=busy||!!frozen;$('[data-reply-send]').hidden=!!frozen;$('[data-reply-retry]').hidden=!frozen;$('[data-reply-retry]').disabled=busy;dialog.querySelectorAll('[data-reply-close]').forEach(b=>b.disabled=busy);};
 const renderPreview=()=>{try{preview.textContent=replyMessage({...values(),signature}).text;}catch{preview.textContent='Anrede und Signatur werden beim Senden automatisch ergänzt.';}};
 form.oninput=ev=>{if(ev.target?.name==='first'&&!form.querySelector('[name=salutation]').dataset.manual)form.querySelector('[name=salutation]').value=suggestSalutation(ev.target.value)||'Hallo';renderPreview();};
 form.querySelector('[name=salutation]').onchange=()=>{form.querySelector('[name=salutation]').dataset.manual='true';renderPreview();};
 dialog.querySelectorAll('[data-reply-close]').forEach(b=>b.onclick=()=>dialog.close());dialog.oncancel=ev=>{if(busy)ev.preventDefault();};
 async function perform(isRetry){
  if(busy)return;const v=values();if(!isRetry){try{replyMessage({...v,signature});if(!v.recipientReviewed)throw Error('Bitte die Empfängeradresse prüfen.');}catch(err){error.textContent=err.message;return;}}
  busy=true;error.textContent='';lock();
  try{
   if(isRetry)await retry(frozen.id);else await send({id,mail_id:mail.id,recipient:v.recipient,first:v.first,salutation:v.salutation,subject:v.subject,body:v.body,signature,recipient_reviewed:true});
   dialog.close();await sent();
  }catch(err){
   error.textContent=err.message;
   try{const delivery=await readDelivery(frozen?.id||id);if(delivery?.state==='sent'){dialog.close();await sent();return;}if(delivery){frozen=delivery;preview.textContent=delivery.message_text||preview.textContent;form.querySelector('[name=recipient]').value=delivery.recipient;form.querySelector('[name=subject]').value=delivery.subject;error.textContent+=' Die gespeicherte Antwort kann erneut gesendet werden.';}}catch{}
  }finally{busy=false;if(dialog.isConnected)lock();}
 }
 form.onsubmit=ev=>{ev.preventDefault();return perform(false);};$('[data-reply-retry]').onclick=()=>perform(true);renderPreview();dialog.showModal();
}
