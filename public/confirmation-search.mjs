import {filterMailRequests} from './mail-search.mjs';
import {escapeHTML as e} from './core.mjs';
export function filterSentConfirmations(outbox,rows,query){
 const sent=outbox.filter(o=>o.state==='sent');
 const matches=new Set(filterMailRequests(sent.map(o=>({...o,sender:o.recipient,received_at:o.sent_at})),rows,query).map(o=>o.id));
 return sent.filter(o=>matches.has(o.id));
}
function sentDate(value){const date=new Date(value);return value&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('de-CH',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Zurich'}).format(date):'Versanddatum offen';}
export function renderConfirmationSearch(root,{outbox,rows,query='',bind=()=>{},onQuery=()=>{}}){
 root.innerHTML=`<section class="mail-search" aria-label="Gesendete Bestätigungen durchsuchen"><label for="confirmation-search">Suche in gesendeten Bestätigungen<input id="confirmation-search" type="search" autocomplete="off" placeholder="Name, E-Mail, Betreff oder Datum" value="${e(query)}" aria-describedby="confirmation-search-count"></label><button type="button" class="secondary small" id="confirmation-search-clear">Suche zurücksetzen</button><p id="confirmation-search-count" role="status" aria-live="polite"></p></section><div id="confirmation-search-results"></div>`;
 const input=root.querySelector('#confirmation-search'),clear=root.querySelector('#confirmation-search-clear'),results=root.querySelector('#confirmation-search-results');
 function draw(){
  const matches=filterSentConfirmations(outbox,rows,input.value),total=outbox.filter(o=>o.state==='sent').length;
  root.querySelector('#confirmation-search-count').textContent=`${matches.length} von ${total} Bestätigungen`;
  clear.disabled=!input.value;
  results.innerHTML=matches.length?matches.map(o=>`<article class="card"><strong>${e(o.recipient)}</strong><p>${e(o.subject)} · ${e(sentDate(o.sent_at))}</p><button type="button" class="secondary small" data-sent-mail="${e(o.id)}">Gesendete Antwort ansehen</button></article>`).join(''):'<p class="empty">Keine passenden Bestätigungen gefunden.</p>';
  bind();onQuery(input.value);
 }
 input.oninput=draw;clear.onclick=()=>{input.value='';draw();input.focus();};draw();
}
