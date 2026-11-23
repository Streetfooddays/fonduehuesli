const norm=v=>String(v||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/ue/g,'u').replace(/[^a-z0-9]/g,'');
const id=v=>typeof v==='string'&&v.length>0&&v.length<=128;
function dateOnly(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('Ungültiger Kassentag.');const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value)throw Error('Ungültiger Kassentag.');return value;}
export function hellotessShift(payload,config){
 if(payload?.event?.type!==1)return {ignored:'other_event'};
 if(String(payload.customer?.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'')!==config.customer_host)throw Error('Unbekannte Hellotess-Quelle.');
 if(!id(payload.event.guid)||!Number.isSafeInteger(payload.event.order)||payload.event.order<0)throw Error('Ungültige Abschlussmeldung.');
 const data=payload.data;if(!data||!Array.isArray(data.rooms)||!Array.isArray(data.shifts)||data.shifts.length!==1)throw Error('Eine einzelne abgeschlossene Kassenschicht wird benötigt.');
 const shift=data.shifts[0];if(!id(shift.key)||!id(shift.terminalId)||!shift.endTime&&!shift.endTimeUTC)throw Error('Unvollständiger Schichtabschluss.');
 const roomIds=new Set(config.room_ids||[]),roomNames=new Set((config.room_names||[]).map(norm));
 const matching=data.rooms.filter(r=>roomIds.has(r.key)||roomNames.has(norm(r.name)));
 if(!matching.length)return {ignored:'other_rooms'};
 let cents=0;const seen=new Set();
 for(const r of matching){const key=String(r.key||norm(r.name));if(seen.has(key))throw Error('Doppelter Umsatzbereich.');seen.add(key);if(!Number.isSafeInteger(r.totalSales))throw Error('Umsatz muss in Rappen übermittelt werden.');cents+=r.totalSales;}
 if(!Number.isSafeInteger(cents)||Math.abs(cents)>1000000000)throw Error('Umsatz ausserhalb des erlaubten Bereichs.');
 let day;
 if(shift.startTimeUTC){const at=new Date(shift.startTimeUTC);if(!Number.isFinite(+at))throw Error('Ungültiger Schichtbeginn.');const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at).map(x=>[x.type,x.value]));day=p.year+'-'+p.month+'-'+p.day;}
 else day=String(shift.startTime||'').slice(0,10);
 return {shift_id:shift.key,event_id:payload.event.guid,source_order:payload.event.order,date:dateOnly(day),cents,terminal_id:shift.terminalId,closed_at:shift.endTimeUTC||shift.endTime,rooms:matching.map(r=>({id:r.key||'',name:r.name,cents:r.totalSales}))};
}
