export function validReservationDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const day=new Date(value+'T12:00:00Z');return Number.isFinite(day.getTime())&&day.toISOString().slice(0,10)===value;
}
export function requestPlanContext(mail,reservations){
 if(!mail)return null;
 const booking=reservations.find(r=>r.id===mail.reservation_id),draftDay=mail.draft?.date||'';
 const reviewed=booking&&(booking.revision>0||booking.status==='Bestätigt');
 const day=booking?.date||draftDay;
 if(!validReservationDay(day))return null;
 if(!reviewed){
  if(booking?.date&&draftDay&&booking.date!==draftDay)return null;
  if((Array.isArray(mail.issues)?mail.issues:[]).some(issue=>/(datum|wunschdatum)/i.test(issue)&&/(fehlt|nicht eindeutig|mehrere|ungültig|ungueltig|widerspr)/i.test(issue)))return null;
 }
 return {day,scope:'all',highlightTable:booking?.table_no||''};
}
