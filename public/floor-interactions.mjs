import {TABLES} from './floor-layout.mjs';
export function toggleTable(value,number,parse){const selected=new Set(parse(value).tables);selected.has(number)?selected.delete(number):selected.add(number);return [...selected].join(', ');}
export function boundedPosition(table,x,y){return {x:Math.round(Math.max(35,Math.min(1475-table.width,x))*100)/100,y:Math.round(Math.max(145,Math.min(1390-table.height,y))*100)/100};}
export function bindTablePicker(root,readValue,writeValue,parse){
 const update=()=>{const selected=new Set(parse(readValue()).tables);root.querySelectorAll('[data-floor-table]').forEach(el=>{el.classList.toggle('table-selected',selected.has(el.dataset.floorTable));el.setAttribute('aria-pressed',String(selected.has(el.dataset.floorTable)));});};
 root.querySelectorAll('[data-floor-table]').forEach(el=>{const activate=()=>{writeValue(toggleTable(readValue(),el.dataset.floorTable,parse));update();};el.onclick=activate;el.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();activate();}};});update();return update;
}
export function bindTableDragging(root,positions,save){
 const svg=root.querySelector('svg');if(!svg)return;
 const point=ev=>{const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
 root.querySelectorAll('g[data-floor-table]').forEach(el=>{
  const table=TABLES.find(t=>t.number===el.dataset.floorTable);let drag=null;
  const reset=()=>{el.removeAttribute('transform');el.classList.remove('table-dragging');drag=null;};
  el.onpointerdown=ev=>{if(ev.button!==0||root.dataset.saving==='true')return;ev.preventDefault();const start=point(ev),old=positions[table.number]||{x:table.x,y:table.y};drag={start,old,next:old};el.setPointerCapture(ev.pointerId);el.classList.add('table-dragging');};
  el.onpointermove=ev=>{if(!drag)return;const p=point(ev);drag.next=boundedPosition(table,drag.old.x+p.x-drag.start.x,drag.old.y+p.y-drag.start.y);el.setAttribute('transform',`translate(${drag.next.x-drag.old.x} ${drag.next.y-drag.old.y})`);};
  el.onpointercancel=reset;el.onlostpointercapture=()=>{if(drag)reset();};
  const persist=async(next)=>{root.dataset.saving='true';try{await save(table.number,next);positions[table.number]=next;}finally{delete root.dataset.saving;}};
  el.onpointerup=async ev=>{if(!drag)return;const next=drag.next,old=drag.old;drag=null;if(el.hasPointerCapture(ev.pointerId))el.releasePointerCapture(ev.pointerId);el.classList.remove('table-dragging');if(next.x===old.x&&next.y===old.y){reset();return;}try{await persist(next);}catch{reset();}};
  el.onkeydown=async ev=>{const delta={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[ev.key];if(!delta||root.dataset.saving==='true')return;ev.preventDefault();const old=positions[table.number]||table;const next=boundedPosition(table,old.x+delta[0],old.y+delta[1]);try{await persist(next);}catch{reset();}};
  el.onclick=ev=>ev.preventDefault();
 });
}
