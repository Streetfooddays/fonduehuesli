import {renderExcelOverview} from './excel-overview.mjs';
import {guest,escapeHTML as e} from './core.mjs';
import {floorPlan,setFloorLayouts,tableAssignments} from './floor-plan.mjs';
import {bindTablePicker,bindTableDragging} from './floor-interactions.mjs';
import {tableGroupAssignment} from './table-groups.mjs';
const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'');
const norm=s=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\d]/gu,'');
export function matchingRequestBooking(mail,rows){
 if(mail.reservation_id)return rows.find(r=>r.id===mail.reservation_id&&!r.deleted_at)||null;
 const d=mail.draft||{},name=d.data||{},keys=[norm((name.first||'')+(name.last||'')),norm((name.last||'')+(name.first||''))].filter(Boolean);
 if(!d.date||!d.people||!keys.length)return null;
 const matches=rows.filter(r=>{const n=guest(r);return !r.deleted_at&&r.status!=='Storniert'&&r.date===d.date&&Number(r.people)===Number(d.people)&&(r.time||'')===(d.time||'')&&[norm((n.first||'')+(n.last||'')),norm((n.last||'')+(n.first||''))].some(k=>keys.includes(k));});
 return matches.length===1?matches[0]:null;
}
export function relatedRequestBooking(mail,rows){
 if(mail.reservation_id||matchingRequestBooking(mail,rows))return null;
 const d=mail.draft||{},n=d.data||{},keys=[norm((n.first||'')+(n.last||'')),norm((n.last||'')+(n.first||''))].filter(Boolean);
 const matches=rows.filter(r=>{const g=guest(r);return !r.deleted_at&&r.status!=='Storniert'&&r.date===d.date&&[norm((g.first||'')+(g.last||'')),norm((g.last||'')+(g.first||''))].some(k=>keys.includes(k));});return matches.length===1?matches[0]:null;
}
export function requestSelection(mail,rows){
 const booking=matchingRequestBooking(mail,rows),draft=mail.draft||{};
 return {kind:'mail',mailId:mail.id,booking,rowId:booking?.id||null,day:booking?.date||draft.date||'',time:booking?.time||draft.time||'',people:booking?.people??draft.people??0,tables:booking?.table_no||'',name:[(booking?guest(booking):draft.data)?.first,(booking?guest(booking):draft.data)?.last].filter(Boolean).join(' ')||'Anfrage ohne Namen'};
}
export function oldestRequestsFirst(items){return [...items].sort((a,b)=>(Date.parse(a.received_at)||0)-(Date.parse(b.received_at)||0)||String(a.id).localeCompare(String(b.id)));}
export function renderExcelWorkspace(root,api){
 const memo=api.memo||{},state=()=>api.getState();let disposed=false,busy=false,moving=false,selection={kind:'none',day:api.date,tables:''},chosen='',tableChanged=false,bodyToken=0,selectedMail=null;
 const bodyCache=new Map();let requestsSignature='',displayedMail=null;
 root.classList.remove('day-compact');root.innerHTML='<div class="excel-workspace-left"></div><aside class="excel-workspace-right"><section class="wb-requests"><div class="wb-heading"><h2>Reservationsanfragen · älteste zuerst</h2><span id="wb-request-count"></span></div><div class="wb-request-selector"><select id="wb-request-select" aria-label="Reservationsanfrage auswählen"></select><button type="button" class="secondary small" id="wb-refresh">↻</button></div><div id="wb-request-content" class="wb-request-content"></div><div id="wb-request-actions" class="wb-request-actions"></div><p id="wb-request-feedback" class="wb-feedback" role="status"></p></section><div class="wb-plan-launch"><button type="button" id="wb-open-plan">Tischplan öffnen</button></div></aside><dialog class="wb-plan-dialog"><section class="wb-plan"><div class="wb-heading"><h2>Tischplan</h2><div><button type="button" class="quiet small" id="wb-close-plan" aria-label="Tischplan schliessen">✕</button><button type="button" class="secondary small" id="wb-move">Tische verschieben</button></div></div><p id="wb-plan-context"></p><div id="wb-plan-content" class="wb-plan-content"></div><div class="wb-plan-actions"><span id="wb-picked" role="status"></span><button type="button" class="small" id="wb-apply-tables">Tischwahl übernehmen</button></div><p id="wb-plan-feedback" class="wb-feedback" role="status"></p></section></dialog>';
 const $=s=>root.querySelector(s),message=(text,where='#wb-request-feedback')=>{if(!disposed)$(where).textContent=text;};
 let sheet;
 function choose(next,{navigate=true}={}){
  const same=selection.kind===next.kind&&selection.mailId===next.mailId&&selection.rowId===next.rowId;
  const fingerprint=x=>JSON.stringify([x.day,x.time,x.people,x.tables]);
  const changed=!same||fingerprint(selection)!==fingerprint(next);
  if(moving&&changed){message('Bitte zuerst «Verschieben beenden» wählen.','#wb-plan-feedback');return;}
  selection=next;memo.selection=next;
  if(!same||changed){chosen=next.tables||'';tableChanged=false;}
  if(validDay(next.day)){api.onDate(next.day);if(navigate)sheet?.navigate(next.day);}
  if(changed)drawPlan();
 }
 function drawPlan(){
  if(disposed)return;const s=state();setFloorLayouts(s.layouts);
  $('#wb-move').textContent=moving?'Verschieben beenden':'Tische verschieben';
  $('#wb-plan-context').textContent=validDay(selection.day)?`${selection.day} · ${selection.name||'Zeile oder Anfrage auswählen'}`:'Anfrage ohne eindeutiges Datum – bitte zuerst Datum ergänzen.';
  $('#wb-apply-tables').disabled=moving||selection.kind==='none'||!validDay(selection.day);
  $('#wb-open-plan').disabled=!validDay(selection.day);$('#wb-move').disabled=!validDay(selection.day);
  if(!validDay(selection.day)){$('#wb-plan-content').innerHTML='<p class="hint">Ohne eindeutiges Reservationsdatum wird kein Tischplan angezeigt.</p>';$('#wb-picked').textContent='';return;}
  const host=$('#wb-plan-content'),oldScroll=host.scrollTop;host.classList.toggle('floor-moving',moving);
  host.innerHTML=floorPlan(s.rows.filter(r=>r.id!==selection.booking?.id),selection.day,'all');host.scrollTop=oldScroll;
  const picked=()=>{$('#wb-picked').textContent='Auswahl: '+(chosen||'keine Tische');};picked();
  if(moving){
   const positions={...(s.layouts.find(l=>l.date===selection.day)?.positions||{})};
   bindTableDragging(host,positions,async(number,position)=>{
    $('#wb-move').disabled=true;$('#wb-close-plan').disabled=true;message('Tischposition wird gespeichert …','#wb-plan-feedback');
    try{await api.savePosition(selection.day,number,position);message('Tischposition gespeichert.','#wb-plan-feedback');drawPlan();}catch(err){message(err.message,'#wb-plan-feedback');throw err;}finally{if(!disposed){$('#wb-move').disabled=false;$('#wb-close-plan').disabled=false;}}
   });
  }else bindTablePicker(host,()=>chosen,value=>{
   try{chosen=tableGroupAssignment(value,selection.people);tableChanged=true;picked();message('Tischwahl übernehmen, um sie zu speichern.','#wb-plan-feedback');}
   catch(err){message(err.message,'#wb-plan-feedback');}
  },tableAssignments);
 }
 const initial=state();
 sheet=renderExcelOverview($('.excel-workspace-left'),{rows:initial.rows,outbox:initial.outbox,date:api.date,save:api.saveReservation,onSaved:api.afterSave,onDate:day=>{api.onDate(day);choose({kind:'none',day,tables:''},{navigate:false});},notice:api.notice,onSelectRow:ctx=>{choose({kind:'row',rowId:ctx.rowId,booking:ctx.booking,day:ctx.day,time:ctx.values.time,people:Number(ctx.values.people),tables:ctx.values.tableNo||'',name:[ctx.values.first,ctx.values.last].filter(Boolean).join(' ')||'Neue Reservation'},{navigate:false});},onReservationChanged:()=>{if(disposed)return;drawRequests();drawPlan();}});
 function actionAllowed(){if(busy)return false;if(sheet.isDirty()){message('Bitte zuerst die geänderten Excel-Zeilen speichern.');return false;}return true;}
 async function refresh({silent=false}={}){
  if(disposed||busy||moving)return;try{await api.reload();if(disposed)return;const s=state();sheet.replaceData(s.rows,s.outbox);if(selection.booking){const latest=s.rows.find(r=>r.id===selection.booking.id);if(latest){selection={...selection,booking:latest};if(!tableChanged)chosen=latest.table_no||'';}}drawRequests();drawPlan();if(!silent)message('Anfragen und Belegung aktualisiert.');}catch(err){if(!silent)message(err.message);}
 }
 function drawRequests(){
  if(disposed)return;const s=state(),pending=oldestRequestsFirst(s.inbox.filter(api.needsAction));
  const signature=JSON.stringify([pending.map(m=>[m.id,m.state,m.reservation_id,m.draft,matchingRequestBooking(m,s.rows)?.revision]),s.outbox.map(o=>[o.id,o.state])]);$('#wb-request-count').textContent=String(pending.length);
  if(!pending.some(m=>m.id===selectedMail))selectedMail=pending[0]?.id||null;
  memo.mailId=selectedMail;
  if(requestsSignature!==signature){requestsSignature=signature;$('#wb-request-select').innerHTML=pending.map(m=>{const ctx=requestSelection(m,s.rows);return `<option value="${e(m.id)}" ${m.id===selectedMail?'selected':''}>${e(ctx.day||'Datum offen')} · ${e(ctx.name)}</option>`;}).join('');$('#wb-request-select').disabled=!pending.length;}
  const mail=pending.find(m=>m.id===selectedMail);
  if(!mail){displayedMail=null;$('#wb-request-content').innerHTML='<p class="muted">Keine offenen Reservationsanfragen.</p>';$('#wb-request-actions').innerHTML='';return;}
  $('#wb-request-select').value=selectedMail;
  const ctx=requestSelection(mail,s.rows),d=ctx.booking?guest(ctx.booking):mail.draft?.data||{},contentSignature=JSON.stringify([mail.id,mail.state,mail.draft,ctx.booking?.revision,s.outbox.map(o=>[o.id,o.state])]);
  if(displayedMail===mail.id&&$('#wb-request-content').dataset.signature===contentSignature)return;
  displayedMail=mail.id;$('#wb-request-content').dataset.signature=contentSignature;
  const linked=!!mail.reservation_id,duplicate=!linked&&!!ctx.booking,related=relatedRequestBooking(mail,s.rows),queued=s.outbox.find(o=>o.state!=='sent'&&(o.mail_id===mail.id||o.reservation_id===ctx.booking?.id));
  $('#wb-request-content').innerHTML=`<h3>${e(mail.subject||'Ohne Betreff')}</h3><p class="wb-mail-meta">${e(mail.sender)}<br>${e(new Intl.DateTimeFormat('de-CH',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Zurich'}).format(new Date(mail.received_at)))}</p><p><strong>${e(ctx.name)}</strong> · ${e(ctx.day||'Datum offen')} · ${e(ctx.time||'Zeit offen')} · ${e(ctx.people||'?')} Personen<br>Bestätigung an: <strong>${e(d.email||'E-Mail-Adresse ergänzen')}</strong></p>${duplicate?'<p class="hint">Passender Eintrag bereits vorhanden. Beim Übernehmen wird die Anfrage damit verknüpft.</p>':related?'<p class="hint">Namensgleicher Eintrag am selben Tag gefunden; Uhrzeit oder Personenzahl weichen ab. Bitte vor der Übernahme prüfen.</p>':''}${mail.issues?.length?`<p class="wb-review">${mail.issues.map(e).join('<br>')}</p>`:''}<pre class="wb-original-mail">Mailtext wird geladen …</pre>`;
  $('#wb-request-actions').innerHTML=`<button type="button" class="secondary small" id="wb-transfer">${linked?'In Liste anzeigen':duplicate?'Mit Eintrag verknüpfen':related?'Abweichung prüfen':'In Liste übernehmen'}</button><button type="button" class="small" id="wb-confirm" ${queued?'disabled':''}>Bestätigen & Mail senden</button><button type="button" class="secondary small" id="wb-edit-reply" ${queued?'disabled':''}>Antwort bearbeiten</button><button type="button" class="quiet small" id="wb-edit-request">Angaben bearbeiten</button>${queued?'<button type="button" class="small" id="wb-retry">Versand erneut versuchen</button>':''}`;
  if(queued)$('#wb-retry').onclick=async()=>{if(!actionAllowed())return;try{await api.retryOutbox(queued.id);}catch(err){message(err.message);}};$('#wb-transfer').onclick=()=>runRequest('transfer');$('#wb-confirm').onclick=()=>runRequest('confirm');$('#wb-edit-reply').onclick=()=>runRequest('edit');$('#wb-edit-request').onclick=()=>{if(actionAllowed())api.editRequest(mail.id);};
  const token=++bodyToken;
  (async()=>{try{if(!bodyCache.has(mail.id))bodyCache.set(mail.id,(await api.readMail(mail.id)).body||'');if(!disposed&&token===bodyToken&&selectedMail===mail.id)$('#wb-request-content .wb-original-mail').textContent=bodyCache.get(mail.id);}catch(err){if(!disposed&&token===bodyToken)$('#wb-request-content .wb-original-mail').textContent=err.message;}})();
 }
 async function runRequest(action){
  if(!actionAllowed())return;
  const id=selectedMail;if(!id)return;
  const s=state(),m=s.inbox.find(m=>m.id===id);if(!m)return;
  const isSelected=selection.kind==='mail'&&selection.mailId===id||selection.booking?.id===matchingRequestBooking(m,s.rows)?.id&&!!selection.booking;
  const tableValue=isSelected&&tableChanged?chosen:undefined;
  busy=true;$('#wb-request-actions').querySelectorAll('button').forEach(b=>b.disabled=true);message('Wird verarbeitet …');
  try{
   if(action==='transfer'){
    const booking=await api.transfer(id,tableValue);if(disposed)return;
    if(booking){const fresh=state();sheet.replaceData(fresh.rows,fresh.outbox);sheet.focusReservation(booking.id);message('In Liste übernommen. Es wurde keine E-Mail versendet.');drawRequests();drawPlan();}else message('Bitte die fehlenden oder unklaren Angaben im Formular prüfen.');
   }else{await api.confirm(id,action==='edit',tableValue);if(!disposed)message(action==='edit'?'Bestätigung im Bearbeitungsfenster geöffnet.':'Bestätigung bearbeitet.');}
  }catch(err){message(err.message);}finally{busy=false;if(!disposed){displayedMail=null;drawRequests();}}
 }
 $('#wb-request-select').onchange=()=>{if(moving){$('#wb-request-select').value=selectedMail;message('Bitte zuerst Verschieben beenden.');return;}selectedMail=$('#wb-request-select').value;memo.mailId=selectedMail;displayedMail=null;drawRequests();const m=state().inbox.find(m=>m.id===selectedMail);if(m)choose(requestSelection(m,state().rows));};
 $('#wb-refresh').onclick=()=>refresh();const planDialog=$('.wb-plan-dialog');$('#wb-open-plan').onclick=()=>{drawPlan();planDialog.showModal();};$('#wb-close-plan').onclick=()=>planDialog.close();planDialog.onclose=()=>{moving=false;if(!disposed)drawPlan();};planDialog.oncancel=ev=>{if($('#wb-move').disabled&&moving)ev.preventDefault();};
 $('#wb-move').onclick=()=>{moving=!moving;drawPlan();};
 $('#wb-apply-tables').onclick=async()=>{
  if(moving||selection.kind==='none')return;
  if(selection.kind==='mail'){if(!actionAllowed())return;await runRequest('transfer');return;}
  if(selection.booking){
   const button=$('#wb-apply-tables');button.disabled=true;
   try{const saved=await api.saveTables(selection.booking,chosen);if(disposed)return;selection={...selection,booking:saved,tables:saved.table_no};chosen=saved.table_no;tableChanged=false;sheet.applyTable(saved.id,saved.table_no,saved);drawPlan();message('Tischzuordnung gespeichert.','#wb-plan-feedback');}catch(err){message(err.message,'#wb-plan-feedback');}finally{if(!disposed)button.disabled=false;}
  }else{sheet.applyTable(selection.rowId,chosen);message('Tischwahl in Eingabezeile übernommen. Zeile mit «Eintragen» speichern.','#wb-plan-feedback');}
 };
 drawRequests();const first=state().inbox.find(m=>m.id===selectedMail),restore=memo.selection;if(restore?.kind==='row'&&state().rows.some(r=>r.id===restore.rowId)){sheet.focusReservation(restore.rowId);}else if(first)choose(requestSelection(first,state().rows));else drawPlan();
 const timer=setInterval(()=>refresh({silent:true}),30000);
 return {canLeave:()=>sheet.canLeave(),isDirty:()=>sheet.isDirty(),refreshPlan:drawPlan,dispose(){planDialog.close();disposed=true;bodyToken++;clearInterval(timer);sheet.dispose();}};
}
