// Active reservations, then waiting list in receipt order, then cancellations.
export const reservationRank=r=>r.status==='Storniert'?2:r.status==='Warteliste'?1:0;
export function cancellationsLast(a,b){
 const rank=reservationRank(a)-reservationRank(b);if(rank)return rank;
 if(a.status==='Warteliste'&&b.status==='Warteliste')return (Date.parse(a.received_at||a.created)||0)-(Date.parse(b.received_at||b.created)||0)||String(a.id).localeCompare(String(b.id));
 return 0;
}
