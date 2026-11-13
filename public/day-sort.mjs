import {guest} from './core.mjs';
import {cancellationsLast} from './reservation-order.mjs';
import {tableAssignments} from './floor-plan.mjs';
const collator=new Intl.Collator('de-CH',{numeric:true,sensitivity:'base'});
const compare=(a,b)=>!a&&!b?0:!a?1:!b?-1:collator.compare(a,b);
function tableKey(r){const a=tableAssignments(r.table_no);return [...new Set([...a.tables,...a.unknown.map(n=>String(n).replace(/\s/g,'')).filter(n=>/^(?:\d+|[TG]\d+)$/.test(n))])].sort(collator.compare)[0]||'';}
function nameParts(r){const d=guest(r);return [String(d.last||d.company||d.first||'').trim(),d.last?String(d.first||'').trim():''];}
export function compareDayReservations(a,b,mode='time'){
 const cancelled=cancellationsLast(a,b);if(cancelled)return cancelled;
 const [lastA,firstA]=nameParts(a),[lastB,firstB]=nameParts(b);
 const name=()=>compare(lastA,lastB)||compare(firstA,firstB);
 if(mode==='table')return compare(tableKey(a),tableKey(b))||compare(a.time,b.time)||name();
 if(mode==='name')return name()||compare(a.time,b.time)||compare(tableKey(a),tableKey(b));
 return compare(a.time,b.time)||name()||compare(tableKey(a),tableKey(b));
}
