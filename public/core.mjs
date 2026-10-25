export function guest(r) { try { return JSON.parse(r.data || '{}'); } catch { return {}; } }
export function totals(rows) {
  const result={mittag:0,abend:0,ungeklaert:0,offen:0,storniert:0,rueckfrage:0};
  for(const r of rows) { if(r.status==='Bestätigt') result[r.period]=(result[r.period]||0)+Number(r.people); else if(r.status==='Offen') result.offen+=Number(r.people); else if(r.status==='Rückfrage nötig') result.rueckfrage+=Number(r.people); else result.storniert+=Number(r.people); }
  return result;
}
export function csv(rows) {
  const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const head=['Datum','Zeit','Personen','Nachname','Vorname','Firma','Telefon','E-Mail','Strasse','PLZ','Ort','Status','Tisch','Gondel','Notiz','Wünsche'];
  return '\ufeff'+[head,...rows.map(r=>{const d=guest(r);return [r.date,r.time,r.people,d.last,d.first,d.company,d.phone,d.email,d.street,d.zip,d.city,r.status,r.table_no,r.gondola?'Ja':'Nein',r.note,d.comment];})].map(a=>a.map(cell).join(';')).join('\r\n');
}
export function canConfirm(rows,id,people,period) {return period==='mittag'||rows.filter(r=>r.id!==id&&r.status==='Bestätigt'&&r.period!=='mittag').reduce((n,r)=>n+Number(r.people),0)+people<=70;}
export function period(time){return !time?'ungeklaert':time<'16:00'?'mittag':'abend';}
export function escapeHTML(v) {return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export function bookingSummary(rows) {
  const active=rows.filter(r=>r.status!=="Storniert");
  const people=active.reduce((sum,r)=>sum+Number(r.people),0);
  return {reservations:active.length,people,revenue:people*65};
}
