// Keep the existing order within active and cancelled groups.
export function cancellationsLast(a,b){return Number(a.status==='Storniert')-Number(b.status==='Storniert');}
