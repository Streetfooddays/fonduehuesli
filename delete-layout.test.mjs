import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {requestPlanContext,validReservationDay} from './public/request-plan.mjs';
test('deleting a request keeps the docked layout for a valid next date, an unclear date, and an empty inbox',async()=>{
 const source=fs.readFileSync('public/app.mjs','utf8');
 const dock=source.slice(source.indexOf('let floorPreviewTimer=null'),source.indexOf('\nfunction bindDayGuestCounts()'));
 const start=source.indexOf('function deleteMail('),matches=[source.indexOf('\nfunction ',start+10),source.indexOf('\nasync function ',start+10)].filter(n=>n>start);
 const deletion=source.slice(start,Math.min(...matches));
 for(const next of [{id:'next',draft:{date:'2099-03-12'}},{id:'next',draft:{}},null]){
  const old={id:'old',subject:'Synthetic',sender:'test@example.invalid',draft:{date:'2099-03-11'},state:'review'};
  let pane=null,bodyClasses=new Set(),shown=[],legacyCloseCalls=0;const controls={};
  const get=s=>controls[s]??=( {disabled:false,textContent:''} );
  const dialog={open:false,onclose:()=>legacyCloseCalls++,classList:{remove(){}},close(){this.open=false;this.onclose?.();},showModal(){this.open=true;}};
  const ctx={view:'pending',date:'2099-03-11',floorScope:'all',focusedRequestId:'old',inbox:[old,...(next?[next]:[])],rows:[],dialog,window:{matchMedia:()=>({matches:true}),addEventListener(){}},clearTimeout(){},requestPlanContext,validReservationDay,mailNeedsAction:m=>m.state!=='ignored',bindFloorPlans(){},floorPlan:(r,day)=>{shown.push(day);return day;},e:s=>String(s||''),canDeleteMail:()=>true,$:get,notice(){},rpc:async()=>{old.state='ignored';},load:async()=>{}};
  const card=()=>{const m=ctx.inbox.find(ctx.mailNeedsAction);return m?{dataset:{requestId:m.id,floorPreviewDay:m.draft.date||''},}:null;};
  ctx.document={body:{classList:{toggle:(c,on)=>on?bodyClasses.add(c):bodyClasses.delete(c),remove:c=>bodyClasses.delete(c)},append:p=>pane=p},createElement:()=>({hidden:false,setAttribute(){},querySelector:()=>({})}),querySelector:s=>s==='#floor-hover'?pane:s==='#content'?{}:card(),querySelectorAll:s=>s==='[data-open-floor]'?[]:card()?[card()]:[]};
  vm.createContext(ctx);vm.runInContext(dock+'\n'+deletion,ctx);ctx.render=()=>ctx.bindFloorPreviews();
  ctx.selectRequestPlan('old');assert.equal(pane.hidden,false);
  ctx.deleteMail('old');assert.equal(legacyCloseCalls,0,'Old popup close callback must be detached');await get('#confirm-delete-mail').onclick();
  assert.equal(ctx.view,'pending');assert(bodyClasses.has('floor-docked'),'Deleting never switches back to full-width layout');assert.equal(ctx.focusedRequestId,null);
  if(next?.draft.date){assert.equal(pane.hidden,false);assert.equal(shown.at(-1),next.draft.date);}else assert.equal(pane.hidden,true,'No dated request means no stale plan');
 }
});
