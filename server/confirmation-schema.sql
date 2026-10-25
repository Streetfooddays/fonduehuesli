begin;
create table public.mail_confirmation_settings(id boolean primary key default true check(id),body text not null,signature text not null,subject text not null,updated timestamptz not null default now());
alter table public.mail_confirmation_settings enable row level security;
revoke all on public.mail_confirmation_settings from public,anon,authenticated;
grant select on public.mail_confirmation_settings to authenticated;
create policy confirmation_settings_read on public.mail_confirmation_settings for select to authenticated using((select private.member_role()) is not null);
insert into public.mail_confirmation_settings(id,body,signature,subject) values(true,E'Vielen Dank für deine Reservation, welche wir dir gerne bestätigen.\n\nWir freuen uns euch bald im Fonduehüsli auf dem Lindenhof zu begrüssen.',E'Liebe Grüsse\n\nSabrina\n\nFonduehüsli ein Projekt von\nSOO! Event & Catering GmbH\nTrottenstrasse 20\n8180 Bülach\n079/484 46 84','Deine Reservationsbestätigung · Fonduehüsli Bülach');
create table public.mail_outbox(
 id uuid primary key default gen_random_uuid(),reservation_id text not null unique references public.reservations(id),mail_id text references public.mail_inbox(id),
 recipient text not null,subject text not null,message_text text not null,message_html text not null,
 state text not null default 'pending' check(state in ('pending','failed','sent')),provider_id text,created timestamptz not null default now(),sent_at timestamptz,last_error text not null default '',lease_until timestamptz,created_by uuid not null references auth.users(id)
);
alter table public.mail_outbox enable row level security;
revoke all on public.mail_outbox from public,anon,authenticated;
grant select on public.mail_outbox to authenticated;
grant all on public.mail_outbox to service_role;
create policy confirmation_outbox_read on public.mail_outbox for select to authenticated using((select private.member_role()) is not null);

