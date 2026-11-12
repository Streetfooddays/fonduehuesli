import {guest,escapeHTML as e} from './core.mjs';
import {tableAssignments} from './floor-plan.mjs';
export function weekDays(value){
 const start=new Date(value+'T12:00:00Z');if(!Number.isFinite(start.getTime()))throw Error('Ungültiges Datum.');
 start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
 return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);});
}
export function sheetTotals(rows,day){const active=rows.filter(r=>r.date===day&&r.status!=='Storniert');return {reservations:active.length,people:active.reduce((n,r)=>n+Number(r.people||0),0)};}
export function sheetPayload(r,values,createId){
 const data={...(r?guest(r):{})};for(const k of ['last','first','phone','email','comment'])data[k]=String(values[k]||'').trim();
 if(!data.last&&!data.first)throw Error('Bitte Nachname oder Vorname eintragen.');
 const people=Number(values.people);if(!/^\d+$/.test(String(values.people))||!Number.isSafeInteger(people)||people<(r?0:1)||people>1000)throw Error('Bitte eine gültige Personenzahl eintragen.');
 return {id:r?.id,createId,revision:r?.revision,date:values.date,time:values.time||'',people,tableNo:values.tableNo||'',status:values.status||r?.status||'Bestätigt',note:r?.note||'',gondola:tableAssignments(values.tableNo).tables.some(n=>/^G[123]$/.test(n))||!!r?.gondola,override:!!values.override,data};
}
const dayLabel=value=>new Intl.DateTimeFormat('de-CH',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Zurich'}).format(new Date(value+'T12:00:00Z'));
const cols=[['last','Nachname','text'],['first','Vorname','text'],['time','Zeit','time'],['people','Anz. Personen','number'],['tableNo','Tisch','text'],['phone','Telefon','tel'],['email','E-Mail','email'],['comment','Bemerkungen','textarea']];
function rowHTML(r,day,locked=false){
 const d=r?guest(r):{},id=r?.id||crypto.randomUUID();
 return `<tr data-sheet-id="${e(id)}" data-sheet-day="${e(day)}" data-sheet-new="${!r}" class="${r?.arrived?'arrived-row':''} ${r?.status==='Storniert'?'sheet-cancelled':''}">${cols.map(([key,label,type])=>{const value={time:r?.time,people:r?.people,tableNo:r?.table_no}[key]??d[key]??'';const attrs=`name="${key}" aria-label="${label} · ${e(dayLabel(day))}" ${locked?'disabled':''}`;return `<td>${type==='textarea'?`<textarea ${attrs} rows="1" maxlength="4000">${e(value)}</textarea>`:`<input ${attrs} type="${type}" value="${e(value)}" ${type==='number'?`min="${r?0:1}" max="1000" step="1" required`:key==='tableNo'?'maxlength="100"':'maxlength="4000"'}>`}</td>`;}).join('')}<td><select name="status" aria-label="Reservationsstatus" ${locked?'disabled':''}>${['Bestätigt','Offen','Rückfrage nötig','Storniert'].map(s=>`<option ${s===(r?.status||'Bestätigt')?'selected':''}>${s}</option>`).join('')}</select>${r?.arrived?'<small>✓ Angekommen</small>':''}</td><td class="sheet-save-cell"><button type="button" class="small" data-sheet-save ${locked?'disabled':''}>${r?'Speichern':'Eintragen'}</button><small class="sheet-feedback" role="status">${locked?'Versand zuerst abschliessen':''}</small><label class="sheet-override" hidden><input name="override" type="checkbox">Belegung geprüft / Ausnahme zulassen</label></td></tr>`;
}
export function renderExcelOverview(root,{rows,outbox=[],date,save,onSaved,onDate,notice}){
 let selected=date;
 const dirty=()=>!!root.querySelector('[data-dirty="true"]');
 const draw=()=>{
  const days=weekDays(selected);
  root.classList.remove('day-compact');
  root.innerHTML=`<section class="excel-overview"><div class="toolbar filters"><button type="button" class="secondary" data-sheet-week="-7" aria-label="Vorherige Woche">← Woche</button><label>Woche auswählen<input type="date" id="sheet-date" value="${e(selected)}" required></label><button type="button" class="secondary" data-sheet-week="7">Woche →</button><button type="button" class="secondary" id="sheet-print">Drucken</button></div><h2>Excel-Übersicht</h2><p class="muted">${dayLabel(days[0])} – ${dayLabel(days[6])}</p><p>Wie in eurer Excel-Liste: direkt in die Zeile schreiben und «Speichern» oder «Eintragen» wählen. Jeder Tag hat eine leere Zeile für neue Reservationen. Die Daten gehören zum gemeinsamen Reservationsbuch.</p><div class="sheet-days">${days.map(day=>`<section class="sheet-day" data-sheet-section="${e(day)}"><div class="sheet-day-heading"><h3>${e(dayLabel(day))}</h3><strong data-sheet-total="${day}"></strong></div><div class="table-scroll"><table class="excel-table"><thead><tr>${cols.map(([,label])=>`<th>${label}</th>`).join('')}<th>Status</th><th>Speichern</th></tr></thead><tbody>${rows.filter(r=>r.date===day).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99')||String(guest(a).last||'').localeCompare(String(guest(b).last||''),'de')).map(r=>rowHTML(r,day,outbox.some(o=>o.reservation_id===r.id&&o.state!=='sent'))).join('')}${rowHTML(null,day)}</tbody></table></div></section>`).join('')}</div></section>`;
  updateTotals();bindRows();
  root.querySelectorAll('[data-sheet-week]').forEach(b=>b.onclick=()=>{if(dirty()&&!window.confirm('Ungespeicherte Änderungen verwerfen und die Woche wechseln?'))return;const d=new Date(selected+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(b.dataset.sheetWeek));selected=d.toISOString().slice(0,10);onDate(selected);draw();});
  root.querySelector('#sheet-date').onchange=ev=>{if(!ev.target.value)return;if(dirty()&&!window.confirm('Ungespeicherte Änderungen verwerfen und die Woche wechseln?')){ev.target.value=selected;return;}selected=ev.target.value;onDate(selected);draw();};
  root.querySelector('#sheet-print').onclick=()=>window.print();
 };
 function updateTotals(){root.querySelectorAll('[data-sheet-total]').forEach(el=>{const t=sheetTotals(rows,el.dataset.sheetTotal);el.textContent=`${t.reservations} Reservationen · ${t.people} Personen`;});}
 function bindRows(){root.querySelectorAll('tr[data-sheet-id]').forEach(tr=>{
  tr.oninput=()=>{tr.dataset.dirty='true';tr.querySelector('.sheet-feedback').textContent='Noch nicht gespeichert';};
  const button=tr.querySelector('[data-sheet-save]');button.onclick=async()=>{
   const feedback=tr.querySelector('.sheet-feedback');
   if([...tr.querySelectorAll('input,textarea,select')].some(c=>!c.reportValidity()))return;
   const r=tr.dataset.sheetNew==='false'?rows.find(r=>r.id===tr.dataset.sheetId):null;
   const values=Object.fromEntries([...tr.querySelectorAll('[name]')].map(c=>[c.name,c.type==='checkbox'?c.checked:c.value]));values.date=tr.dataset.sheetDay;
   try{
    const payload=sheetPayload(r,values,tr.dataset.sheetId);button.disabled=true;feedback.textContent='Wird gespeichert …';
    tr.querySelectorAll('input,textarea,select').forEach(c=>c.disabled=true);
    await save(payload);
    const saved=await onSaved(payload,tr.dataset.sheetId);
    if(!saved)throw Error('Gespeichert. Bitte die Übersicht über «Aktualisieren» neu laden.');
    const rowIndex=rows.findIndex(x=>x.id===saved.id);if(rowIndex>=0)rows[rowIndex]=saved;else rows.push(saved);
    const holder=document.createElement('tbody');holder.innerHTML=rowHTML(saved,values.date);const replacement=holder.firstElementChild;tr.replaceWith(replacement);
    if(!r){const body=replacement.parentElement;body.insertAdjacentHTML('beforeend',rowHTML(null,values.date));}
    updateTotals();bindRows();replacement.querySelector('.sheet-feedback').textContent='Gespeichert';notice('Reservation gespeichert.');
   }catch(err){feedback.textContent=err.message;feedback.setAttribute('role','alert');tr.querySelector('.sheet-override').hidden=false;}
   finally{button.disabled=false;tr.querySelectorAll('input,textarea,select').forEach(c=>c.disabled=false);}
  };
 });}
 const beforeUnload=ev=>{if(dirty()){ev.preventDefault();ev.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
 draw();
 return {canLeave:()=>!dirty()||window.confirm('Ungespeicherte Änderungen in der Excel-Übersicht verwerfen?'),dispose:()=>window.removeEventListener('beforeunload',beforeUnload)};
}
