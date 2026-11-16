import {test} from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {overviewSummary,overviewHTML,renderSeasonOverview,parseOverviewAmount,seasonYear} from './public/season-overview.mjs';
const b=(id,date,time,people,status='Bestätigt',extra={})=>({id,date,time,people,status,...extra});
test('days, months and season reconcile across midday, evening, unknown time and statuses',()=>{
 const rows=[b('a','2026-11-11','12:00',4),b('b','2026-11-11','16:00',5,'Offen'),b('c','2026-11-11','',2,'Rückfrage nötig'),b('d','2026-11-11','18:00',99,'Storniert'),b('e','2026-11-11','18:00',99,'Warteliste'),b('f','2026-12-01','18:00',3),b('g','2027-01-01','12:00',7),b('h','2026-11-11','12:00',99,'Bestätigt',{deleted_at:'x'}),b('i','2025-12-01','18:00',999)];
 const s=overviewSummary(rows,[{date:'2026-11-11',values:{kk:120.1,twint:30.2,cash:10,rechnung:40,tg:50,cds:'Synthetic'},average_basis:'total'}],2026);
 assert.equal(s.total.total,21);assert.equal(s.total.mittag,11);assert.equal(s.total.abend,8);assert.equal(s.total.ungeklaert,2);assert.equal(s.total.reservations,5);assert.equal(s.total.umsatz,200.3);assert.equal(s.months[0].total,11);assert.equal(s.months[0].days.find(d=>d.date==='2026-11-11').schnitt,200.3/11);assert.equal(s.months[1].total,3);assert.equal(s.months[2].total,7);assert.equal(s.total.values.tg,50);
 assert.equal(s.months[1].days.length,31);assert.equal(s.months[3].key,'2027-02');assert.equal(s.months[3].total,0);
});
test('source average denominator and zero handling remain; unsafe staff text escaped',()=>{const s=overviewSummary([b('a','2027-01-01','12:00',4),b('b','2027-01-01','18:00',2)],[{date:'2027-01-01',values:{kk:60,team:'<img onerror="x">'},average_basis:'abend'}],2026);assert.equal(s.months[2].days[0].schnitt,30);const html=overviewHTML(s);assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(html.includes('Gesamttotal'));assert(!html.includes('NaN'));});
test('Swiss amounts parse without truncation and reject invalid fractional values',()=>{assert.equal(parseOverviewAmount("1’234,50"),1234.5);assert.equal(parseOverviewAmount(''),0);assert.equal(parseOverviewAmount('-20.10'),-20.1);for(const bad of ['abc','1.234','12CHF','Infinity','1e3'])assert.throws(()=>parseOverviewAmount(bad));assert.equal(seasonYear('2027-01-01'),2026);});
test('field edits save to server, update totals and preserve the next focused input',async()=>{
 const {document,window}=parseHTML('<div id="root"></div>');globalThis.document=document;const root=document.querySelector('#root');let saved;
 await renderSeasonOverview(root,{rows:[b('x','2026-11-11','12:00',2)],current:'2026-11-16',req:async()=>[],rpc:async(name,{p})=>{saved={name,p};return {date:p.date,values:{[p.key]:p.value},revision:2};},notice:()=>{},onDate:()=>{}});
 const input=root.querySelector('[data-overview-day="2026-11-11"][data-overview-key="kk"]');input.value='100,50';input.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));assert.equal(saved.name,'save_overview_field');assert.equal(saved.p.previous,null);assert.equal(saved.p.value,100.5);assert(root.querySelector('.so-month-totals').textContent.includes('100.50'));assert.equal(root.querySelector('#overview-save-status').textContent,'Gespeichert');delete globalThis.document;
});

test('expected revenue uses reserved guests; manual effective revenue overrides payments and reconciles',()=>{
 const rows=[b('a','2026-11-11','12:00',2),b('b','2026-11-11','18:00',3),b('c','2026-12-01','18:00',4),b('w','2026-11-11','18:00',20,'Warteliste'),b('x','2026-11-11','18:00',20,'Storniert')];
 const s=overviewSummary(rows,[{date:'2026-11-11',values:{kk:100,effective_revenue:280}},{date:'2026-12-01',values:{cash:210}}],2026);
 assert.equal(s.total.expected,585);assert.equal(s.total.umsatz,490);assert.equal(s.months[0].expected,325);assert.equal(s.months[0].umsatz,280);assert.equal(s.months[0].days.find(d=>d.date==='2026-11-11').schnitt,56);
 const {document}=parseHTML(overviewHTML(s));const row=document.querySelector('[data-overview-date="2026-11-11"]');assert.equal(row.querySelector('[data-overview-key="effective_revenue"]').value,'280');assert.equal(row.children[6].textContent,'325.00');
 const headers=document.querySelector('.so-month-totals thead tr').children.length;assert.equal(document.querySelector('.so-month-totals tbody tr').children.length,headers);
 const zero=overviewSummary(rows,[{date:'2026-11-11',values:{kk:100,effective_revenue:0}}],2026);assert.equal(zero.months[0].umsatz,0);
});
test('effective revenue field saves as a number through the same guarded field API',async()=>{
 const {document,window}=parseHTML('<div id="root"></div>');globalThis.document=document;let saved;const root=document.querySelector('#root');
 await renderSeasonOverview(root,{rows:[b('a','2026-11-11','18:00',2)],current:'2026-11-16',req:async()=>[],rpc:async(name,{p})=>{saved=p;return {date:p.date,values:{[p.key]:p.value}};},notice:()=>{},onDate:()=>{}});
 const input=root.querySelector('[data-overview-day="2026-11-11"][data-overview-key="effective_revenue"]');input.value='180,50';input.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));assert.equal(saved.value,180.5);assert.equal(saved.key,'effective_revenue');assert.equal(saved.previous,null);assert(root.querySelector('.so-month-totals').textContent.includes('180.50'));delete globalThis.document;
});
