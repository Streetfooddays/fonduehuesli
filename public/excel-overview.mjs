import {tableGroupWarning} from './table-groups.mjs';
import {gondolaRowClass,gondolaAvailability} from './gondolas.mjs';
import {reservationRemarks} from './day-list.mjs';
import {cancellationsLast,reservationRank} from './reservation-order.mjs';
import {guest,escapeHTML as e} from './core.mjs';
import {tableAssignments} from './floor-plan.mjs';
export function weekDays(value){
 const start=new Date(value+'T12:00:00Z');if(!Number.isFinite(start.getTime()))throw Error('Ungültiges Datum.');
 start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
 return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);});
}
export function sheetTotals(rows,day){const active=rows.filter(r=>r.date===day&&!['Warteliste','Storniert'].includes(r.status));return {reservations:active.length,people:active.reduce((n,r)=>n+Number(r.people||0),0)};}
export function sheetPayload(r,values,createId){
 const data={...(r?guest(r):{})};for(const k of ['last','first','phone','email','comment'])data[k]=String(values[k]||'').trim();
 if(!data.last&&!data.first)throw Error('Bitte Nachname oder Vorname eintragen.');
 const people=Number(values.people);if(!/^\d+$/.test(String(values.people))||!Number.isSafeInteger(people)||people<(r?0:1)||people>1000)throw Error('Bitte eine gültige Personenzahl eintragen.');
 return {id:r?.id,createId,revision:r?.revision,date:values.date,time:values.time||'',people,tableNo:values.tableNo||'',status:values.status||r?.status||'Bestätigt',note:r?.note||'',gondola:tableAssignments(values.tableNo).tables.some(n=>/^G[123]$/.test(n))||!String(values.tableNo||'').trim()&&!!r?.gondola,override:!!values.override,data};
}
const dayLabel=value=>new Intl.DateTimeFormat('de-CH',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Zurich'}).format(new Date(value+'T12:00:00Z'));
const cols=[['last','Nachname','text'],['first','Vorname','text'],['time','Zeit','time'],['people','Anz. Personen','number'],['tableNo','Tisch','text'],['phone','Telefon','tel'],['email','E-Mail','email'],['comment','Bemerkungen','textarea']];
function rowHTML(r,day,locked=false,mailButton=()=>''){
 const d=r?guest(r):{},id=r?.id||crypto.randomUUID();
 return `<tr data-sheet-id="${e(id)}" data-sheet-day="${e(day)}" data-sheet-new="${!r}" class="${r?.arrived?'arrived-row':''} ${gondolaRowClass(r)} ${r?.status==='Storniert'?'sheet-cancelled':r?.status==='Warteliste'?'sheet-waitlist':''}">${cols.map(([key,label,type])=>{const value={time:r?.time,people:r?.people,tableNo:r?.table_no,comment:r?reservationRemarks(r):''}[key]??d[key]??'';const attrs=`name="${key}" aria-label="${label} · ${e(dayLabel(day))}" ${locked?'disabled':''}`;return `<td>${type==='textarea'?`<textarea ${attrs} rows="1" maxlength="4000">${e(value)}</textarea>`:`<input ${attrs} type="${type}" value="${e(value)}" ${type==='number'?`min="${r?0:1}" max="1000" step="1" required`:key==='tableNo'?'maxlength="100"':'maxlength="4000"'}>`}${key==='last'&&r?mailButton(r):''}</td>`;}).join('')}<td><select name="status" aria-label="Reservationsstatus" ${locked?'disabled':''}>${['Bestätigt','Offen','Rückfrage nötig','Warteliste','Storniert'].map(s=>`<option ${s===(r?.status||'Bestätigt')?'selected':''}>${s}</option>`).join('')}</select>${r?.arrived?'<small>✓ Angekommen</small>':''}</td><td class="sheet-save-cell"><button type="button" class="small" data-sheet-save ${locked?'disabled':''}>${r?'Speichern':'Eintragen'}</button>${r?`<button type="button" class="quiet small sheet-delete" data-sheet-delete aria-label="Reservation löschen" title="Reservation löschen" ${locked?'disabled':''}>🗑</button>`:''}<small class="sheet-feedback" role="status">${locked?'Versand zuerst abschliessen':''}</small><label class="sheet-override" hidden><input name="override" type="checkbox">Belegung geprüft / Ausnahme zulassen</label></td></tr>`;
}
export function markCurrentRequest(root,id){root.querySelectorAll('[data-sheet-id]').forEach(tr=>{const active=tr.dataset.sheetId===id;tr.classList.toggle('sheet-current-request',active);if(active)tr.setAttribute('aria-current','true');else tr.removeAttribute('aria-current');});}
export function renderExcelOverview(root,{rows,outbox=[],mailButton=()=>'',onOpenMail=()=>{},date,save,onSaved,onDate,notice,onSelectRow=()=>{},onReservationChanged=()=>{},onRequestEdit=()=>{},onDelete=()=>{}}){
 let selected=date,selectedRowId=null,currentRequestId=null,requestPreview=null,railObservers=[];const saveJobs=new WeakMap();
 const dirty=()=>!!root.querySelector('[data-dirty="true"],[data-saving="true"]');
 const draw=()=>{
  const days=weekDays(selected),scrolls=new Map([...root.querySelectorAll('[data-sheet-section]')].map(s=>[s.dataset.sheetSection,s.querySelector('.table-scroll')?.scrollLeft||0]));
  root.classList.remove('day-compact');
  root.innerHTML=`<section class="excel-overview"><div class="toolbar filters"><button type="button" class="secondary" data-sheet-week="-7" aria-label="Vorherige Woche">← Woche</button><label>Woche auswählen<input type="date" id="sheet-date" value="${e(selected)}" required></label><button type="button" class="secondary" data-sheet-week="7">Woche →</button><button type="button" class="secondary" id="sheet-print">Drucken</button></div><h2>Excel-Übersicht</h2><p class="muted">${dayLabel(days[0])} – ${dayLabel(days[6])}</p><p>Wie in eurer Excel-Liste: direkt in die Zeile schreiben. Tab oder Enter speichert automatisch; alternativ «Speichern» oder «Eintragen» wählen. Jeder Tag hat eine leere Zeile für neue Reservationen. Die Daten gehören zum gemeinsamen Reservationsbuch.</p><div class="sheet-days">${days.map(day=>`<section class="sheet-day" data-sheet-section="${e(day)}"><div class="sheet-day-heading"><h3>${e(dayLabel(day))}</h3><strong data-sheet-total="${day}"></strong></div><div class="sheet-horizontal-rail" tabindex="0" role="region" aria-label="Tagesliste ${e(dayLabel(day))} waagrecht verschieben"><div></div></div><div class="table-scroll"><table class="excel-table"><thead><tr>${cols.map(([,label])=>`<th>${label}</th>`).join('')}<th>Status</th><th>Speichern</th></tr></thead><tbody>${dayRowsHTML(day)}</tbody></table></div></section>`).join('')}</div></section>`;
  updateTotals();bindRows();paintRequestPreview();paintCurrentRequest();root.querySelectorAll('[data-sheet-section]').forEach(s=>{s.querySelector('.table-scroll').scrollLeft=scrolls.get(s.dataset.sheetSection)||0;});if(selectedRowId){[...root.querySelectorAll('[data-sheet-id]')].find(tr=>tr.dataset.sheetId===selectedRowId)?.classList.add('sheet-selected');}
  bindHorizontalRails();
  root.querySelectorAll('[data-sheet-week]').forEach(b=>b.onclick=()=>{if(dirty()&&!window.confirm('Ungespeicherte Änderungen verwerfen und die Woche wechseln?'))return;const d=new Date(selected+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(b.dataset.sheetWeek));selected=d.toISOString().slice(0,10);onDate(selected);draw();});
  root.querySelector('#sheet-date').onchange=ev=>{if(!ev.target.value)return;if(dirty()&&!window.confirm('Ungespeicherte Änderungen verwerfen und die Woche wechseln?')){ev.target.value=selected;return;}selected=ev.target.value;onDate(selected);draw();};
  root.querySelector('#sheet-print').onclick=()=>window.print();
 };
 function dayRowsHTML(day){
  const list=rows.filter(r=>r.date===day).sort((a,b)=>cancellationsLast(a,b)||(a.time||'99').localeCompare(b.time||'99')||String(guest(a).last||'').localeCompare(String(guest(b).last||''),'de'));
  const html=r=>rowHTML(r,day,outbox.some(o=>o.reservation_id===r.id&&o.state!=='sent'),mailButton);
  return list.filter(r=>!['Warteliste','Storniert'].includes(r.status)).map(html).join('')+rowHTML(null,day)+list.filter(r=>r.status==='Warteliste').map(html).join('')+list.filter(r=>r.status==='Storniert').map(html).join('');
 }
 function placeCancelledLast(body){
  const rank=tr=>tr.dataset.sheetNew==='true'?1:reservationRank(rows.find(r=>r.id===tr.dataset.sheetId)||{})*2;
  [...body.children].sort((a,b)=>rank(a)-rank(b)||(rank(a)===2?cancellationsLast(rows.find(r=>r.id===a.dataset.sheetId),rows.find(r=>r.id===b.dataset.sheetId)):0)).forEach((tr,i)=>{if(body.children[i]!==tr)body.insertBefore(tr,body.children[i]||null);});
 }
 function updateTotals(){root.querySelectorAll('[data-sheet-total]').forEach(el=>{const t=sheetTotals(rows,el.dataset.sheetTotal);const g=gondolaAvailability(rows,el.dataset.sheetTotal);el.textContent=`${t.reservations} Reservationen · ${t.people} Personen · ${g.free} freie ${g.free===1?'Gondel':'Gondeln'}`;el.title=`Freie Gondeln: Mittag ${g.midday} / Abend ${g.evening} (je 3 Gondeln)`;});}
 function rowContext(tr){const values=Object.fromEntries([...tr.querySelectorAll('[name]')].map(c=>[c.name,c.type==='checkbox'?c.checked:c.value]));return {rowId:tr.dataset.sheetId,day:tr.dataset.sheetDay,isNew:tr.dataset.sheetNew==='true',booking:rows.find(r=>r.id===tr.dataset.sheetId)||null,values};}
 function paintRequestPreview(){
  root.querySelectorAll('[data-sheet-preview]').forEach(el=>el.remove());
  if(!requestPreview)return;const d=requestPreview.draft||{},g=d.data||{},id='request-preview-'+requestPreview.id;
  const markup=`<tr data-sheet-preview="true" data-sheet-id="${e(id)}" class="sheet-request-preview">${cols.map(([key])=>`<td>${e(({time:d.time,people:d.people,tableNo:''}[key]??g[key])||'—')}</td>`).join('')}<td><strong>Anfrage</strong><small>Noch nicht übernommen</small></td><td><button type="button" class="small" data-preview-edit>Angaben prüfen</button></td></tr>`;
  const day=[...root.querySelectorAll('[data-sheet-section]')].find(s=>s.dataset.sheetSection===d.date);
  if(day)day.querySelector('tbody').insertAdjacentHTML('afterbegin',markup);
  else{const host=document.createElement('section');host.dataset.sheetPreview='true';host.className='sheet-day';host.innerHTML=`<div class="sheet-day-heading"><h3>Aktuelle Anfrage · ${e(d.date||'Datum noch offen')}</h3></div><div class="table-scroll"><table class="excel-table"><thead><tr>${cols.map(([,label])=>`<th>${label}</th>`).join('')}<th>Status</th><th>Aktion</th></tr></thead><tbody>${markup}</tbody></table></div>`;root.querySelector('.sheet-days').prepend(host);}
  root.querySelector('[data-preview-edit]').onclick=()=>onRequestEdit(requestPreview.id);
 }
 function paintCurrentRequest(){markCurrentRequest(root,currentRequestId);}
 function selectRow(tr){selectedRowId=tr.dataset.sheetId;root.querySelectorAll('.sheet-selected').forEach(r=>r.classList.remove('sheet-selected'));tr.classList.add('sheet-selected');onSelectRow(rowContext(tr));}
 function bindHorizontalRails(){
  railObservers.forEach(o=>o.disconnect());railObservers=[];
  root.querySelectorAll('[data-sheet-section]').forEach(day=>{
   const pane=day.querySelector('.table-scroll'),rail=day.querySelector('.sheet-horizontal-rail');if(!rail)return;
   const size=()=>{day.style.setProperty('--sheet-day-heading-height',(day.querySelector('.sheet-day-heading').offsetHeight||50)+'px');rail.firstElementChild.style.width=Math.max(pane.scrollWidth||0,pane.querySelector('table').scrollWidth||0,pane.clientWidth||0)+'px';rail.scrollLeft=pane.scrollLeft||0;};
   rail.onscroll=()=>{if(pane.scrollLeft!==rail.scrollLeft)pane.scrollLeft=rail.scrollLeft;};pane.onscroll=()=>{if(rail.scrollLeft!==pane.scrollLeft)rail.scrollLeft=pane.scrollLeft;};size();
   if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(size);observer.observe(day.querySelector('.sheet-day-heading'));observer.observe(pane);observer.observe(pane.querySelector('table'));railObservers.push(observer);}
  });
 }
 function valuesOf(tr){return {...rowContext(tr).values,date:tr.dataset.sheetDay};}
 function dirtyAgainst(tr,saved){const d=guest(saved),actual={...d,time:saved.time||'',people:String(saved.people),tableNo:saved.table_no||'',status:saved.status};return [...cols.map(([key])=>key),'status'].some(key=>String(tr.querySelector(`[name="${key}"]`).value||'').trim()!==String(actual[key]||'').trim());}
 async function saveRow(tr,automatic=false){
  let job=saveJobs.get(tr);if(job?.running){job.again=true;return job.promise;}
  if(automatic&&tr.dataset.dirty!=='true')return;
  job={running:true,again:false};saveJobs.set(tr,job);
  job.promise=(async()=>{
   do{
    job.again=false;if(automatic&&tr.dataset.dirty!=='true')break;
    const feedback=tr.querySelector('.sheet-feedback'),button=tr.querySelector('[data-sheet-save]'),r=tr.dataset.sheetNew==='false'?rows.find(r=>r.id===tr.dataset.sheetId):null,values=valuesOf(tr);
    try{
     const payload=sheetPayload(r,values,tr.dataset.sheetId);
     const invalid=[...tr.querySelectorAll('input,textarea,select')].find(c=>typeof c.checkValidity==='function'&&!c.checkValidity());
     if(invalid){if(!automatic)invalid.reportValidity();feedback.textContent='Bitte die Eingaben prüfen.';break;}
     button.disabled=true;tr.dataset.saving='true';feedback.textContent='Wird gespeichert …';
     await save(payload);const saved=await onSaved(payload,tr.dataset.sheetId);if(!saved)throw Error('Gespeichert. Bitte die Übersicht über «Aktualisieren» neu laden.');
     const i=rows.findIndex(x=>x.id===saved.id);if(i>=0)rows[i]=saved;else rows.push(saved);
     const data=guest(saved),stored={...data,time:saved.time||'',people:String(saved.people),tableNo:saved.table_no||'',status:saved.status};
     for(const key of [...cols.map(([key])=>key),'status']){const input=tr.querySelector(`[name="${key}"]`);if(String(input.value||'')===String(values[key]||''))input.value=stored[key]??'';}
     tr.classList.toggle('gondola-reservation',!!gondolaRowClass(saved));tr.dataset.sheetId=saved.id;tr.dataset.sheetNew='false';tr.classList.toggle('sheet-cancelled',saved.status==='Storniert');tr.classList.toggle('sheet-waitlist',saved.status==='Warteliste');button.textContent='Speichern';
     if(!r){button.insertAdjacentHTML('afterend','<button type="button" class="quiet small sheet-delete" data-sheet-delete aria-label="Reservation löschen" title="Reservation löschen">🗑</button>');tr.parentElement.insertAdjacentHTML('beforeend',rowHTML(null,saved.date));bindRows();}
     if(dirtyAgainst(tr,saved)){tr.dataset.dirty='true';feedback.textContent='Weitere Änderungen noch nicht gespeichert';}else{delete tr.dataset.dirty;feedback.textContent='Gespeichert';tr.querySelector('.sheet-override').hidden=true;feedback.setAttribute('role','status');}
     const focused=root.contains(document.activeElement)?document.activeElement:null;placeCancelledLast(tr.parentElement);if(focused&&document.activeElement!==focused)focused.focus?.({preventScroll:true});
     paintTableCapacity(tr);updateTotals();paintCurrentRequest();onSelectRow(rowContext(tr));onReservationChanged(saved);if(!automatic)notice('Reservation gespeichert.');
    }catch(err){feedback.textContent=err.message;feedback.setAttribute('role','alert');if(r||!automatic||tr.dataset.saving==='true')tr.querySelector('.sheet-override').hidden=false;job.again=false;break;}
    finally{button.disabled=false;delete tr.dataset.saving;}
   }while(job.again);
  })().finally(()=>{job.running=false;});return job.promise;
 }
 function paintTableCapacity(tr){const input=tr.querySelector('[name=tableNo]'),people=tr.querySelector('[name=people]');if(!input||!people)return;let hint=tr.querySelector('.sheet-table-capacity');if(!hint){hint=document.createElement('small');hint.className='sheet-table-capacity';input.parentElement.append(hint);}hint.textContent=tableGroupWarning(input.value,people.value);}
 function bindRows(){root.querySelectorAll('tr[data-sheet-id]:not([data-sheet-preview])').forEach(tr=>{
  tr.querySelectorAll('[data-reservation-mail]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();onOpenMail(b.dataset.reservationMail);});paintTableCapacity(tr);tr.onclick=()=>selectRow(tr);tr.onfocusin=()=>selectRow(tr);
  tr.oninput=()=>{paintTableCapacity(tr);tr.dataset.dirty='true';tr.querySelector('.sheet-feedback').textContent='Noch nicht gespeichert';selectRow(tr);};
  tr.onkeydown=ev=>{if(!ev.target?.matches('input,textarea,select')||ev.target.disabled||ev.isComposing)return;if(ev.key==='Tab'||ev.key==='Enter'&&!ev.shiftKey){if(ev.key==='Enter')ev.preventDefault();void saveRow(tr,true);}};
  tr.querySelector('[data-sheet-save]').onclick=()=>saveRow(tr,false);const trash=tr.querySelector('[data-sheet-delete]');if(trash)trash.onclick=ev=>{ev.stopPropagation();const booking=rows.find(r=>r.id===tr.dataset.sheetId);if(booking)onDelete(booking.id);};
 });}

 const beforeUnload=ev=>{if(dirty()){ev.preventDefault();ev.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
 draw();
 return {canLeave:()=>!dirty()||window.confirm('Ungespeicherte Änderungen in der Excel-Übersicht verwerfen?'),isDirty:dirty,
  replaceData(nextRows,nextOutbox=outbox){if(dirty()||root.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select'))return false;rows=nextRows;outbox=nextOutbox;draw();return true;},
  navigate(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;if(weekDays(day)[0]!==weekDays(selected)[0]){if(dirty())return false;selected=day;draw();}else{selected=day;root.querySelector('#sheet-date').value=day;}return true;},
  showRequestPreview(mail){requestPreview=mail;paintRequestPreview();paintCurrentRequest();},
  setCurrentRequest(id,{scroll=false}={}){currentRequestId=id||null;const r=rows.find(r=>r.id===id)||(requestPreview&&id==='request-preview-'+requestPreview.id?{date:requestPreview.draft?.date}:null);if(r?.date&&scroll)this.navigate(r.date);paintCurrentRequest();const tr=[...root.querySelectorAll('[data-sheet-id]')].find(tr=>tr.dataset.sheetId===id);if(tr&&scroll)tr.scrollIntoView({block:'center',behavior:'smooth'});return !!tr;},
  focusReservation(id){const r=rows.find(r=>r.id===id);if(!r||!this.navigate(r.date))return false;const tr=[...root.querySelectorAll('[data-sheet-id]')].find(tr=>tr.dataset.sheetId===id);if(tr){selectRow(tr);tr.scrollIntoView({block:'center',behavior:'smooth'});return true;}return false;},
  applyTable(id,value,saved=null){const tr=[...root.querySelectorAll('[data-sheet-id]')].find(tr=>tr.dataset.sheetId===id);if(saved){const i=rows.findIndex(r=>r.id===id);if(i>=0)rows[i]=saved;}if(tr){if(saved)tr.classList.toggle('gondola-reservation',!!gondolaRowClass(saved));tr.querySelector('[name=tableNo]').value=value;if(!saved){tr.dataset.dirty='true';tr.querySelector('.sheet-feedback').textContent='Tischwahl noch nicht gespeichert';}paintTableCapacity(tr);selectRow(tr);}updateTotals();},
  dispose:()=>{railObservers.forEach(o=>o.disconnect());window.removeEventListener('beforeunload',beforeUnload);}};
}
