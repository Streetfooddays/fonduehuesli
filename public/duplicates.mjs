import {guest} from './core.mjs';
export function reservationNameKey(data={}){
 return [data.last,data.first].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('de-CH').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');
}
export function duplicateCandidates(subject,rows,inbox){
 const key=reservationNameKey(subject.data);if(!subject.date||!key)return [];
 const matches=new Map();
 const add=(candidate,id)=>{if(candidate.date===subject.date&&reservationNameKey(candidate.data)===key)matches.set(id,candidate);};
 for(const r of rows){
  if(r.id===subject.reservationId||r.status==='Storniert')continue;
  add({kind:'reservation',id:r.id,date:r.date,time:r.time||'',people:r.people,status:r.status,data:guest(r)},'reservation:'+r.id);
 }
 for(const m of inbox){
  if(m.id===subject.mailId||m.state==='ignored'||(subject.reservationId&&m.reservation_id===subject.reservationId))continue;
  const linked=rows.find(r=>r.id===m.reservation_id);if(linked?.status==='Storniert')continue;
  if(linked){
   add({kind:'reservation',id:linked.id,date:linked.date,time:linked.time||'',people:linked.people,status:linked.status,data:guest(linked)},'reservation:'+linked.id);
  }else{
   add({kind:'request',id:m.id,date:m.draft?.date||'',time:m.draft?.time||'',people:m.draft?.people||null,status:m.state==='question'?'Rückfrage nötig':'Anfrage',data:m.draft?.data||{}},'request:'+m.id);
  }
 }
 return [...matches.values()];
}
