import {tableAssignments} from './floor-plan.mjs';
import {tableGroupAssignment} from './table-groups.mjs';
import {period} from './core.mjs';
function numbers(value){const a=tableAssignments(value);const extra=a.unknown.map(n=>String(n).replace(/\s/g,''));const valid=extra.filter(n=>/^(?:\d+|[TG]\d+)$/.test(n));return {tables:[...new Set([...a.tables,...valid])],unclear:a.unclear&&!(valid.length===extra.length&&/^[\dTG\s,;/+&]+$/i.test(value||''))};}
export function tableAssignmentState(booking,rows,value=booking.table_no,preview=false){
 if(booking.status==='Storniert'||booking.deleted_at)return {state:'inactive',message:'Stornierte oder gelöschte Reservation.',conflictTables:[]};
 let assigned=value;try{if(preview)assigned=tableGroupAssignment(value,booking.people);}catch(err){return {state:'unassigned',message:err.message,conflictTables:[]};}
 const a=numbers(assigned);
 if(!a.tables.length||a.unclear)return {state:'unassigned',message:a.tables.length?'Tischzuordnung bitte prüfen.':'Noch kein Tisch zugeteilt.',conflictTables:[]};
 const ownPeriod=booking.period||period(booking.time),conflicts=new Set();
 for(const other of rows){
  if(other.id===booking.id||other.date!==booking.date||other.deleted_at||other.status==='Storniert'||Number(other.people)<=0)continue;
  if(!['Bestätigt','Offen','Rückfrage nötig'].includes(other.status))continue;
  const otherPeriod=other.period||period(other.time);if(ownPeriod!==otherPeriod&&ownPeriod!=='ungeklaert'&&otherPeriod!=='ungeklaert')continue;
  const occupied=new Set(numbers(other.table_no).tables);for(const n of a.tables)if(occupied.has(n))conflicts.add(n);
 }
 const conflictTables=[...conflicts];
 return conflictTables.length?{state:'conflict',message:'Bereits vergeben: '+conflictTables.join(', ')+'. Bitte Tischbelegung prüfen.',conflictTables}:{state:'assigned',message:'Tisch zugeteilt: '+a.tables.join(', ')+'.',conflictTables:[]};
}
