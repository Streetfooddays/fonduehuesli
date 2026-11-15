import {validEmail,DEFAULT_SIGNATURE,BANNER} from './confirmation-core.mjs';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function replySubject(original=''){const title=String(original||'Deine Anfrage · Fonduehüsli').replace(/[\r\n]+/g,' ').trim();return (/^(?:re|aw):/i.test(title)?title:'Re: '+title).slice(0,200);}
export function replyMessage({recipient,subject,body,first='',salutation='Hallo',signature=DEFAULT_SIGNATURE}){
 if(!validEmail(recipient))throw Error('Bitte eine gültige E-Mail-Adresse angeben.');
 const title=String(subject||'').trim(),content=String(body||'').trim(),name=String(first||'').trim();
 if(!title||title.length>200||/[\r\n]/.test(title))throw Error('Bitte den Betreff prüfen.');
 if(content.length<3||content.length>12000||signature.length>4000||name.length>100||/[\r\n]/.test(name)||!['Liebe','Lieber','Hallo'].includes(salutation))throw Error('Bitte Antworttext und Anrede prüfen.');
 const greeting=name?`${salutation} ${name}`:'Guten Tag',text=`${greeting}\n\n${content}\n\n${signature.trim()}`;
 return {recipient:recipient.trim().toLowerCase(),subject:title,text,html:`<!doctype html><html lang="de"><body style="padding:24px;font:15px Arial,sans-serif;color:#171717"><div style="max-width:650px">${text.split('\n\n').map(p=>'<p>'+e(p).replaceAll('\n','<br>')+'</p>').join('')}<img src="${BANNER}" width="630" style="max-width:100%;height:auto" alt="Fonduehüsli Bülach"></div></body></html>`};
}
