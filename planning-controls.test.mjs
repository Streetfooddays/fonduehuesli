import {test} from 'node:test';import assert from 'node:assert/strict';
import {fetchJSON} from './public/network.mjs';
import {toggleTable,boundedPosition,bindTablePicker,bindTableDragging} from './public/floor-interactions.mjs';
import {tableAssignments,setFloorLayouts,floorTables,floorPlan} from './public/floor-plan.mjs';
import {TABLES} from './public/floor-layout.mjs';
test('network deadlines also cover slow response bodies and distinguish server errors',async()=>{
 const pending=(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError'))));
 await assert.rejects(fetchJSON('/test',{},5,pending),/zu lange/);
 const bodyPending=async(url,{signal})=>({ok:true,text:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError'))))});
 await assert.rejects(fetchJSON('/test',{},5,bodyPending),/zu lange/);
 await assert.rejects(fetchJSON('/test',{},50,async()=>({ok:false,status:400,text:async()=>'{"message":"Personenzahl prüfen"}'})),/Personenzahl prüfen/);
 assert.deepEqual(await fetchJSON('/test',{},50,async()=>({ok:true,text:async()=>'{"ok":true}'})),{ok:true});
});
test('clicking multiple tables toggles each independently and keyboard selection works',()=>{
 let value='1';const els=['1','2','3'].map(n=>({dataset:{floorTable:n},classList:{toggle:()=>{}},setAttribute:()=>{}}));
 bindTablePicker({querySelectorAll:()=>els},()=>value,v=>value=v,tableAssignments);
 els[1].onclick();assert.equal(value,'1, 2');els[2].onkeydown({key:'Enter',preventDefault:()=>{}});assert.equal(value,'1, 2, 3');els[0].onclick();assert.equal(value,'2, 3');
});
test('daily positions apply without changing table numbers, other dates or assignments',()=>{
 const day='2099-02-01';setFloorLayouts([{date:day,positions:{'1':{x:100,y:200}}}]);assert.equal(floorTables(day).find(t=>t.number==='1').x,100);assert.equal(floorTables('2099-02-02').find(t=>t.number==='1').x,TABLES.find(t=>t.number==='1').x);assert.equal(floorTables(day).length,56);assert(floorPlan([],day).includes('x="100" y="200"'));setFloorLayouts([]);
 const t=TABLES[0];assert.deepEqual(boundedPosition(t,-500,50000),{x:35,y:Math.round((1390-t.height)*100)/100});
});
test('dragging transforms SVG coordinates, persists only on release and rolls back cancellation',async()=>{
 let saves=[];let captured=false;const attrs={};const el={dataset:{floorTable:'1'},classList:{add:()=>{},remove:()=>{}},setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],setPointerCapture:()=>captured=true,hasPointerCapture:()=>captured,releasePointerCapture:()=>captured=false};
 const svg={createSVGPoint:()=>({x:0,y:0,matrixTransform(){return {x:this.x/2,y:this.y/2};}}),getScreenCTM:()=>({inverse:()=>({})})};
 const root={dataset:{},querySelector:()=>svg,querySelectorAll:()=>[el]};const pos={'1':{x:100,y:200}};
 bindTableDragging(root,pos,async(n,p)=>saves.push([n,p]));const ev=(x,y)=>({button:0,pointerId:1,clientX:x,clientY:y,preventDefault:()=>{}});
 el.onpointerdown(ev(20,40));el.onpointermove(ev(60,100));assert.equal(attrs.transform,'translate(20 30)');assert.equal(saves.length,0);await el.onpointerup(ev(60,100));assert.deepEqual(saves,[['1',{x:120,y:230}]]);
 el.onpointerdown(ev(20,40));el.onpointermove(ev(80,160));el.onpointercancel();assert.equal(attrs.transform,undefined);assert.equal(saves.length,1);
});
import fs from 'node:fs';import vm from 'node:vm';
test('reservation form saves changed details, recovers after a failed save, and sends confirmed status explicitly',async()=>{
 const source=fs.readFileSync('public/app.mjs','utf8');const code=source.slice(source.indexOf('function edit('),source.indexOf('\nfunction ',source.indexOf('function edit(')+1));
 const values={date:'2099-02-01',time:'18:00',people:'4',last:'Synthetic',first:'Anna',status:'Bestätigt',tableNo:'1, 2',note:'Changed',salutation:'Liebe'};
 const form={dataset:{},elements:{status:{value:'Bestätigt',disabled:false},salutation:{value:'Liebe'},first:{value:'Anna'}}};
 const els={'#reservation':form,'#save':{textContent:'Speichern',disabled:false},'#save-error':{textContent:'',scrollIntoView:()=>{}},'#close':{},'#cancel':{},'#capacity':{}};let calls=[],fail=false,closed=false;
 class FormDataMock{constructor(f){this.data={...values};if(f.elements.status.disabled)delete this.data.status;}get(k){return this.data[k]||null;}}
 const ctx={crypto:{randomUUID:()=> 'synthetic-new'},guest:r=>JSON.parse(r.data),e:s=>String(s||''),field:()=>'',hideFloorPreview:()=>{},dialog:{set innerHTML(v){},close:()=>closed=true,showModal:()=>{}},$:s=>els[s],bindFormTablePicker:()=>{},FormData:FormDataMock,rows:[],date:'2099-02-01',period:()=> 'abend',canConfirm:()=>true,tableAssignments,displayNote:s=>s,load:async()=>{},render:()=>{},notice:()=>{},confirmationPanel:()=>'',updateReplyPreview:()=>{},suggestSalutation:()=> 'Liebe',mailSettings:{signature:''},rpc:async(n,p)=>{if(fail)throw Error('Validation failed');calls.push(p.payload.reservation);},req:async(n,p)=>calls.push(p.body.reservation)};
 vm.createContext(ctx);vm.runInContext(code,ctx);const booking={id:'synthetic',revision:2,date:values.date,time:values.time,people:4,status:'Bestätigt',data:'{}'};
 ctx.edit(booking);await form.onsubmit({preventDefault:()=>{},target:form});assert.equal(calls[0].tableNo,'1, 2');assert.equal(calls[0].note,'Changed');assert.equal(closed,true);assert.equal(els['#save'].disabled,false);
 fail=true;closed=false;ctx.edit(booking);await form.onsubmit({preventDefault:()=>{},target:form});assert.equal(closed,false);assert.equal(els['#save-error'].textContent,'Validation failed');assert.equal(els['#save'].disabled,false);
 fail=false;ctx.edit(booking,null,{editReply:true});await form.onsubmit({preventDefault:()=>{},target:form});assert.equal(calls.at(-1).status,'Bestätigt');assert.equal(form.elements.status.disabled,true);
});
