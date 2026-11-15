begin;
-- Standalone answers never reference or mutate a reservation.
create table public.mail_replies(
 id uuid primary key,mail_id text not null references public.mail_inbox(id),recipient text not null,subject text not null,message_text text not null,message_html text not null,in_reply_to text not null default '',
 state text not null default 'pending' check(state in ('pending','sending','failed','sent')),created timestamptz not null default now(),sent_at timestamptz,lease_until timestamptz,provider_id text,last_error text not null default '',created_by uuid not null references auth.users(id)
);
create index mail_replies_mail_created on public.mail_replies(mail_id,created desc);
alter table public.mail_replies enable row level security;
revoke all on public.mail_replies from public,anon,authenticated;
grant select on public.mail_replies to authenticated;
grant all on public.mail_replies to service_role;
create policy mail_replies_team_read on public.mail_replies for select to authenticated using((select private.member_role()) is not null);
create function private.mail_reply_prepare(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare m public.mail_inbox;r public.mail_replies;msg jsonb:=p->'message';rid uuid:=(p->>'id')::uuid;ref text;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 if rid is null then raise exception 'Antwort-ID fehlt.';end if;
 perform pg_advisory_xact_lock(922002672);
 select * into r from public.mail_replies where id=rid for update;
 if r.id is not null then
  if r.mail_id is distinct from p->>'mail_id' or r.created_by<>auth.uid() then raise exception 'Antwort-ID bereits verwendet.';end if;
  if r.state<>'sent' and (r.recipient is distinct from msg->>'recipient' or r.subject is distinct from msg->>'subject' or r.message_text is distinct from msg->>'text' or r.message_html is distinct from msg->>'html') then raise exception 'Diese Antwort wurde bereits gespeichert. Bitte die gespeicherte Antwort erneut senden.';end if;
  return to_jsonb(r);
 end if;
 select * into m from public.mail_inbox where id=p->>'mail_id';if m.id is null then raise exception 'Mail nicht gefunden.';end if;
 if p->'recipient_reviewed' is distinct from 'true'::jsonb then raise exception 'Empfängeradresse prüfen.';end if;
 if jsonb_typeof(msg) is distinct from 'object' or coalesce(msg->>'recipient','') !~ '^[^[:space:]@<>;,]+@[^[:space:]@<>;,]+[.][^[:space:]@<>;,]+$' or length(msg->>'recipient')>254 then raise exception 'Empfängeradresse prüfen.';end if;
 if length(btrim(coalesce(msg->>'subject','')))=0 or length(msg->>'subject')>200 or (msg->>'subject')~E'[\r\n]' or length(btrim(coalesce(msg->>'text','')))<3 or length(msg->>'text')>20000 or length(coalesce(msg->>'html',''))>60000 then raise exception 'Antworttext oder Betreff prüfen.';end if;
 ref:=case when length(coalesce(m.message_id,''))<=998 and m.message_id~'^<[^[:space:]<>]+@[^[:space:]<>]+>$' then m.message_id else '' end;
 insert into public.mail_replies(id,mail_id,recipient,subject,message_text,message_html,in_reply_to,created_by) values(rid,m.id,lower(trim(msg->>'recipient')),msg->>'subject',msg->>'text',msg->>'html',ref,auth.uid()) returning * into r;
 return to_jsonb(r);
end $fn$;
create function public.mail_reply_prepare(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.mail_reply_prepare(p)$fn$;
create function private.mail_reply_retry(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r public.mail_replies;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 select * into r from public.mail_replies where id=(p->>'id')::uuid;if r.id is null then raise exception 'Antwort nicht gefunden.';end if;
 return to_jsonb(r);
end $fn$;
create function public.mail_reply_retry(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.mail_reply_retry(p)$fn$;
revoke all on function private.mail_reply_prepare(jsonb),public.mail_reply_prepare(jsonb),private.mail_reply_retry(jsonb),public.mail_reply_retry(jsonb) from public,anon;
grant execute on function private.mail_reply_prepare(jsonb),public.mail_reply_prepare(jsonb),private.mail_reply_retry(jsonb),public.mail_reply_retry(jsonb) to authenticated;
create function private.mail_reply_delivery(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r public.mail_replies;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 select * into r from public.mail_replies where id=(p->>'id')::uuid for update;if r.id is null then raise exception 'Antwort nicht gefunden.';end if;
 if r.state='sent' then return to_jsonb(r);end if;
 if p->>'action'='claim' then
  if r.created<now()-interval '23 hours' then raise exception 'Versandstatus zuerst in Resend prüfen. Kein erneuter Versand nach 23 Stunden.';end if;
  if r.lease_until>now() then raise exception 'Antwortversand läuft bereits. Bitte kurz warten.';end if;
  update public.mail_replies set state='sending',lease_until=now()+interval '90 seconds',last_error='' where id=r.id returning * into r;
 elsif p->>'action'='failed' then
  update public.mail_replies set state='failed',lease_until=null,last_error=left(coalesce(p->>'error','Versand fehlgeschlagen.'),1000) where id=r.id returning * into r;
 elsif p->>'action'='sent' then
  if btrim(coalesce(p->>'provider_id',''))='' then raise exception 'Versand-ID fehlt.';end if;
  update public.mail_replies set state='sent',provider_id=left(p->>'provider_id',200),sent_at=now(),lease_until=null,last_error='' where id=r.id returning * into r;
 else raise exception 'Aktion prüfen.';end if;
 return to_jsonb(r);
end $fn$;
create function public.mail_reply_delivery(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.mail_reply_delivery(p)$fn$;
revoke all on function private.mail_reply_delivery(jsonb),public.mail_reply_delivery(jsonb) from public,anon,authenticated;
grant execute on function private.mail_reply_delivery(jsonb),public.mail_reply_delivery(jsonb) to service_role;
commit;
