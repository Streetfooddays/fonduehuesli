import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {hellotessShift} from './core.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const answer=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return answer({error:'Methode nicht erlaubt.'},405);
 try{
  const key=req.headers.get('x-fonduehuesli-key');if(!key||key.length>256)return answer({error:'Nicht autorisiert.'},401);
  const {data:config,error}=await admin.rpc('hellotess_revenue_config');if(error||!config?.enabled)return answer({error:'Import noch nicht bereit.'},503);
  if(await hash(key)!==config.key_hash)return answer({error:'Nicht autorisiert.'},401);
  const raw=await req.text();if(raw.length>4000000)return answer({error:'Abschlussmeldung zu gross.'},413);
  const parsed=hellotessShift(JSON.parse(raw),config);if(parsed.ignored)return answer({ok:true,ignored:parsed.ignored});
  if(new URL(req.url).searchParams.get('validate')==='1')return answer({ok:true,validation_only:true,date:parsed.date,revenue:parsed.cents/100,room_count:parsed.rooms.length});
  const {data:result,error:writeError}=await admin.rpc('import_hellotess_revenue',{p:parsed});if(writeError)return answer({error:'Umsatz konnte nicht verbucht werden. Bitte Importstatus prüfen.'},503);
  return answer({ok:true,...result});
 }catch{return answer({error:'Abschlussdaten konnten nicht verarbeitet werden.'},400);}
});
