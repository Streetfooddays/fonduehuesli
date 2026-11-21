import {escapeHTML as e} from './core.mjs';
export const CALENDAR_FROM='2026-11-11',CALENDAR_TO='2027-02-06';
export const CALENDAR_COLORS={green:'Grün – verfügbar',orange:'Orange – gut belegt',red:'Rot – ausgebucht'};
export function calendarPeople(rows,date){return rows.filter(r=>r.date===date&&!r.deleted_at&&['Offen','Rückfrage nötig','Bestätigt'].includes(r.status)).reduce((n,r)=>n+Math.max(0,Number(r.people)||0),0);}
export function calendarColor(people,override='auto'){return Object.hasOwn(CALENDAR_COLORS,override)?override:people<=100?'green':'orange';}
export function beforeSwissNoon(date,now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 const today=`${p.year}-${p.month}-${p.day}`;return date>today||date===today&&Number(p.hour)<12;
}
export async function renderCalendarAdmin(root,{rpc,req,rows,onDate,notice,selected=''}){
 root.innerHTML='<p role="status">Online-Kalender wird geladen …</p>';
 let settings,availability;
 try{[settings,availability]=await Promise.all([req('/rest/v1/reservation_calendar_settings?select=date,status,opening,revision&order=date.asc'),rpc('reservation_calendar',{p_from:CALENDAR_FROM,p_to:CALENDAR_TO})]);}
 catch(err){root.innerHTML=`<p class="error-text">${e(err.message)}</p><button type="button" data-calendar-retry>Erneut laden</button>`;root.querySelector('button').onclick=()=>renderCalendarAdmin(root,{rpc,req,rows,onDate,notice,selected});return;}
 if(!root.isConnected)return;
 const options=(values,value)=>values.map(([v,label])=>`<option value="${v}" ${v===value?'selected':''}>${label}</option>`).join('');
 root.innerHTML=`<section class="calendar-admin"><h2>Online-Kalender · Verfügbarkeit</h2><p>Automatisch: bis 100 Personen grün, ab 101 Personen orange. Rot (ausgebucht) nur nach manueller Markierung. Es zählen offene, zu prüfende und bestätigte Gäste pro Tag; ohne Warteliste, Stornierungen und gelöschte Einträge. Diese Einstellung gilt gemeinsam für die Datumsauswahl auf der Website.</p><p>Alle Farben können pro Tag manuell gesetzt werden. «Automatisch» folgt wieder der Gästezahl. Öffnungstage lassen sich ebenfalls einzeln anpassen. Geschlossene und rote Tage sind online gesperrt. Heute bleibt bis 12.00 Uhr Schweizer Zeit buchbar. Intern könnt ihr weiterhin Reservationen erfassen.</p><label>Zu Datum springen<input type="date" min="${CALENDAR_FROM}" max="${CALENDAR_TO}" value="${e(selected)}" data-calendar-jump></label><div class="table-scroll"><table><thead><tr><th>Datum</th><th>Personen</th><th>Anzeige</th><th>Farbe</th><th>Öffnung</th><th>Speicherstatus</th></tr></thead><tbody>${availability.map(a=>{const s=settings.find(x=>x.date===a.date)||{status:'auto',opening:'auto',revision:0};return `<tr data-calendar-day="${a.date}"><td><button type="button" class="quiet" data-calendar-open="${a.date}">${new Intl.DateTimeFormat('de-CH',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(a.date+'T12:00:00Z'))}</button></td><td>${calendarPeople(rows,a.date)}</td><td data-calendar-badge><span class="calendar-badge calendar-${a.is_open?a.status:'closed'}">${a.is_open?CALENDAR_COLORS[a.status]:'Geschlossen'}</span></td><td><select data-calendar-field="status" aria-label="Farbe ${a.date}">${options([['auto','Automatisch'],...Object.entries(CALENDAR_COLORS)],s.status)}</select></td><td><select data-calendar-field="opening" aria-label="Öffnung ${a.date}">${options([['auto','Nach Öffnungszeiten'],['open','Geöffnet'],['closed','Geschlossen']],s.opening)}</select></td><td role="status" data-calendar-feedback>Gespeichert</td></tr>`;}).join('')}</tbody></table></div></section>`;
 const jump=value=>root.querySelector(`[data-calendar-day="${value}"]`)?.scrollIntoView({block:'center'});
 root.querySelector('[data-calendar-jump]').onchange=ev=>jump(ev.target.value);
 root.querySelectorAll('[data-calendar-open]').forEach(b=>b.onclick=()=>onDate(b.dataset.calendarOpen));
 root.querySelectorAll('[data-calendar-field]').forEach(input=>input.onchange=async()=>{
  const tr=input.closest('tr'),day=tr.dataset.calendarDay,old=settings.find(s=>s.date===day)||{date:day,status:'auto',opening:'auto',revision:0};
  const controls=[...tr.querySelectorAll('select')],feedback=tr.querySelector('[data-calendar-feedback]');
  const p={date:day,status:controls[0].value,opening:controls[1].value,revision:old.revision};controls.forEach(x=>x.disabled=true);feedback.textContent='Wird gespeichert …';
  let committed=false;try{const saved=await rpc('save_calendar_setting',{p});settings=settings.filter(s=>s.date!==day);settings.push(saved);committed=true;feedback.textContent='Gespeichert';const current=await rpc('reservation_calendar',{p_from:day,p_to:day});const a=current[0];tr.querySelector('[data-calendar-badge]').innerHTML=`<span class="calendar-badge calendar-${a.is_open?a.status:'closed'}">${a.is_open?CALENDAR_COLORS[a.status]:'Geschlossen'}</span>`;}
  catch(err){if(!committed){controls[0].value=old.status;controls[1].value=old.opening;}feedback.textContent=committed?'Gespeichert · Anzeige aktualisieren':'Bitte aktualisieren';notice(err.message);}
  finally{controls.forEach(x=>x.disabled=false);}
 });
 if(selected)jump(selected);
}
