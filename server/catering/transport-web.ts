export const TRANSPORT_ORIGIN='Hammerstrasse 6, 8180 Bülach';
export const ORIGIN_POINT={label:TRANSPORT_ORIGIN,lon:8.538351058959961,lat:47.50810241699219};
export type RoutePoint={label:string;lon:number;lat:number};
export type TransportRoute={origin:string;destination:string;venueInput:string;oneWayKm:number;totalKm:number;calculatedAt:string;source:string;manual?:boolean};
export async function searchDestinations(query:string,fetcher:typeof fetch=fetch):Promise<RoutePoint[]>{
 if(typeof query!=='string'||query.trim().length<4||query.length>250)throw Error('Bitte die vollständige Veranstaltungsadresse eingeben.');
 const url=new URL('https://api3.geo.admin.ch/rest/services/ech/SearchServer');url.search=new URLSearchParams({type:'locations',origins:'address',limit:'8',sr:'4326',searchText:query.trim().split(/\s+/).slice(0,10).join(' ')}).toString();
 const r=await fetcher(url.toString(),{headers:{'User-Agent':'ArtOfFondue-Catering/1.0 (info@artoffondue.ch)'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Die Adresssuche ist momentan nicht erreichbar. Kilometer können manuell eingegeben werden.');
 const b=await r.json() as any,zip=query.match(/\b\d{4}\b/)?.[0];
 return (b.results||[]).map((x:any)=>x.attrs).filter((a:any)=>Number(a.num)>0&&Number.isFinite(a.lon)&&Number.isFinite(a.lat)&&(!zip||a.label.includes(zip))).map((a:any)=>({label:String(a.label).replace(/<[^>]*>/g,''),lon:a.lon,lat:a.lat}));
}
let nextRoutingAt=0;const cache=new Map<string,TransportRoute>();
export async function roadRoute(destination:RoutePoint,venueInput:string,fetcher:typeof fetch=fetch):Promise<TransportRoute>{
 if(!destination||typeof destination.label!=='string'||destination.label.length>250||!Number.isFinite(destination.lon)||!Number.isFinite(destination.lat)||destination.lon<5||destination.lon>11||destination.lat<45||destination.lat>49)throw Error('Bitte eine gültige Schweizer Zieladresse auswählen.');
 const key=destination.lon+','+destination.lat,cached=cache.get(key);if(cached&&Date.now()-Date.parse(cached.calculatedAt)<86400000)return {...cached,venueInput};
 const delay=Math.max(0,nextRoutingAt-Date.now());nextRoutingAt=Math.max(Date.now(),nextRoutingAt)+1100;if(delay>10000)throw Error('Bitte die Routenberechnung in einigen Sekunden erneut starten.');if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
 const url=`https://routing.openstreetmap.de/routed-car/route/v1/driving/${ORIGIN_POINT.lon},${ORIGIN_POINT.lat};${destination.lon},${destination.lat}?overview=false&steps=false&alternatives=false`;
 const r=await fetcher(url,{headers:{'User-Agent':'ArtOfFondue-Catering/1.0 (info@artoffondue.ch)'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Der Routendienst ist momentan nicht erreichbar. Bitte Kilometer manuell ergänzen.');const b=await r.json() as any,metres=b.routes?.[0]?.distance;
 if(b.code!=='Ok'||!Number.isFinite(metres)||metres<0||metres>3000000)throw Error('Keine befahrbare Strassenroute gefunden. Bitte Adresse prüfen oder Kilometer manuell ergänzen.');
 const oneWayKm=Math.round(metres/10)/100;const result={origin:TRANSPORT_ORIGIN,destination:destination.label,venueInput,oneWayKm,totalKm:Math.round(oneWayKm*200)/100,calculatedAt:new Date().toISOString(),source:'OSRM / FOSSGIS · OpenStreetMap; Adresssuche swisstopo'};
 if(cache.size>200)cache.clear();cache.set(key,result);return result;
}
