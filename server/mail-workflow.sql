begin;
alter table public.reservations drop constraint reservations_status_check;
alter table public.reservations add constraint reservations_status_check check(status in ('Offen','Rückfrage nötig','Bestätigt','Storniert'));
alter table public.mail_inbox drop constraint mail_inbox_state_check;
alter table public.mail_inbox add constraint mail_inbox_state_check check(state in ('review','imported','question','confirmed','ignored'));
alter table public.mail_inbox add column followup_note text not null default '';

do $update$ declare d text; a text:='rs not in (''Offen'',''Bestätigt'',''Storniert'')';begin
 select pg_get_functiondef('private.save_reservation(jsonb)'::regprocedure) into d;
 if position(a in d)=0 then raise exception 'Expected status validation missing';end if;
 execute replace(d,a,'rs not in (''Offen'',''Rückfrage nötig'',''Bestätigt'',''Storniert'')');
end $update$;

create or replace function private.mail_ingest(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare rid text;d jsonb:=p->'draft';dt date;tm text;n integer;per text;safe boolean:=false;existing public.mail_inbox;issues jsonb:=coalesce(p->'issues','[]');
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into existing from public.mail_inbox where id=p->>'id' or (message_id<>'' and message_id=p->>'message_id') limit 1;
 if existing.id is not null then return jsonb_build_object('ok',true,'duplicate',true,'reservation_id',existing.reservation_id);end if;
 if length(p->>'id')>70 or length(p->>'body')>60000 or jsonb_typeof(d)<>'object' then raise exception 'Maildaten prüfen.';end if;
 if coalesce((p->>'candidate')::boolean,(p->>'complete')::boolean,false) then
  dt:=nullif(d->>'date','')::date;tm:=coalesce(d->>'time','');n:=(d->>'people')::integer;
  safe:=dt is not null and (tm='' or tm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and n between 1 and 1000 and (coalesce(d->'data'->>'last','')<>'' or coalesce(d->'data'->>'first','')<>'');
  if safe and exists(select 1 from public.reservations where date=dt and time=tm and people=n and status<>'Storniert' and lower(coalesce(data::jsonb->>'last',''))=lower(coalesce(d->'data'->>'last','')) and lower(coalesce(data::jsonb->>'first',''))=lower(coalesce(d->'data'->>'first',''))) then safe:=false;issues:=issues||jsonb_build_array('Mögliche Doppelreservation: Name, Datum, Uhrzeit und Personenzahl sind bereits vorhanden.');end if;
  if safe then
   rid:='mail-'||(p->>'id');per:=case when tm='' then 'ungeklaert' when tm<'16:00' then 'mittag' else 'abend' end;
   insert into public.reservations(id,date,time,period,people,data,status,source,reason,note)
   values(rid,dt,tm,per,n,(coalesce(d->'data','{}')||jsonb_build_object('date',dt,'time',tm,'people',n::text))::text,'Offen','E-Mail','Vorläufig aus E-Mail erfasst',left('Maileingang: '||(p->>'subject'),1000));
  end if;
 end if;
 insert into public.mail_inbox(id,message_id,sender,subject,body,draft,issues,state,reservation_id)
 values(p->>'id',coalesce(p->>'message_id',''),left(p->>'sender',1000),left(p->>'subject',1000),p->>'body',d,issues,case when rid is null then 'review' else 'imported' end,rid);
 return jsonb_build_object('ok',true,'reservation_id',rid);
end $fn$;

create or replace function private.mail_review(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare m public.mail_inbox;result jsonb;r jsonb;note_text text:=trim(coalesce(p->>'note',''));old public.reservations;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into m from public.mail_inbox where id=p->>'id' for update;
 if m.id is null then raise exception 'Mail nicht gefunden.';end if;
 if p->>'action'='ignore' then
  if m.reservation_id is not null then raise exception 'Zuerst den Reservationsstatus prüfen.';end if;
  update public.mail_inbox set state='ignored',updated=now() where id=m.id;return '{"ok":true}'::jsonb;
 end if;
 if p->>'action'='question' then
  if note_text='' or length(note_text)>4000 then raise exception 'Bitte die offene Rückfrage angeben.';end if;
  if m.reservation_id is not null then
   select * into old from public.reservations where id=m.reservation_id;
   if old.revision<>coalesce((p->>'revision')::integer,-1) then raise exception 'Reservation wurde geändert. Bitte aktualisieren.' using errcode='40001';end if;
   if old.status='Storniert' then raise exception 'Reservation ist storniert.';end if;
   update public.reservations set status='Rückfrage nötig',revision=revision+1,updated=now() where id=m.reservation_id;
  end if;
  update public.mail_inbox set state='question',followup_note=note_text,updated=now() where id=m.id;
  return jsonb_build_object('ok',true,'id',m.reservation_id);
 end if;
 if p->>'action'<>'convert' or jsonb_typeof(p->'reservation') is distinct from 'object' then raise exception 'Aktion prüfen.';end if;
 r:=p->'reservation';
 if m.reservation_id is null then r:=(r-array['id','createId','revision'])||jsonb_build_object('createId','mail-'||m.id);
 else r:=(r-'createId')||jsonb_build_object('id',m.reservation_id);end if;
 if r->>'status'='Bestätigt' and coalesce(r->>'time','')='' then raise exception 'Vor der definitiven Bestätigung bitte die Uhrzeit ergänzen.';end if;
 result:=private.save_reservation(jsonb_build_object('action','save','reservation',r));
 update public.reservations set source='E-Mail',reason='E-Mail manuell geprüft' where id=result->>'id';
 update public.mail_inbox set state=case when r->>'status'='Bestätigt' then 'confirmed' when r->>'status'='Rückfrage nötig' then 'question' when r->>'status'='Storniert' then 'ignored' else 'imported' end,reservation_id=result->>'id',updated=now() where id=m.id;
 return result;
end $fn$;

create function private.mail_sync_status() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 update public.mail_inbox set state=case when new.status='Bestätigt' then 'confirmed' when new.status='Rückfrage nötig' then 'question' when new.status='Storniert' then 'ignored' else 'imported' end,updated=now() where reservation_id=new.id;
 return new;
end $fn$;
revoke all on function private.mail_sync_status() from public,anon,authenticated;
create trigger reservations_mail_status after update of status on public.reservations for each row when(old.status is distinct from new.status) execute function private.mail_sync_status();
commit;
