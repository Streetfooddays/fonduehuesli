import {canConfirm,period} from './core.mjs';

export function confirmationReviewReason(booking,rows,day){
 const sameDay=rows.filter(r=>r.date===booking.date&&!r.deleted_at).map(r=>({...r,period:period(r.time)}));
 const overCapacity=!canConfirm(sameDay,booking.id,Number(booking.people),period(booking.time));
 if(overCapacity)return 'Mehr als 70 bestätigte Abendgäste: Bitte die Belegung prüfen und die manuelle Freigabe unten im Formular markieren.';
 if(day?.manual_only)return 'Dieser Tag ist zur manuellen Prüfung markiert. Bitte die Belegung prüfen und die manuelle Freigabe unten im Formular markieren.';
 return '';
}

export function confirmationNeedsManualReview(error){
 return error?.status===400&&/70 Personen|manuelle Freigabe|manuell.*prüf|manuell.*freig|Gondel/i.test(error.message||'');
}