create function private.confirmation_settings_save(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
 if auth.uid() is null or private.member_role()<>'owner' or private.member_role() is null then raise exception 'Nur die Administration darf die Vorlage ändern.' using errcode='42501';end if;
 if length(trim(coalesce(p->>'body','')))=0 or length(p->>'body')>12000 or length(p->>'signature')>4000 or length(trim(coalesce(p->>'subject','')))=0 or length(p->>'subject')>200 or (p->>'subject') ~ E'[\r\n]' then raise exception 'Vorlage prüfen.';end if;
 update public.mail_confirmation_settings set body=p->>'body',signature=coalesce(p->>'signature',''),subject=p->>'subject',updated=now() where id=true;
 return '{"ok":true}';
end $fn$;
create function public.confirmation_settings_save(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.confirmation_settings_save(p)$fn$;
revoke all on function private.confirmation_settings_save(jsonb),public.confirmation_settings_save(jsonb) from public,anon;
grant execute on function private.confirmation_settings_save(jsonb),public.confirmation_settings_save(jsonb) to authenticated;

-- Preserve reviewed forms of address; hold pending mail snapshots against concurrent edits.
do $patch$ declare d text;begin
 select pg_get_functiondef('private.save_reservation(jsonb)'::regprocedure) into d;
 d:=replace(d,'''company'',''menu'']','''company'',''menu'',''salutation'']');
 d:=replace(d,' select coalesce(sum(people),0) into n',E' if exists(select 1 from public.mail_outbox where reservation_id=rid and state<>''sent'') then raise exception ''Bestätigung ist für den Versand vorgemerkt. Zuerst den Versand abschliessen.'';end if;\n if (r->>''gondola'')::boolean and rs=''Bestätigt'' and (select count(*) from public.reservations where date=rd and id<>rid and gondola=1 and status=''Bestätigt'' and (period=per or period=''ungeklaert'' or per=''ungeklaert''))>=3 then raise exception ''Alle drei Gondeln sind für diesen Mittag / Abend bereits reserviert.'';end if;\n select coalesce(sum(people),0) into n');
 execute d;
end $patch$;

create function private.confirmation_prepare(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r jsonb:=p->'reservation';m public.mail_inbox;result jsonb;booking public.reservations;o public.mail_outbox;rid text;mid text:=nullif(p->>'mail_id','');
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 if mid is not null then
  select * into m from public.mail_inbox where id=mid for update;
  if m.id is null then raise exception 'Mail nicht gefunden.';end if;
  if m.reservation_id is null then r:=(r-array['id','createId','revision'])||jsonb_build_object('createId','mail-'||m.id);
  else r:=(r-'createId')||jsonb_build_object('id',m.reservation_id);end if;
 end if;
 rid:=coalesce(nullif(r->>'id',''),nullif(r->>'createId',''));
 select * into o from public.mail_outbox where reservation_id=rid;
 if o.id is not null then return to_jsonb(o);end if;
 if coalesce((p->>'recipient_reviewed')::boolean,false) is not true then raise exception 'Bitte die Empfängeradresse prüfen.';end if;
 if length(trim(coalesce(r->'data'->>'first','')))=0 or coalesce(r->'data'->>'salutation','') not in ('Liebe','Lieber') or coalesce(r->>'time','')='' then raise exception 'Vorname, Anrede und Uhrzeit ergänzen.';end if;
 if jsonb_typeof(p->'message') is distinct from 'object' or lower(trim(coalesce(r->'data'->>'email',''))) is distinct from p->'message'->>'recipient' or length(coalesce(p->'message'->>'text',''))<10 or length(p->'message'->>'text')>20000 or length(p->'message'->>'html')>60000 or length(coalesce(p->'message'->>'subject',''))=0 or length(p->'message'->>'subject')>200 then raise exception 'Empfänger und Mailtext prüfen.';end if;
 r:=r||'{"status":"Bestätigt"}';
 result:=private.save_reservation(jsonb_build_object('action','save','reservation',r));
 select * into booking from public.reservations where id=result->>'id';
 if lower(trim((booking.data::jsonb)->>'email')) is distinct from p->'message'->>'recipient' then raise exception 'Empfänger stimmt nicht mit der Reservation überein.';end if;
 if mid is not null then update public.mail_inbox set reservation_id=booking.id,state='imported',updated=now() where id=mid;end if;
 insert into public.mail_outbox(reservation_id,mail_id,recipient,subject,message_text,message_html,created_by)
 values(booking.id,mid,p->'message'->>'recipient',p->'message'->>'subject',p->'message'->>'text',p->'message'->>'html',auth.uid()) returning * into o;
 return to_jsonb(o);
end $fn$;
create function public.confirmation_prepare(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.confirmation_prepare(p)$fn$;
revoke all on function private.confirmation_prepare(jsonb),public.confirmation_prepare(jsonb) from public,anon;
grant execute on function private.confirmation_prepare(jsonb),public.confirmation_prepare(jsonb) to authenticated;

-- Retry only the frozen original. Resend deduplicates this UUID for 24 hours.
create function private.confirmation_retry(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare o public.mail_outbox;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 select * into o from public.mail_outbox where id=(p->>'id')::uuid;
 if o.id is null then raise exception 'Versand nicht gefunden.';end if;return to_jsonb(o);
end $fn$;
create function public.confirmation_retry(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.confirmation_retry(p)$fn$;
revoke all on function private.confirmation_retry(jsonb),public.confirmation_retry(jsonb) from public,anon;
grant execute on function private.confirmation_retry(jsonb),public.confirmation_retry(jsonb) to authenticated;

create function private.confirmation_delivery(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare o public.mail_outbox;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 select * into o from public.mail_outbox where id=(p->>'id')::uuid for update;
 if o.id is null then raise exception 'Versand nicht gefunden.';end if;
 if o.state='sent' then return to_jsonb(o);end if;
 if p->>'action'='claim' then
  if o.created<now()-interval '23 hours' then raise exception 'Versandstatus unklar: Bitte zuerst in Resend prüfen. Keine erneute automatische Sendung nach 23 Stunden.';end if;
  if o.lease_until>now() then raise exception 'Versand läuft bereits. Bitte kurz warten und aktualisieren.';end if;
  update public.mail_outbox set lease_until=now()+interval '60 seconds',last_error='' where id=o.id returning * into o;
 elsif p->>'action'='sent' then
  if coalesce(p->>'provider_id','')='' then raise exception 'Versand-ID fehlt.';end if;
  update public.mail_outbox set state='sent',provider_id=p->>'provider_id',sent_at=now(),lease_until=null,last_error='' where id=o.id returning * into o;
  update public.mail_inbox set state='confirmed',updated=now() where id=o.mail_id;
 elsif p->>'action'='failed' then
  update public.mail_outbox set state='failed',last_error=left(coalesce(p->>'error','Versand fehlgeschlagen.'),1000),lease_until=null where id=o.id returning * into o;
 else raise exception 'Aktion prüfen.';end if;
 return to_jsonb(o);
end $fn$;
create function public.confirmation_delivery(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.confirmation_delivery(p)$fn$;
revoke all on function private.confirmation_delivery(jsonb),public.confirmation_delivery(jsonb) from public,anon,authenticated;
grant execute on function private.confirmation_delivery(jsonb),public.confirmation_delivery(jsonb) to service_role;

create function private.confirmation_hold() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if exists(select 1 from public.mail_outbox where reservation_id=old.id and state<>'sent') then raise exception 'Bestätigung ist für den Versand vorgemerkt. Zuerst den Versand abschliessen.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $fn$;
revoke all on function private.confirmation_hold() from public,anon,authenticated;
create trigger confirmation_hold before update or delete on public.reservations for each row execute function private.confirmation_hold();
commit;
