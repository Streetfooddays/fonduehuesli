import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {messages,validateDraft} from './send-core.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const endpoint=url+'/functions/v1/newsletter-mail';
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'https://fonduehuesli-reservationen.onrender.com','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const answer=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
async function checked(q:any){const {data,error}=await q;if(error)throw Error(error.message);return data;}
async function summary(){
 const campaigns=await checked(admin.from('newsletter_campaigns').select('id,subject,created_at,is_test').order('created_at',{ascending:false}).limit(30));
 const ids=campaigns.map((c:any)=>c.id);
 const batches=ids.length?await checked(admin.from('newsletter_batches').select('campaign_id,state,recipients,last_error').in('campaign_id',ids)):[];
 const unsubscribed=await checked(admin.from('newsletter_subscriptions').select('email').not('unsubscribed_at','is',null));
 return {campaigns:campaigns.map((c:any)=>{const bs=batches.filter((b:any)=>b.campaign_id===c.id);return {...c,total:bs.reduce((s:number,b:any)=>s+b.recipients.length,0),accepted:bs.filter((b:any)=>b.state==='sent').reduce((s:number,b:any)=>s+b.recipients.length,0),open:bs.filter((b:any)=>['pending','failed','sending'].includes(b.state)).length,error:bs.find((b:any)=>b.last_error)?.last_error||null};}),unsubscribed:unsubscribed.map((s:any)=>s.email)};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 try{
 const requestURL=new URL(req.url);
 if(requestURL.pathname.endsWith('/unsubscribe')){
  const params=req.method==='POST'?new URLSearchParams(await req.text()):null;
  const token=requestURL.searchParams.get('token')||params?.get('token')||'';
  if(!/^[0-9a-f-]{36}$/i.test(token))return new Response('Ungültiger Abmeldelink.',{status:400});
  if(req.method==='POST'){
   await checked(admin.from('newsletter_subscriptions').update({unsubscribed_at:new Date().toISOString()}).eq('token',token));
   return new Response('<!doctype html><html lang="de"><meta charset="utf-8"><title>Newsletter abgemeldet</title><h1>Du bist abgemeldet.</h1><p>Du erhältst keine weiteren Fonduehüsli-Newsletter über dieses Tool.</p></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }
  if(req.method!=='GET')return new Response('Methode nicht erlaubt.',{status:405});
  return new Response('<!doctype html><html lang="de"><meta charset="utf-8"><title>Newsletter abbestellen</title><h1>Fonduehüsli-Newsletter abbestellen</h1><form method="post"><input type="hidden" name="token" value="'+token+'"><button>Jetzt abmelden</button></form></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"}});
 }
 if(req.method!=='POST')return answer({error:'Methode nicht erlaubt.'},405);
 const jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!jwt)return answer({error:'Bitte anmelden.'},401);
 const {data:{user},error}=await admin.auth.getUser(jwt);if(error||!user?.email_confirmed_at)return answer({error:'Bitte erneut anmelden.'},401);
 const member=await checked(admin.from('team_members').select('active,role,email').eq('user_id',user.id).maybeSingle());
 if(!member?.active||!(member.role==='owner'||member.email==='reservation@fonduehuesli.ch'))return answer({error:'Kein Newsletterzugriff.'},403);
 const raw=await req.text();if(raw.length>70000)return answer({error:'Eingabe zu gross.'},413);const body=JSON.parse(raw);
 if(body.action==='status')return answer(await summary());
 if(body.action==='prepare'||body.action==='test'){
  if(!/^[0-9a-f-]{36}$/i.test(body.id))throw Error('Versand-ID fehlt.');
  if(body.action==='test'){
   validateDraft(body.draft);
   if(!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(body.recipient||''))throw Error('Testadresse prüfen.');
  }else{
   if(body.reviewed!==true)throw Error('Inhalt und Empfänger bitte prüfen.');
   const ws=await checked(admin.from('newsletter_workspace').select('draft').eq('id',true).single());validateDraft(ws.draft);
  }
  const id=await checked(admin.rpc('newsletter_create',{p:{id:body.id,user_id:user.id,revision:body.revision,test:body.action==='test',draft:body.draft,recipient:body.recipient?.toLowerCase()}}));
  return answer({id,...await summary()});
 }
 if(body.action!=='send')return answer({error:'Aktion prüfen.'},400);
 const c=await checked(admin.rpc('mail_credentials'));if(!c?.enabled)throw Error('Resend ist nicht verbunden.');
 const batch=await checked(admin.rpc('newsletter_claim',{p_id:body.id}));
 if(!batch)return answer(await summary());
 if(!batch.recipients.length)return answer(await summary());
 let result;
 try{
 const response=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{Authorization:'Bearer '+c.api_key,'Content-Type':'application/json','Idempotency-Key':'fh-newsletter/'+batch.id},body:JSON.stringify(messages(batch,endpoint)),signal:AbortSignal.timeout(12000)});
 result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(response.status===429?'Resend-Limit erreicht. Versand pausiert; später fortsetzen.':response.status===401||response.status===403?'Resend: Versandberechtigung und Absenderdomain prüfen.':'Resend hat die Gruppe nicht angenommen. Versand pausiert (HTTP '+response.status+').');
 if(!Array.isArray(result.data)||result.data.length!==batch.recipients.length||result.data.some((r:any)=>!r.id))throw Error('Resend-Rückmeldung unklar. Gleiche Gruppe sicher erneut prüfen.');
 }catch(err){
 const message=err instanceof Error?err.message:'Verbindung fehlgeschlagen.';
 await checked(admin.from('newsletter_batches').update({state:'failed',last_error:message,lease_until:null}).eq('id',batch.id));
 return answer({error:message},502);
 }
 await checked(admin.from('newsletter_batches').update({state:'sent',provider_result:result,lease_until:null,last_error:null}).eq('id',batch.id));
 return answer(await summary());
 }catch(err){return answer({error:err instanceof Error?err.message:'Newsletter konnte nicht verarbeitet werden.'},400);}
});
