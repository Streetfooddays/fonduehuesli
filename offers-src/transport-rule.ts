import {uid,type Inquiry,type Config,type Product} from './model.ts';
export const defaultTransportProduct:Product={id:'transport',name:'Transport / Anfahrt',unit:'km',price:null,tax:8.1,approved:false,category:'transport'};
export function transportProduct(c:Config){return c.products.find(p=>p.id===(c.transportProductId||'transport')&&p.unit==='km'&&!(c.deletedProducts||[]).some(d=>d.id===p.id));}
export function applyTransport(q:Inquiry,c:Config):Inquiry{
 const p=transportProduct(c);if(!p)throw Error('Bitte unter Preise & Regeln eine Kilometerregel anlegen.');
 if(!Number.isFinite(q.distance)||q.distance<=0)throw Error('Bitte zuerst die gesamte Fahrtstrecke eingeben oder aus dem Web ermitteln.');
 const items=q.items.filter(i=>i.ruleId!=='transport-km'&&!(i.catalogProductId===p.id&&i.unit==='km'));items.push({id:q.items.find(i=>i.ruleId==='transport-km')?.id||uid(),ruleId:'transport-km',catalogProductId:p.id,title:p.name,qty:q.distance,unit:'km',price:p.price,tax:p.tax,priceIncludesTax:p.priceIncludesTax,category:'transport',approved:false,source:p.source,sourceDate:p.sourceDate});
 return {...q,items,generated:true,calculationBasis:undefined};
}
