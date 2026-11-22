import {uid,type Inquiry,type Item,type Product,type Config} from './model.ts';
export const groups=[['apero','Apéro'],['vorspeise','Vorspeisen'],['fondue','Fondue'],['raclette','Raclette'],['dessert','Dessert'],['aperogetraenke','Apérogetränke'],['wein','Wein'],['bier','Bier'],['soft','Softgetränke'],['spirituosen','Spirituosen'],['kaffee','Kaffee'],['tee','Tee'],['tuenkli','Tünklikirsch'],['service','Service'],['kueche','Küche'],['dekoration','Dekoration'],['mobiliar','Mobiliar & Infrastruktur'],['weitere','Weitere Dienstleistungen'],['transport','Transport']] as const;
export const drinkGroups=groups.slice(5,13).map(g=>g[0]) as string[];
export function category(i:{category?:string;title?:string;name?:string}){if(i.category&&groups.some(g=>g[0]===i.category))return i.category;const n=(i.title||i.name||'').toLowerCase();if(/transport|anfahrt|lieferung/.test(n))return 'transport';if(/küche|kueche/.test(n)&&!/infrastruktur/.test(n))return 'kueche';if(/mitarbeiter|service|personal/.test(n))return 'service';if(/set|miete|infrastruktur|gedeck|ofen/.test(n))return 'mobiliar';if(/dekor|tischtuch/.test(n))return 'dekoration';if(/raclett/.test(n))return 'raclette';if(/dessert|glacé|schokoladenküch|meringue|sorbet/.test(n))return 'dessert';if(/kaffee|espresso/.test(n))return 'kaffee';if(/tee/.test(n))return 'tee';if(/tünklikirsch/.test(n))return 'tuenkli';if(/fondue|moitié|brot|beilage|kartoffel/.test(n))return 'fondue';return 'weitere';}
export function orderedItems(items:Item[]){return [...items].sort((a,b)=>groups.findIndex(g=>g[0]===category(a))-groups.findIndex(g=>g[0]===category(b)));}
export function offeredItems(q:Inquiry){return orderedItems(q.items.filter(i=>q.drinksIncluded!==false||!drinkGroups.includes(category(i))));}
export function withDrinks(q:Inquiry,include:boolean):Inquiry{return {...q,drinksIncluded:include,items:include?q.items:q.items.filter(i=>!drinkGroups.includes(category(i)))};}
export function referenceItem(p:Product,q:Inquiry,grams:number):Item{const c=category(p);let qty=['Person','Portion','Kinderportion','Kind'].includes(p.unit)?q.guests:p.unit==='kg'?Math.round(q.guests*grams/10)/100:1;if(p.unit.includes('für 6'))qty=Math.ceil(q.guests/6);if(c==='transport'&&p.unit==='km')qty=q.distance;if(c==='service')qty=q.staff*(q.hours+(q.preparationHours||0));if(c==='kueche')qty=(q.kitchenStaff||0)*((q.kitchenHours||0)+(q.preparationHours||0));return {catalogProductId:p.id,id:uid(),title:p.name,qty,unit:p.unit,price:p.price,tax:p.tax,approved:p.approved,category:c,priceIncludesTax:p.priceIncludesTax||false,discount:p.discount||0,source:p.source,sourceDate:p.sourceDate};}
export const catalogSummary={orders:11,offers:2,pdfs:2,checked:'22.11.2026'};

export function matchesProduct(i:Item,p:Product){return i.catalogProductId?i.catalogProductId===p.id:i.title===p.name&&i.unit===p.unit&&i.source===p.source&&i.price===p.price;}
export function selectProduct(q:Inquiry,p:Product,checked:boolean,grams:number):Inquiry{
 const exists=q.items.some(i=>matchesProduct(i,p));
 if(checked&&exists)return q;
 return {...q,items:checked?[...q.items,referenceItem(p,q,grams)]:q.items.filter(i=>!matchesProduct(i,p)),generated:checked||q.generated,calculationBasis:undefined};
}

// Stored product rules take precedence over imported references with the same ID.
export function mergeProducts(existing:Product[],references:Product[],deletedIds:string[]=[]):Product[]{
 const merged=new Map<string,Product>();
 for(const p of existing)merged.set(p.id,{...references.find(r=>r.id===p.id),...p});
 for(const p of references)if(!merged.has(p.id))merged.set(p.id,{...p});
 return [...merged.values()].filter(p=>!deletedIds.includes(p.id));
}

export function deleteProduct(config:Config,id:string):Config{
 const product=config.products.find(p=>p.id===id);if(!product)return config;
 return {...config,products:config.products.filter(p=>p.id!==id),favoriteProductIds:(config.favoriteProductIds||[]).filter(x=>x!==id),deletedProducts:[...(config.deletedProducts||[]).filter(p=>p.id!==id),{...product}]};
}
export function restoreProduct(config:Config,id:string):Config{
 const product=config.deletedProducts?.find(p=>p.id===id);if(!product)return config;
 return {...config,products:[...config.products.filter(p=>p.id!==id),{...product}],deletedProducts:config.deletedProducts!.filter(p=>p.id!==id)};
}

export function moveProduct(products:Product[],from:string,to:string):Product[]{
 const source=products.findIndex(p=>p.id===from),target=products.findIndex(p=>p.id===to);
 if(source<0||target<0||source===target||category(products[source])!==category(products[target]))return products;
 const next=[...products],removed=next.splice(source,1)[0];next.splice(target,0,removed);return next;
}
