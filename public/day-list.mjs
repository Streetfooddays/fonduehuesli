import {escapeHTML as e,guest} from './core.mjs';

export function reservationRemarks(r){
 const clean=value=>String(value||'').replace(/<?https?:\/\/click\.promote\.weebly\.com\/wf\/open[^\s\]<>]*>?/gi,'').replace(/\[\s*\]/g,'').trim();
 const note=clean(String(r.note||'').split(' · ').filter(part=>!/^Import aus aktueller Excel-Liste; bisher manuell bestätigt\.$/.test(part)&&!/^Excel-Abgleich \d{2}\.\d{2}\.\d{4}:/.test(part)&&!/^Maileingang:/.test(part)).join(' · '));
 const comment=clean(guest(r).comment);
 return !note?comment:!comment||note.includes(comment)?note:comment.includes(note)?comment:[note,comment].join('\n');
}
export function inlineTimeField(r,locked=false){
 const d=guest(r),name=[d.last,d.first].filter(Boolean).join(' ')||'Reservation';
 return `<input class="time-inline no-print" type="time" step="60" data-time-inline="${e(r.id)}" aria-label="Zeit für ${e(name)} am ${e(r.date)}" value="${e(r.time||'')}" ${locked?'disabled':''}><small class="time-inline-feedback no-print" role="status"></small><span class="time-inline-print">${e(r.time||'offen')}</span>`;
}
export function compactDayTable(list,{arrival,people,table,origin,locked,canDelete=()=>true}){
 return `<div class="toolbar day-entry-toolbar no-print"><button type="button" id="day-add-reservation" aria-label="Gäste ohne Reservation für diesen Tag eintragen">+ Gäste ohne Reservation</button></div><div class="sheet compact-day-sheet"><div class="table-scroll"><table class="compact-day-table"><colgroup><col class="col-arrival"><col class="col-last"><col class="col-first"><col class="col-people"><col class="col-time"><col class="col-table"><col class="col-phone"><col class="col-remarks"><col class="col-actions"></colgroup><thead><tr><th aria-label="Angekommen" title="Gast angekommen">✓</th><th>Nachname</th><th>Vorname</th><th>Pers.</th><th>Zeit</th><th>Tisch</th><th>Telefon</th><th>Bemerkungen</th><th class="no-print" aria-label="Aktionen"></th></tr></thead><tbody>${list.map(r=>{
  const d=guest(r);return `<tr class="${r.arrived?'arrived-row':''} ${r.status==='Storniert'?'compact-cancelled':''}" data-reservation-id="${e(r.id)}" data-floor-preview-day="${e(r.date)}" data-floor-preview-scope="${e(r.period||'all')}" data-floor-preview-table="${e(r.table_no||'')}"><td class="arrival-cell"><div class="reservation-name-line">${arrival(r)}</div></td><td><span class="compact-name">${e(d.last||d.company||'—')}${origin(r)}</span>${r.status!=='Bestätigt'?`<small class="compact-state">${e(r.status)}</small>`:''}</td><td>${e(d.first||'')}</td><td>${people(r,locked(r))}</td><td>${inlineTimeField(r,locked(r))}</td><td>${table(r)}</td><td class="compact-phone">${e(d.phone||'')}</td><td class="compact-remarks">${e(reservationRemarks(r))}</td><td class="compact-actions no-print"><button class="quiet small" data-open-floor="${e(r.date)}" data-open-floor-scope="${e(r.period||'all')}" data-open-floor-table="${e(r.table_no||'')}" title="Tischplan anzeigen" aria-label="Tischplan für ${e([d.last,d.first].filter(Boolean).join(' '))}">▦</button><button class="quiet small" data-edit="${e(r.id)}" title="Reservation bearbeiten" aria-label="Reservation bearbeiten">✎</button><button type="button" class="quiet small day-delete" data-delete-day="${e(r.id)}" title="Reservation löschen" aria-label="Reservation löschen" ${canDelete(r)?'':'disabled'}>🗑</button></td></tr>`;
 }).join('')||'<tr><td colspan="9" class="empty">Keine Reservationen für diesen Tag.</td></tr>'}</tbody></table></div></div>`;
}
export function bindInlineTimes(root,{find,save,saved}){
 root.querySelectorAll('[data-time-inline]').forEach(input=>{
  let previous=input.value,busy=false;const cell=input.closest('td'),feedback=cell.querySelector('.time-inline-feedback');
  input.oninput=()=>{input.removeAttribute('aria-invalid');feedback.textContent=input.value===previous?'':'Noch nicht gespeichert';};
  input.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();input.blur();}else if(ev.key==='Escape'){ev.preventDefault();input.value=previous;feedback.textContent='';input.removeAttribute('aria-invalid');input.blur();}};
  input.onblur=async()=>{
   const value=input.value;if(busy||value===previous)return;
   if(input.validity?.badInput||(value!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))){input.setAttribute('aria-invalid','true');feedback.textContent='Uhrzeit prüfen.';return;}
   const booking=find(input.dataset.timeInline);if(!booking)return;
   busy=true;input.readOnly=true;input.setAttribute('aria-busy','true');feedback.textContent='Wird gespeichert …';
   try{
    const result=await save({id:booking.id,revision:booking.revision,time:value});Object.assign(booking,result);previous=result.time;input.value=previous;
    cell.querySelector('.time-inline-print').textContent=previous||'offen';feedback.textContent='Gespeichert';input.removeAttribute('aria-invalid');saved(booking,input);
   }catch(err){feedback.textContent=err.message;input.setAttribute('aria-invalid','true');}
   finally{busy=false;input.readOnly=false;input.removeAttribute('aria-busy');}
  };
 });
}
