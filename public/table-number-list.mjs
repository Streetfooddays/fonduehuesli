import {TABLE_NUMBERS,tableAssignments} from './floor-plan.mjs';
import {escapeHTML as e} from './core.mjs';
const compare=new Intl.Collator('de-CH',{numeric:true,sensitivity:'base'}).compare;
export function tableNumberSummary(rows,day){
 const active=rows.filter(r=>r.date===day&&!r.deleted_at&&Number(r.people)>0&&['Bestätigt','Offen','Rückfrage nötig'].includes(r.status));
 const tables=new Map(TABLE_NUMBERS.map(number=>[number,{number,people:0,shared:[],times:new Set(),bookings:0}]));
 const unassigned=[];
 for(const r of active){
  const a=tableAssignments(r.table_no),numbers=[...new Set([...a.tables,...a.unknown.map(n=>String(n).replace(/\s/g,'')).filter(n=>/^(?:\d+|[TG]\d+)$/.test(n))])];
  if(!numbers.length){unassigned.push(r);continue;}
  const number=[...numbers].sort(compare)[0];
  if(!tables.has(number))tables.set(number,{number,people:0,shared:[],times:new Set(),bookings:0});
  const t=tables.get(number);t.bookings++;if(r.time)t.times.add(r.time);t.people+=Number(r.people||0);

 }
 return {tables:[...tables.values()].filter(t=>t.bookings>0).sort((a,b)=>compare(a.number,b.number)),people:active.reduce((sum,r)=>sum+Number(r.people||0),0),unassigned};
}
export function tableNumberList(rows,day){
 const summary=tableNumberSummary(rows,day);
 const label=number=>/^G\d+$/.test(number)?'Gondel '+number:number;
 return `<section class="table-number-list"><p>Bei mehreren Tischen pro Reservation erscheint nur die kleinste Tischnummer mit der gesamten Personenzahl. Stornierte und gelöschte Reservationen sind ausgenommen.</p><div class="table-list-scroll"><table><thead><tr><th>Tisch</th><th>Personen</th><th>Uhrzeiten</th></tr></thead><tbody>${summary.tables.map(t=>`<tr><td><strong>${e(label(t.number))}</strong></td><td>${t.people||t.shared.length===0?`<strong>${t.people}</strong>`:''}${t.shared.map(g=>`<small>Gemeinsam ${g.people} Personen: ${e(g.tables)}${g.unclear?' · Zuordnung prüfen':''}</small>`).join('')}</td><td>${e([...t.times].sort().join(' / ')||'Zeit offen')}</td></tr>`).join('')||'<tr><td colspan="3">Noch keine Tische zugeordnet.</td></tr>'}</tbody></table></div>${summary.unassigned.length?`<p class="hint">${summary.unassigned.length} Reservation(en) mit ${summary.unassigned.reduce((n,r)=>n+Number(r.people||0),0)} Personen haben noch keine eindeutige Tischzuordnung.</p>`:''}<p><strong>Total: ${summary.people} Personen am Tag</strong></p></section>`;
}
