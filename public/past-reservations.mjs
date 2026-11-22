import {todayInZurich} from './day-start.mjs';
import {validReservationDay} from './request-plan.mjs';

// Archiving is derived from the booking date, preserving original statuses and totals.
// Moving a reservation to a future date automatically returns it to the open list.
export function reservationIsPast(reservation,now=new Date()){
 const day=typeof reservation==='string'?reservation:reservation?.date;
 return validReservationDay(day)&&day<todayInZurich(now);
}
export function requestIsPast(mail,rows,now=new Date()){
 const booking=rows.find(r=>r.id===mail?.reservation_id);
 return reservationIsPast(booking?.date||mail?.draft?.date,now);
}
export function deliveryIsPast(delivery,rows,inbox,now=new Date()){
 const booking=rows.find(r=>r.id===delivery.reservation_id);
 return booking?reservationIsPast(booking,now):requestIsPast(inbox.find(m=>m.id===delivery.mail_id),rows,now);
}
