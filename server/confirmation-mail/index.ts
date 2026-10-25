import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {confirmationMessage,FROM} from './confirmation-core.mjs';
const ORIGIN='https://fonduehuesli-reservationen.onrender.com';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const answer=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
async function rpc(client:any,name:string,p?:unknown){const {data,error}=await client.rpc(name,p);if(error)throw Error(error.message);return data;}
async function resend(key:string,path:string,method='GET',body?:unknown,id?:string,attempt=0){
 const response=await fetch('https://api.resend.com'+path,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...(id?{'Idempotency-Key':'reservation-confirmation/'+id}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(response.status===429&&attempt<2){await new Promise(resolve=>setTimeout(resolve,Math.min(3000,Math.max(1000,Number(response.headers.get('retry-after')||1)*1000))));return resend(key,path,method,body,id,attempt+1);}
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(response.status===401||response.status===403?'Resend: Schlüssel, Versandberechtigung und Domainfreigabe prüfen.':response.status===429?'Resend-Versandlimit erreicht. Später erneut versuchen.':'Resend konnte die Bestätigung nicht annehmen. Versandstatus prüfen und erneut versuchen.');
 return result;
}
async function domainStatus(key:string){
 const result=await resend(key,'/domains');const domain=(result.data||[]).find((d:any)=>d.name==='fonduehuesli.ch');
 if(!domain)return {ready:false,status:'not_found',records:[]};
 const detail=await resend(key,'/domains/'+domain.id);
 return {ready:detail.status==='verified'&&detail.capabilities?.sending!=='disabled',status:detail.status,records:(detail.records||[]).filter((r:any)=>r.record==='DKIM'||r.record==='SPF').map((r:any)=>({type:r.type,name:r.name,value:r.value,priority:r.priority,status:r.status}))};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return answer({error:'Methode nicht erlaubt.'},405);
 try{
  const jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!jwt)return answer({error:'Bitte anmelden.'},401);
  const {data:{user},error}=await admin.auth.getUser(jwt);if(error||!user?.email_confirmed_at)return answer({error:'Bitte erneut anmelden.'},401);
  const {data:member}=await admin.from('team_members').select('active').eq('user_id',user.id).maybeSingle();if(!member?.active)return answer({error:'Kein Teamzugriff.'},403);
  const raw=await req.text();if(raw.length>30000)return answer({error:'Antwort ist zu lang.'},413);const body=JSON.parse(raw);
  const c=await rpc(admin,'mail_credentials');if(!c?.enabled)return answer({error:'Resend ist noch nicht verbunden.'},409);
  if(body.action==='status')return answer(await domainStatus(c.api_key));
  if(!['send','retry'].includes(body.action))return answer({error:'Aktion prüfen.'},400);
  // Check before changing a reservation or creating an outbox entry.
  const domain=await domainStatus(c.api_key);if(!domain.ready)return answer({error:'Versand noch nicht freigeschaltet: Die Domain fonduehuesli.ch muss in Resend per DNS verifiziert werden.',domain},409);
  const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+jwt}},auth:{persistSession:false,autoRefreshToken:false}});
  let outbox;
  if(body.action==='retry')outbox=await rpc(client,'confirmation_retry',{p:{id:body.id}});
  else {
   if(body.recipient_reviewed!==true)return answer({error:'Bitte die E-Mail-Adresse des Gastes prüfen.'},400);
   const message=confirmationMessage({reservation:body.reservation,body:body.body,signature:body.signature,subject:body.subject});
   outbox=await rpc(client,'confirmation_prepare',{p:{reservation:body.reservation,mail_id:body.mail_id,recipient_reviewed:true,message}});
  }
  if(outbox.state==='sent')return answer({ok:true,already_sent:true,id:outbox.id});
  outbox=await rpc(admin,'confirmation_delivery',{p:{id:outbox.id,action:'claim'}});
  if(outbox.state==='sent')return answer({ok:true,already_sent:true,id:outbox.id});
  let sent;
  try{sent=await resend(c.api_key,'/emails','POST',{from:FROM,to:[outbox.recipient],reply_to:'reservation@fonduehuesli.ch',subject:outbox.subject,text:outbox.message_text,html:outbox.message_html},outbox.id);if(!sent.id)throw Error('Resend hat keine Versand-ID zurückgegeben.');}
  catch(error){await rpc(admin,'confirmation_delivery',{p:{id:outbox.id,action:'failed',error:error instanceof Error?error.message:'Versand fehlgeschlagen.'}});return answer({error:'Reservation ist bestätigt, aber die Mail wurde nicht als versendet verbucht. Im Bereich «Versand offen» erneut versuchen.',outbox_id:outbox.id},502);}
  // If this final DB operation fails, keep the lease. Retrying uses the identical idempotency key.
  await rpc(admin,'confirmation_delivery',{p:{id:outbox.id,action:'sent',provider_id:sent.id}});
  return answer({ok:true,id:outbox.id});
 }catch(err){return answer({error:err instanceof Error?err.message:'Bestätigung fehlgeschlagen. Bitte aktualisieren und Versandstatus prüfen.'},400);}
});
