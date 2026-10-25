import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {parseMail,htmlText,verifySignature} from './mail-core.mjs';
const ORIGIN='https://fonduehuesli-reservationen.onrender.com';
const RECIPIENT='reservation@uesheuante.resend.app';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const answer=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const endpoint=url+'/functions/v1/resend-mail';
async function rpc(name:string,p?:unknown){const {data,error}=await admin.rpc(name,p);if(error)throw Error('Daten konnten nicht gespeichert werden.');return data;}
async function api(key:string,path:string,method='GET',body?:unknown){
 const r=await fetch('https://api.resend.com'+path,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error(r.status===401||r.status===403?'Resend-Schlüssel oder Berechtigungen prüfen.':'Resend ist momentan nicht erreichbar. Bitte erneut versuchen.');return r.json();
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return answer({error:'Methode nicht erlaubt.'},405);
 const isWebhook=!!req.headers.get('svix-id');
 try{
  if(isWebhook){
   const raw=await req.text();if(raw.length>100000)return answer({error:'Ereignis zu gross.'},413);
   const c=await rpc('mail_credentials');if(!c?.enabled)return answer({error:'Maileingang ist nicht eingerichtet.'},503);
   if(!await verifySignature(raw,req.headers,c.signing_secret))return answer({error:'Ungültige Signatur.'},401);
   const event=JSON.parse(raw);if(event.type!=='email.received')return answer({ok:true,ignored:true});
   const id=event.data?.email_id;if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))return answer({error:'Ungültige Mail-ID.'},400);
   const mail=await api(c.api_key,'/emails/receiving/'+id+'?html_format=cid');
   const recipients=[...(mail.to||[]),...(mail.received_for||[])].map((x:string)=>x.toLowerCase());
   if(!recipients.some((s:string)=>s===RECIPIENT||s.includes('<'+RECIPIENT+'>')))return answer({ok:true,ignored:true});
   const fullText=String(mail.text||htmlText(mail.html||''));const text=fullText.slice(0,60000);const parsed=parseMail(text);
   if(fullText.length>60000){parsed.issues.push('Mailtext gekürzt: Originalmail im Postfach prüfen.');parsed.complete=false;}
   if((mail.attachments||[]).some((a:any)=>a.content_disposition!=='inline')){parsed.issues.push('Anhänge im Originalpostfach prüfen.');parsed.complete=false;}
   if(/\b(storn|absage|änderung|aenderung|verschieb|annull)/i.test(mail.subject||'')){parsed.issues.push('Betreff weist auf eine Änderung oder Stornierung hin.');parsed.complete=false;}
   const result=await rpc('mail_ingest',{p:{id,message_id:String(mail.message_id||''),sender:String(mail.from||''),subject:String(mail.subject||''),body:text,...parsed}});
   return answer(result);
  }
  const jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!jwt)return answer({error:'Bitte anmelden.'},401);
  const {data:{user},error}=await admin.auth.getUser(jwt);if(error||!user?.email_confirmed_at)return answer({error:'Bitte erneut anmelden.'},401);
  const {data:member}=await admin.from('team_members').select('role,active').eq('user_id',user.id).maybeSingle();if(!member?.active||member.role!=='owner')return answer({error:'Nur die Administration darf die Mailverbindung einrichten.'},403);
  const text=await req.text();if(text.length>4000)return answer({error:'Eingabe zu gross.'},413);const body=JSON.parse(text);
  const c=await rpc('mail_credentials');
  if(body.action==='status')return answer({configured:!!c?.enabled,recipient:RECIPIENT,endpoint,updated:c?.updated||null});
  if(body.action!=='connect'||typeof body.apiKey!=='string'||!/^re_[A-Za-z0-9_-]{8,}$/.test(body.apiKey))return answer({error:'Bitte einen gültigen Resend API-Schlüssel eingeben.'},400);
  const key=body.apiKey;await api(key,'/emails/receiving?limit=1');
  const hooks=await api(key,'/webhooks');let hook=(hooks.data||[]).find((h:any)=>h.endpoint===endpoint);
  if(hook){hook=await api(key,'/webhooks/'+hook.id);if(hook.status==='disabled')throw Error('Bitte den bestehenden Webhook in Resend aktivieren.');if(!hook.events?.includes('email.received'))throw Error('Bitte beim bestehenden Webhook email.received aktivieren.');}
  else hook=await api(key,'/webhooks','POST',{endpoint,events:['email.received']});
  if(!hook.signing_secret||!hook.id)throw Error('Die Resend-Verbindung konnte nicht vollständig eingerichtet werden.');
  await rpc('mail_store_config',{p:{api_key:key,signing_secret:hook.signing_secret,webhook_id:hook.id,recipient:RECIPIENT}});
  return answer({ok:true,configured:true,recipient:RECIPIENT});
 }catch(err){return answer({error:err instanceof Error&&/Resend|Schlüssel|Webhook|gespeichert/.test(err.message)?err.message:'Verarbeitung fehlgeschlagen. Bitte erneut versuchen.'},500);}
});
