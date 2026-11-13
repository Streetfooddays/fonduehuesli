// Arrival can be clicked immediately after an inline table/time edit finishes saving.
export async function saveArrival(booking,value,{save,latest}){
 try{return await save({id:booking.id,revision:booking.revision,arrived:value});}
 catch(err){
  if(err.status!==409&&!/zwischenzeitlich geändert|inzwischen geändert/.test(err.message||''))throw err;
  const fresh=await latest(booking.id);
  if(!fresh||fresh.deleted_at||fresh.status==='Storniert')throw Error('Reservation ist nicht mehr aktiv. Bitte die Übersicht aktualisieren.');
  Object.assign(booking,fresh);
  return save({id:booking.id,revision:booking.revision,arrived:value});
 }
}
