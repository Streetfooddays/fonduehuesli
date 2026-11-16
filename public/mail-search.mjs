import {guest,escapeHTML as e} from './core.mjs';
const normalize=value=>String(value??'').toLocaleLowerCase('de-CH').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const dates=value=>{const day=String(value||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(day)?day+' '+day.split('-').reverse().join('.'):String(value||'');};
export function filterMailRequests(items,rows,query){
 const tokens=normalize(query).trim().split(/\s+/).filter(Boolean);if(!tokens.length)return [...items];
 const bookings=new Map(rows.map(r=>[r.id,r]));
 return items.filter(mail=>{
  const booking=bookings.get(mail.reservation_id),draft=mail.draft||{},data=booking?guest(booking):{};
  const values=[mail.sender,mail.subject,mail.followup_note,dates(mail.received_at),dates(draft.date),dates(booking?.date),draft.time,booking?.time,booking?.table_no,booking?.status,...Object.values(draft.data||{}),...Object.values(data)];
  const text=normalize(values.map(v=>typeof v==='object'?'':v).join(' '));return tokens.every(token=>text.includes(token));
 });
}
export function renderMailSearch(root,{items,rows,needsAction,cards,bind=()=>{},query='',onQuery=()=>{}}){
 let archiveOpen=false;
 root.innerHTML=`<section class="mail-search" aria-label="Mailanfragen durchsuchen"><label for="mail-search">Suche im Maileingang<input id="mail-search" type="search" autocomplete="off" placeholder="Name, E-Mail, Betreff oder Datum" value="${e(query)}" aria-describedby="mail-search-count"></label><button type="button" class="secondary small" id="mail-search-clear">Suche zurücksetzen</button><p id="mail-search-count" role="status" aria-live="polite"></p></section><div id="mail-search-results"></div>`;
 const input=root.querySelector('#mail-search'),clear=root.querySelector('#mail-search-clear'),results=root.querySelector('#mail-search-results');
 function draw(){
  const matching=filterMailRequests(items,rows,input.value),active=matching.filter(needsAction),archived=matching.filter(m=>!needsAction(m)),searching=!!input.value.trim(),totalArchived=items.filter(m=>!needsAction(m)).length;
  root.querySelector('#mail-search-count').textContent=`${matching.length} von ${items.length} Anfragen · ${active.length} offen · ${archived.length} abgelegt`;
  clear.disabled=!input.value;
  results.innerHTML=(active.length?cards(active):'')+(archived.length?`<details class="day-notes mail-search-archive" ${searching||archiveOpen?'open':''}><summary>Bestätigt / erledigt abgelegt (${searching?archived.length+' von '+totalArchived:archived.length})</summary>${cards(archived)}</details>`:'')+(!matching.length?`<p class="empty">${searching?'Keine passenden Anfragen gefunden.':'Keine Mailanfragen vorhanden.'}</p>`:'');
  const archive=results.querySelector('details');if(archive)archive.ontoggle=()=>{if(!input.value.trim())archiveOpen=archive.open;};
  bind();onQuery(input.value);
 }
 input.oninput=draw;clear.onclick=()=>{input.value='';draw();input.focus();};draw();
}
