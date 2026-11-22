const norm=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/ß/g,'ss').replace(/[^\p{L}\d]/gu,'');
const dataOf=row=>{try{return typeof row.data==='string'?JSON.parse(row.data||'{}'):row.data||{};}catch{return {};}};
const keys=data=>[norm((data.first||'')+(data.last||'')),norm((data.last||'')+(data.first||''))].filter(Boolean);
const phone=value=>{let n=String(value||'').replace(/\D/g,'');if(n.startsWith('0041'))n='0'+n.slice(4).replace(/^0/,'');else if(n.startsWith('41')&&[11,12].includes(n.length))n='0'+n.slice(2).replace(/^0/,'');return n.length>=9?n:'';};
const email=value=>String(value||'').trim().toLowerCase();
// Contact search is separate from thread ownership: show every hit without
// joining conversations or changing the selected reservation automatically.
export function findContactReservations(mail,rows){
 const draft=mail?.draft||{},contacts=[draft,...(draft.thread_references||[])].map(r=>r.data||{});
 return rows.filter(r=>!r.deleted_at).map(booking=>{
  const g=dataOf(booking),byEmail=contacts.some(d=>email(d.email)&&email(d.email)===email(g.email)),byPhone=contacts.some(d=>phone(d.phone)&&phone(d.phone)===phone(g.phone));
  return {booking,byEmail,byPhone};
 }).filter(hit=>hit.byEmail||hit.byPhone).sort((a,b)=>String(a.booking.date||'').localeCompare(String(b.booking.date||''))||String(a.booking.time||'').localeCompare(String(b.booking.time||''))||String(a.booking.id).localeCompare(String(b.booking.id)));
}
export function resolveRequestBooking(mail,rows){
 if(mail.reservation_id&&mail.draft?.is_reply&&mail.reservation_id==='mail-'+mail.id){const other=resolveRequestBooking({...mail,reservation_id:null},rows.filter(r=>r.id!==mail.reservation_id));if(other.booking||other.kind==='ambiguous')return {...other,kind:other.booking?'related':other.kind};}
 if(mail.reservation_id){const booking=rows.find(r=>r.id===mail.reservation_id&&!r.deleted_at);return {booking:booking||null,kind:booking?'linked':'none',candidates:[]};}
 const draft=mail.draft||{},references=[draft,...(draft.thread_references||[])],all=new Map(),exact=new Map();
 for(const reference of references){
  if(!reference.date)continue;const data=reference.data||{},names=keys(data),address=email(data.email);
  for(const booking of rows){
   if(booking.deleted_at||booking.status==='Storniert'||booking.date!==reference.date)continue;
   const guest=dataOf(booking),sameName=keys(guest).some(k=>names.includes(k)),sameEmail=address&&address===email(guest.email);
   if(!sameName&&!sameEmail)continue;all.set(booking.id,booking);
   if(reference.people&&Number(reference.people)===Number(booking.people)&&reference.time&&(reference.time||'')===(booking.time||''))exact.set(booking.id,booking);
   // Keep the previous exact-match behavior for reservations without an arrival time.
   if(reference.people&&Number(reference.people)===Number(booking.people)&&!reference.time&&!booking.time)exact.set(booking.id,booking);
  }
 }
 // A short reply may omit all dates. Only a unique contact match is safe to show;
 // keep it as related so confirmation and edits still require review.
 if(!all.size&&(draft.is_reply||!references.some(r=>r.date))){
  const contacts=references.map(r=>r.data||{});
  for(const booking of rows){
   if(booking.deleted_at||booking.status==='Storniert')continue;
   const g=dataOf(booking);
   if(contacts.some(d=>email(d.email)&&email(d.email)===email(g.email)||phone(d.phone)&&phone(d.phone)===phone(g.phone)&&(!keys(d).length||keys(g).some(k=>keys(d).includes(k)))))all.set(booking.id,booking);
  }
  if(all.size===1)return {booking:[...all.values()][0],kind:'related',candidates:[...all.values()]};
 }
 const preferred=exact.size?exact:all;if(preferred.size!==1)return {booking:null,kind:preferred.size?'ambiguous':'none',candidates:[...preferred.values()]};
 const booking=[...preferred.values()][0];
 const unchanged=draft.date===booking.date&&Number(draft.people)===Number(booking.people)&&(draft.time||'')===(booking.time||'');
 return {booking,kind:unchanged&&!draft.is_reply?'exact':'related',candidates:[booking]};
}
