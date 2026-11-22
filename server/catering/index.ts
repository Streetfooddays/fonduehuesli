import {searchDestinations,roadRoute} from './transport-web.ts';
const origin='https://fonduehuesli-reservationen.onrender.com';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'private, no-store'};
const json=(b:any,status=200)=>Response.json(b,{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST'||req.headers.get('origin')&&req.headers.get('origin')!==origin)return json({error:'Zugriff abgelehnt.'},403);
 const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return json({error:'Bitte im Reservationsbuch anmelden.'},401);
 const base=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!;
 const headers={apikey:key,Authorization:auth,'Content-Type':'application/json'};
 async function rest(path:string,options:any={}){const r=await fetch(base+'/rest/v1/'+path,{headers:{...headers,...options.headers},...options});if(!r.ok)throw Error('Daten konnten nicht gespeichert oder geladen werden.');const t=await r.text();return t?JSON.parse(t):null;}
 try{
  // The existing RPC validates confirmed account and active team membership.
  const member=await fetch(base+'/rest/v1/rpc/claim_member',{method:'POST',headers,body:'{}'});if(!member.ok)return json({error:'Kein aktiver Teamzugang.'},403);
  const text=await req.text();if(text.length>18000000)return json({error:'Datei oder Eingabe zu gross.'},413);const envelope=JSON.parse(text),url=new URL(envelope.url,'https://offerten.local'),body=typeof envelope.body==='string'?JSON.parse(envelope.body):envelope.body;
  if(url.pathname==='/api/data'){
   if(envelope.method==='GET'){const [rows,settings]=await Promise.all([rest('catering_offers?select=payload&order=updated_at.desc'),rest('catering_settings?select=payload&id=eq.main')]);if(!settings?.[0])throw Error('Offertenkonfiguration fehlt.');return json({requests:rows.map((r:any)=>r.payload),config:settings[0].payload,catalog:settings[0].payload.products.filter((p:any)=>p.id.startsWith('ref-'))});}
   if(body?.action==='settings'){
    const c=body.value;if(!c||!Array.isArray(c.products)||c.products.length>1000||!Array.isArray(c.issuerProfiles)||c.issuerProfiles.length!==2||c.products.some((p:any)=>p.price!==null&&(!Number.isFinite(p.price)||p.price<0)||![0,2.6,8.1].includes(p.tax)))throw Error('Preisregeln prüfen.');
    await rest('catering_settings?on_conflict=id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'main',payload:c})});return json({ok:true});
   }
   if(body?.action==='request'){
    const q=body.value;if(!q?.id||!q.name||!q.email||!(q.guests>0&&q.guests<=100000)||!['fonduehuesli','soo'].includes(q.issuerProfile?.id)||!Array.isArray(q.items)||q.items.length>1000||q.items.some((i:any)=>!Number.isFinite(i.qty)||i.qty<0||i.price!==null&&(!Number.isFinite(i.price)||i.price<0)||![0,2.6,8.1].includes(i.tax)))throw Error('Absender, Kontakt, Gästezahl und Positionen prüfen.');q.updatedAt=new Date().toISOString();
    await rest('catering_offers?on_conflict=id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:q.id,payload:q,updated_at:q.updatedAt})});return json({ok:true,value:q});
   }
  }
  if(url.pathname==='/api/transport'){
   if(body.action==='search')return json({candidates:await searchDestinations(body.destination)});
   if(body.action==='route')return json(await roadRoute(body.destination,String(body.venueInput||'')));
  }
  if(url.pathname==='/api/inquiry-files'){
   if(envelope.method==='POST'){
    const f=envelope.file;if(!f||typeof f.name!=='string'||f.name.length>180||typeof f.base64!=='string'||f.base64.length>16800000)throw Error('Datei prüfen.');const bin=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));if(!bin.length||bin.length>12582912)throw Error('Maximal 12 MB pro Datei.');
    const ext=f.name.split('.').pop().toLowerCase(),types:any={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',txt:'text/plain'};if(!types[ext])throw Error('Dateityp nicht unterstützt.');const id=crypto.randomUUID(),path=id+'.'+ext,type=types[ext];
    const upload=await fetch(base+'/storage/v1/object/catering-inquiries/'+path,{method:'POST',headers:{apikey:key,Authorization:auth,'Content-Type':type},body:bin});if(!upload.ok)throw Error('Originaldatei konnte nicht gespeichert werden.');
    const record={id,name:f.name,type,size:bin.length,path};await rest('catering_attachments',{method:'POST',body:JSON.stringify(record)});return json({id,name:f.name,type,size:bin.length});
   }
   const id=url.searchParams.get('id');if(!/^[0-9a-f-]{36}$/.test(id||''))throw Error('Ungültige Datei.');const [file]=await rest('catering_attachments?select=*&id=eq.'+id);if(!file)return json({error:'Datei nicht gefunden.'},404);
   const r=await fetch(base+'/storage/v1/object/authenticated/catering-inquiries/'+file.path,{headers:{apikey:key,Authorization:auth}});if(!r.ok)throw Error('Originaldatei konnte nicht geladen werden.');const bytes=new Uint8Array(await r.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return json({binary:btoa(binary),type:file.type});
  }
  return json({error:'Nicht unterstützte Offertenaktion.'},400);
 }catch(e){return json({error:e instanceof Error?e.message:'Offertenaktion fehlgeschlagen.'},400);}
});
