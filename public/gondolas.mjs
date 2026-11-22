import {guest,period} from './core.mjs';
import {tableAssignments} from './floor-plan.mjs';
export function isGondolaReservation(r){if(!r)return false;const g=typeof r.data==='string'?guest(r):r.data||{};return r.gondola===true||r.gondola===1||r.gondola==='1'||/^(?:ja|true|1)$/i.test(String(g.gondola||''))||tableAssignments(r.table_no||'').tables.some(n=>/^G[123]$/.test(n));}
export function gondolaTablesReleased(r){const tables=tableAssignments(r?.table_no||'').tables.filter(t=>/^G[123]$/.test(t));return tables.length>0&&tables.every(t=>(r.released_tables||[]).includes(t));}
export function gondolaRowClass(r){return r&&!r.deleted_at&&['Bestätigt','Offen','Rückfrage nötig'].includes(r.status)&&isGondolaReservation(r)?'gondola-reservation':'';}
export function gondolaAvailability(rows,day){
 const active=rows.filter(r=>r.date===day&&gondolaRowClass(r)&&!gondolaTablesReleased(r));
 const free=scope=>Math.max(0,3-active.filter(r=>{const p=r.period||period(r.time);return p===scope||p==='ungeklaert';}).reduce((n,r)=>n+Math.max(1,tableAssignments(r.table_no||'').tables.filter(t=>/^G[123]$/.test(t)).length),0));
 const midday=free('mittag'),evening=free('abend');return {free:Math.min(midday,evening),midday,evening,total:3};
}

export function confirmGondolaReservation(r,ask){
 return !isGondolaReservation({...r,table_no:r?.table_no||r?.tableNo||''})||ask('Habt ihr gesehen, dass diese Reservation in einer Fonduegondel ist?');
}
