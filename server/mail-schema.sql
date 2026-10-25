begin;
grant usage on schema private to service_role;
create table private.mail_connection (
 id text primary key check(id='resend'), api_secret uuid not null references vault.secrets(id),
 signing_secret uuid not null references vault.secrets(id), recipient text not null,
 webhook_id text not null, enabled boolean not null default true, updated timestamptz not null default now()
);
alter table private.mail_connection enable row level security;
revoke all on private.mail_connection from public,anon,authenticated;
create table public.mail_inbox (
 id text primary key, message_id text not null default '', sender text not null,
 subject text not null, body text not null, draft jsonb not null default '{}',
 issues jsonb not null default '[]', state text not null check(state in ('review','imported','ignored')),
 reservation_id text references public.reservations(id), received_at timestamptz not null default now(),
 updated timestamptz not null default now()
);
create unique index mail_inbox_message on public.mail_inbox(message_id) where message_id<>'';
alter table public.mail_inbox enable row level security;
revoke all on public.mail_inbox from public,anon,authenticated;
grant select on public.mail_inbox to authenticated;
grant all on public.mail_inbox to service_role;
create policy mail_team_read on public.mail_inbox for select to authenticated using ((select private.member_role()) is not null);

create function private.mail_credentials() returns jsonb language plpgsql security definer set search_path='' as $fn$
declare c private.mail_connection;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 select * into c from private.mail_connection where id='resend';
 if c.id is null then return null;end if;
 return jsonb_build_object('api_key',(select decrypted_secret from vault.decrypted_secrets where id=c.api_secret),
 'signing_secret',(select decrypted_secret from vault.decrypted_secrets where id=c.signing_secret),
 'recipient',c.recipient,'webhook_id',c.webhook_id,'enabled',c.enabled,'updated',c.updated);
end $fn$;
create function public.mail_credentials() returns jsonb language sql set search_path='' as $fn$select private.mail_credentials()$fn$;
revoke all on function private.mail_credentials(), public.mail_credentials() from public,anon,authenticated;
grant execute on function private.mail_credentials(), public.mail_credentials() to service_role;

create function private.mail_store_config(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a uuid; s uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 if length(p->>'api_key')<10 or length(p->>'api_key')>500 or left(p->>'signing_secret',6)<>'whsec_' or p->>'recipient'<>'reservation@uesheuante.resend.app' then raise exception 'Verbindungsdaten prüfen.';end if;
 select api_secret,signing_secret into a,s from private.mail_connection where id='resend' for update;
 if a is null then
  a:=vault.create_secret(p->>'api_key','fondue_resend_api','Reservationsbuch Maileingang');
  s:=vault.create_secret(p->>'signing_secret','fondue_resend_webhook','Reservationsbuch Signatur');
 else
  perform vault.update_secret(a,p->>'api_key');perform vault.update_secret(s,p->>'signing_secret');
 end if;
 insert into private.mail_connection(id,api_secret,signing_secret,recipient,webhook_id) values('resend',a,s,p->>'recipient',p->>'webhook_id')
 on conflict(id) do update set webhook_id=excluded.webhook_id,enabled=true,updated=now();
 return '{"ok":true}'::jsonb;
end $fn$;
create function public.mail_store_config(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.mail_store_config(p)$fn$;
revoke all on function private.mail_store_config(jsonb),public.mail_store_config(jsonb) from public,anon,authenticated;
grant execute on function private.mail_store_config(jsonb),public.mail_store_config(jsonb) to service_role;

create function private.mail_ingest(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare rid text; d jsonb:=p->'draft'; dt date; tm text; n integer; per text; safe boolean:=false; existing public.mail_inbox; issues jsonb:=coalesce(p->'issues','[]');
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into existing from public.mail_inbox where id=p->>'id' or (message_id<>'' and message_id=p->>'message_id') limit 1;
 if existing.id is not null then return jsonb_build_object('ok',true,'duplicate',true,'reservation_id',existing.reservation_id);end if;
 if length(p->>'id')>70 or length(p->>'body')>60000 or jsonb_typeof(d)<>'object' then raise exception 'Maildaten prüfen.';end if;
 if coalesce((p->>'complete')::boolean,false) then
  dt:=(d->>'date')::date;tm:=d->>'time';n:=(d->>'people')::integer;
  safe:=dt is not null and tm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and n between 1 and 1000 and (coalesce(d->'data'->>'last','')<>'' or coalesce(d->'data'->>'first','')<>'');
  if safe and exists(select 1 from public.reservations where date=dt and time=tm and people=n and status<>'Storniert' and lower(coalesce(data::jsonb->>'last',''))=lower(coalesce(d->'data'->>'last','')) and lower(coalesce(data::jsonb->>'first',''))=lower(coalesce(d->'data'->>'first',''))) then safe:=false;issues:=issues||jsonb_build_array('Mögliche Doppelreservation: Name, Datum, Uhrzeit und Personenzahl sind bereits vorhanden.');end if;
  if safe then
   rid:='mail-'||(p->>'id');per:=case when tm<'16:00' then 'mittag' else 'abend' end;
   insert into public.reservations(id,date,time,period,people,data,status,source,reason,note)
   values(rid,dt,tm,per,n,(coalesce(d->'data','{}')||jsonb_build_object('date',dt,'time',tm,'people',n::text))::text,'Offen','E-Mail','Aus E-Mail übernommen; manuell prüfen',left('Maileingang: '||(p->>'subject'),1000));
  end if;
 end if;
 insert into public.mail_inbox(id,message_id,sender,subject,body,draft,issues,state,reservation_id)
 values(p->>'id',coalesce(p->>'message_id',''),left(p->>'sender',1000),left(p->>'subject',1000),p->>'body',d,issues,case when rid is null then 'review' else 'imported' end,rid);
 return jsonb_build_object('ok',true,'reservation_id',rid);
end $fn$;
create function public.mail_ingest(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.mail_ingest(p)$fn$;
revoke all on function private.mail_ingest(jsonb),public.mail_ingest(jsonb) from public,anon,authenticated;
grant execute on function private.mail_ingest(jsonb),public.mail_ingest(jsonb) to service_role;

create function private.mail_review(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare m public.mail_inbox; result jsonb; r jsonb;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into m from public.mail_inbox where id=p->>'id' for update;
 if m.id is null then raise exception 'Mail nicht gefunden.';end if;
 if m.reservation_id is not null then return jsonb_build_object('ok',true,'id',m.reservation_id);end if;
 if p->>'action'='ignore' then
  update public.mail_inbox set state='ignored',updated=now() where id=m.id;return '{"ok":true}'::jsonb;
 end if;
 if p->>'action'<>'convert' then raise exception 'Aktion prüfen.';end if;
 r:=(p->'reservation')-array['id','createId','revision'];r:=r||jsonb_build_object('createId','mail-'||m.id);
 result:=private.save_reservation(jsonb_build_object('action','save','reservation',r));
 update public.reservations set source='E-Mail',reason='E-Mail manuell geprüft' where id=result->>'id';
 update public.mail_inbox set state='imported',reservation_id=result->>'id',updated=now() where id=m.id;
 return result;
end $fn$;
create function public.mail_review(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.mail_review(p)$fn$;
revoke all on function private.mail_review(jsonb),public.mail_review(jsonb) from public,anon;
grant execute on function private.mail_review(jsonb),public.mail_review(jsonb) to authenticated;
commit;
