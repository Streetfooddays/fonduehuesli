import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('docked plan persists during reservation editing and follows row selection without blocking controls',()=>{
 const source=fs.readFileSync('public/app.mjs','utf8'),start=source.indexOf('let floorPreviewTimer=null'),end=source.indexOf('\nfunction bindDayGuestCounts()',start);
 let pane=null,classes=new Set(),rendered=[],clicked=[];
 const button={dataset:{openFloor:'2099-01-02',openFloorScope:'abend',openFloorTable:'2'}},row={dataset:{floorPreviewDay:'2099-01-01',floorPreviewScope:'abend',floorPreviewTable:'1'}};
 const document={body:{classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c),remove:c=>classes.delete(c)},append:p=>pane=p},createElement:()=>({hidden:false,setAttribute(){},querySelector:()=>({})}),querySelector:s=>s==='#floor-hover'?pane:row,querySelectorAll:s=>s==='[data-open-floor]'?[button]:[row]};
 const ctx={document,window:{matchMedia:()=>({matches:true}),addEventListener(){}},view:'day',date:'2099-01-01',floorScope:'all',dialog:{open:false},rows:[],setTimeout:fn=>{fn();return 1;},clearTimeout(){},floorPlan:(rows,day,scope,table)=>{rendered.push({day,scope,table});return 'plan';},bindFloorPlans(){},openFloorPlan:(...args)=>clicked.push(args)};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);ctx.bindFloorPreviews();assert(classes.has('floor-docked'));assert.equal(pane.hidden,false);assert.equal(pane.inert,undefined);
 ctx.hideFloorPreview();assert.equal(pane.hidden,false);assert.equal(row.onmouseleave,null);assert.equal(row.onmouseenter,null);assert.equal(row.onmouseover,null);
 const beforeHover=rendered.length;
 for(const type of ['mouseenter','focus','pointerdown']){ctx.hideFloorPreview({type,target:{}});assert.equal(pane.hidden,false);assert(classes.has('floor-docked'));assert.equal(rendered.length,beforeHover);}
 button.onclick();assert.equal(rendered.at(-1).day,'2099-01-02');assert.equal(rendered.at(-1).table,'2');assert.equal(clicked.length,0);
 assert.equal(row.onfocusin,null);assert.equal(row.onpointerdown,null);assert.equal(rendered.at(-1).table,'2');
 ctx.hideFloorPreview(true);assert.equal(pane.hidden,true);ctx.showFloorPreview('2099-01-01','all');assert.equal(pane.hidden,false);
 ctx.view='team';ctx.hideFloorPreview();assert.equal(pane.hidden,true);assert(!classes.has('floor-docked'));
});
