import {TABLES,WALLS} from './floor-layout.mjs';
import {guest,period,escapeHTML as e} from './core.mjs';
export const TABLE_NUMBERS=[...new Set(TABLES.map(t=>t.number))];
const known=new Set(TABLE_NUMBERS);
export const DUPLICATE_NUMBERS=TABLE_NUMBERS.filter(n=>TABLES.filter(t=>t.number===n).length>1);
export function tableAssignments(value=''){
 const raw=String(value).trim().toUpperCase();if(!raw)return {tables:[],unclear:false,unknown:[]};
 let text=raw.replace(/\bTISCHE?\b|\bTISCHNR\.?\b/g,'').trim();
 let unclear=/[()?]|\bODER\b/.test(text);
 text=text.replace(/\bUND\b/g,',').replace(/(\d+)\s*[-–]\s*(\d+)/g,(s,a,b)=>{a=Number(a);b=Number(b);if(b<a||b-a>25){unclear=true;return s;}return Array.from({length:b-a+1},(_,i)=>String(a+i)).join(',');});
 if(/[A-ZÄÖÜ]/.test(text.replace(/T\s*\d+/g,'').replace(/\bODER\b/g,'')))return {tables:[],unclear:true,unknown:[raw]};
 if(/[^T\d\s,;/+&]/.test(text))unclear=true;
 const tokens=text.match(/T\s*\d+|\d+/g)||[];
 const tables=[...new Set(tokens.map(t=>t.replace(/\s/g,'')).filter(t=>known.has(t)))];
 const unknown=[...new Set(tokens.filter(t=>!known.has(t.replace(/\s/g,''))))];
 if(!tokens.length)unknown.push(raw);
 if(unknown.length)unclear=true;
 return {tables,unclear,unknown};
}
export function floorOccupancy(rows,day,scope='all'){
 const active=rows.filter(r=>r.date===day&&['Bestätigt','Offen','Rückfrage nötig'].includes(r.status)&&(scope==='all'||(r.period||period(r.time))===scope||(r.period||period(r.time))==='ungeklaert'));
 const occupancy=Object.fromEntries(TABLE_NUMBERS.map(n=>[n,{number:n,state:'free',bookings:[],times:[]}]));
 const unassigned=[],unclear=[];
 for(const r of active){
  const a=tableAssignments(r.table_no);if(a.tables.some(n=>DUPLICATE_NUMBERS.includes(n)))a.unclear=true;
  if(!a.tables.length)unassigned.push(r);
  if(a.unclear)unclear.push(r);
  for(const n of a.tables){const cell=occupancy[n];cell.bookings.push({...r,assignmentUnclear:a.unclear});}
 }
 for(const cell of Object.values(occupancy)){
  if(cell.bookings.length)cell.state=cell.bookings.some(r=>r.status==='Bestätigt'&&!r.assignmentUnclear)?'confirmed':'pending';
  cell.times=[...new Set(cell.bookings.map(r=>r.time||'Zeit offen'))].sort((a,b)=>(a==='Zeit offen'?'99':a).localeCompare(b==='Zeit offen'?'99':b));
 }
 return {occupancy,active,unassigned,unclear};
}
const stateLabels={free:'Frei laut Tischzuordnung',pending:'Vorläufig / Rückfrage oder Zuordnung unklar',confirmed:'Definitiv bestätigt'};
export function floorPlan(rows,day,scope='all'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return '<p class="hint">Datum ergänzen, um den passenden Tischplan zu sehen.</p>';
 const model=floorOccupancy(rows,day,scope),scopeText=scope==='mittag'?'Mittag':scope==='abend'?'Abend':'Ganzer Tag';
 const dateText=new Intl.DateTimeFormat('de-CH',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Zurich'}).format(new Date(day+'T12:00:00Z'));
 return `<section class="floor-plan" data-floor-day="${e(day)}" data-floor-scope="${e(scope)}"><div class="floor-plan-heading"><h3>Tischplan · ${e(dateText)}</h3><span class="badge">${scopeText}</span></div>${DUPLICATE_NUMBERS.length?`<p class="floor-duplicate-note">Im gelieferten Plan stehen ${DUPLICATE_NUMBERS.map(e).join(' und ')} jeweils zweimal. Bei Zuordnung bleiben beide Flächen orange, bis die Nummer geklärt ist.</p>`:''}<div class="floor-legend"><span class="floor-free">Grün · frei laut Zuordnung</span><span class="floor-pending">Orange · vorläufig / unklar</span><span class="floor-confirmed">Rot · bestätigt</span></div>${model.unassigned.length||model.unclear.length?`<p class="hint floor-warning"><strong>${model.unassigned.length} Reservationen ohne zuordenbaren Tisch${model.unclear.length?' · '+model.unclear.length+' unklare Zuordnungen':''}.</strong> Diese Gäste bei der Tischverteilung zusätzlich berücksichtigen. Grün bedeutet: noch keine zugeordnete Reservation.</p>`:''}<div class="floor-canvas"><svg viewBox="35 145 1440 1245" role="group" aria-label="Tischbelegung ${e(dateText)}, ${scopeText}"><rect class="floor-background" x="35" y="145" width="1440" height="1245"/>${WALLS.map(w=>`<rect class="floor-wall" x="${w.x}" y="${w.y}" width="${w.width}" height="${w.height}"/>`).join('')}${TABLES.map(t=>{
 const c=model.occupancy[t.number],cx=t.x+t.width/2,cy=t.y+t.height/2,occupied=c.bookings.length>0,time=c.times[0]||'',extra=c.times.length>1?' +':'';
 return `<g class="floor-table ${c.state}" role="button" tabindex="0" data-floor-table="${e(t.number)}" aria-label="Tisch ${e(t.number)}: ${stateLabels[c.state]}${occupied?', '+e(c.times.join(', ')):''}"><title>Tisch ${e(t.number)} · ${stateLabels[c.state]}${occupied?' · '+e(c.times.join(', '))+' · '+c.bookings.length+' Reservation(en)':''}</title><rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" rx="2"/><text class="floor-number" x="${cx}" y="${occupied?cy-5:cy+7}" text-anchor="middle">${e(t.number)}${DUPLICATE_NUMBERS.includes(t.number)?'?':''}</text>${occupied?`<text class="floor-time" x="${cx}" y="${cy+14}" text-anchor="middle">${e(time==='Zeit offen'?'Zeit ?':time)}${extra}</text>`:''}</g>`;
 }).join('')}</svg></div><div class="floor-occupied-chips">${Object.values(model.occupancy).filter(c=>c.bookings.length).map(c=>`<button class="floor-chip ${c.state}" data-floor-table="${e(c.number)}">Tisch ${e(c.number)} · ${e(c.times.join(' / '))}</button>`).join('')}</div><p class="floor-caption">Uhrzeiten sind Ankunftszeiten. «+» = mehrere Zeiten (Tisch anklicken). Keine automatische Freigabe ohne Abreisezeit. ${DUPLICATE_NUMBERS.length?'Doppelte Nummern im PDF sind mit «?» gekennzeichnet.':''}</p><div class="floor-selection" aria-live="polite"><p class="muted">Tisch anklicken für Reservationen und alle Uhrzeiten.</p></div>${model.unassigned.length||model.unclear.length?`<details class="floor-unassigned"><summary>Zuordnungen prüfen (${new Set([...model.unassigned,...model.unclear].map(r=>r.id)).size})</summary><ul>${[...new Map([...model.unassigned,...model.unclear].map(r=>[r.id,r])).values()].map(r=>{const d=guest(r);return `<li>${e([d.last,d.first].filter(Boolean).join(' ')||'Ohne Namen')} · ${e(r.time||'Zeit offen')} · ${r.people} Personen · Tisch: ${e(r.table_no||'nicht eingetragen')}</li>`;}).join('')}</ul></details>`:''}</section>`;
}
export function bindFloorPlans(root,rows){
 root.querySelectorAll('[data-floor-table]').forEach(button=>{
  const activate=()=>{const plan=button.closest('.floor-plan'),day=plan.dataset.floorDay,scope=plan.dataset.floorScope,cell=floorOccupancy(rows,day,scope).occupancy[button.dataset.floorTable];
   plan.querySelector('.floor-selection').innerHTML=`<strong>Tisch ${e(cell.number)} · ${stateLabels[cell.state]}</strong>${cell.bookings.length?`<ul>${cell.bookings.map(r=>{const d=guest(r);return `<li>${e(r.time||'Zeit offen')} · ${r.people} Personen · ${e([d.last,d.first].filter(Boolean).join(' '))} · ${e(r.status)}${r.assignmentUnclear?' · Zuordnung prüfen':''}</li>`;}).join('')}</ul>`:'<p>Für diese Auswahl ist keine Reservation zugeordnet.</p>'}`;
  };button.onclick=activate;button.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();activate();}};
 });
}
