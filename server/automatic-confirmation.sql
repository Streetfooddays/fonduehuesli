begin;
create table private.automatic_confirmation_config(
 id boolean primary key default true check(id),enabled boolean not null default false,
 max_people integer not null default 70 check(max_people=70),activated_at timestamptz,
 activated_by uuid references auth.users(id)
);
alter table private.automatic_confirmation_config enable row level security;
revoke all on private.automatic_confirmation_config from public,anon,authenticated;
insert into private.automatic_confirmation_config(id,enabled) values(true,false);
alter table public.mail_outbox add column automatic boolean not null default false;

create function private.automatic_confirmation_assess(mid text) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare m public.mail_inbox;r public.reservations;d jsonb;reasons jsonb:='[]';total integer;comment text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' and (auth.uid() is null or private.member_role() is null) then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 select * into m from public.mail_inbox where id=mid;
 select * into r from public.reservations where id=m.reservation_id;
 if m.id is null or r.id is null then return jsonb_build_object('eligible',false,'reasons',jsonb_build_array('Angaben müssen zuerst ergänzt werden.'));end if;
 d:=r.data::jsonb;
 if m.state<>'imported' or r.status<>'Offen' or r.revision<>0 then reasons:=reasons||jsonb_build_array('Anfrage bereits bearbeitet.');end if;
 if jsonb_array_length(coalesce(m.issues,'[]'))>0 then reasons:=reasons||jsonb_build_array('Unklare Angaben oder manueller Prüfhinweis.');end if;
 comment:=btrim(regexp_replace(coalesce(d->>'comment',''),'<?https?://click[.]promote[.]weebly[.]com/wf/open[^[:space:]<>]*>?','','gi'),E' \n\r\t[]<>');
 if comment<>'' or btrim(coalesce(m.followup_note,''))<>'' or (btrim(coalesce(r.note,''))<>'' and r.note is distinct from left('Maileingang: '||m.subject,1000)) then reasons:=reasons||jsonb_build_array('Bemerkungen oder interne Rückfrage vorhanden.');end if;
 if r.date<(now() at time zone 'Europe/Zurich')::date or r.time='' or r.people<1 or coalesce(d->>'email','') !~ '^[^[:space:]@<>;,]+@[^[:space:]@<>;,]+[.][^[:space:]@<>;,]+$' or (btrim(coalesce(d->>'last',''))='' and btrim(coalesce(d->>'first',''))='') then reasons:=reasons||jsonb_build_array('Datum, Zeit, Personenzahl, Name oder E-Mail fehlen oder sind ungültig.');end if;
 if r.gondola=1 or coalesce(d->>'gondola','') not in ('','Nein') then reasons:=reasons||jsonb_build_array('Gondelwunsch manuell zuordnen.');end if;
 if exists(select 1 from public.reservation_days where date=r.date and manual_only=1) then reasons:=reasons||jsonb_build_array('Tag ist zur manuellen Prüfung markiert.');end if;
 select coalesce(sum(people),0) into total from public.reservations where date=r.date and status<>'Storniert';
 if total>70 then reasons:=reasons||jsonb_build_array('Mehr als 70 Personen an diesem Tag, einschliesslich dieser Anfrage.');end if;
 if exists(select 1 from public.reservations other where other.date=r.date and other.id<>r.id and other.status<>'Storniert' and (
  lower(btrim(other.data::jsonb->>'email'))=lower(btrim(d->>'email')) or
  lower(regexp_replace(coalesce(other.data::jsonb->>'last','')||coalesce(other.data::jsonb->>'first',''),'[^[:alnum:]]','','g')) in (lower(regexp_replace(coalesce(d->>'last','')||coalesce(d->>'first',''),'[^[:alnum:]]','','g')),lower(regexp_replace(coalesce(d->>'first','')||coalesce(d->>'last',''),'[^[:alnum:]]','','g')))
 )) then reasons:=reasons||jsonb_build_array('Mögliche Doppelreservation.');end if;
 if exists(select 1 from public.mail_outbox where reservation_id=r.id) then reasons:=reasons||jsonb_build_array('Bestätigung ist bereits vorbereitet oder versendet.');end if;
 return jsonb_build_object('eligible',jsonb_array_length(reasons)=0,'reasons',reasons,'total_people',total,'reservation',to_jsonb(r),'mail_id',m.id);
end $fn$;

create function private.automatic_confirmation_preview() returns jsonb language plpgsql security definer set search_path='' as $fn$
declare cfg private.automatic_confirmation_config; result jsonb;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 select * into cfg from private.automatic_confirmation_config where id;
 select coalesce(jsonb_agg(private.automatic_confirmation_assess(m.id)),'[]') into result from public.mail_inbox m left join public.reservations r on r.id=m.reservation_id where m.state in ('review','imported','question') and coalesce(r.status,'Offen') in ('Offen','Rückfrage nötig');
 return jsonb_build_object('enabled',cfg.enabled,'max_people',cfg.max_people,'checks',result);
end $fn$;

create function public.automatic_confirmation_preview() returns jsonb language sql set search_path='' as $fn$select private.automatic_confirmation_preview()$fn$;

create function public.automatic_confirmation_context(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare cfg private.automatic_confirmation_config; result jsonb;o public.mail_outbox;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 select * into cfg from private.automatic_confirmation_config where id;
 if not coalesce(cfg.enabled,false) or cfg.activated_at is null or cfg.activated_by is null then return '{"enabled":false}'::jsonb;end if;
 if not exists(select 1 from public.mail_inbox where id=p->>'mail_id' and received_at>=cfg.activated_at) then return '{"enabled":true,"eligible":false}'::jsonb;end if;
 select * into o from public.mail_outbox where mail_id=p->>'mail_id' and automatic;
 if o.id is not null then return jsonb_build_object('enabled',true,'outbox',to_jsonb(o));end if;
 result:=private.automatic_confirmation_assess(p->>'mail_id');
 return result||jsonb_build_object('enabled',true,'settings',(select to_jsonb(s) from public.mail_confirmation_settings s where id));
end $fn$;

create function public.automatic_confirmation_prepare(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare cfg private.automatic_confirmation_config;a jsonb;r public.reservations;o public.mail_outbox;s public.mail_confirmation_settings;msg jsonb:=p->'message';
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into cfg from private.automatic_confirmation_config where id for share;
 if not coalesce(cfg.enabled,false) or cfg.activated_at is null or cfg.activated_by is null then return '{"enabled":false}'::jsonb;end if;
 if not exists(select 1 from public.team_members t join auth.users u on u.id=t.user_id where t.user_id=cfg.activated_by and t.role='owner' and t.active and u.email_confirmed_at is not null) then raise exception 'Aktivierung muss von der Administration erfolgen.';end if;
 perform 1 from public.mail_inbox where id=p->>'mail_id' for update;
 if not exists(select 1 from public.mail_inbox where id=p->>'mail_id' and received_at>=cfg.activated_at) then return '{"eligible":false}'::jsonb;end if;
 select * into o from public.mail_outbox where mail_id=p->>'mail_id';if o.id is not null then return case when o.automatic then to_jsonb(o) else '{"eligible":false}'::jsonb end;end if;
 a:=private.automatic_confirmation_assess(p->>'mail_id');if (a->>'eligible')::boolean is distinct from true then return a;end if;
 select * into r from public.reservations where id=a->'reservation'->>'id' for update;
 select * into s from public.mail_confirmation_settings where id for share;
 if r.revision<>coalesce((p->>'revision')::integer,-1) or s.updated is distinct from (p->>'settings_updated')::timestamptz then raise exception 'Anfrage oder Vorlage wurde geändert.' using errcode='40001';end if;
 if jsonb_typeof(msg) is distinct from 'object' or msg->>'recipient' is distinct from lower(btrim(r.data::jsonb->>'email')) or length(coalesce(msg->>'text','')) not between 10 and 20000 or length(coalesce(msg->>'html','')) not between 10 and 60000 or length(coalesce(msg->>'subject','')) not between 1 and 200 or msg->>'subject' ~ E'[\r\n]' then raise exception 'Empfänger und Bestätigungstext prüfen.';end if;
 update public.reservations set status='Bestätigt',reason='Automatisch bestätigt: keine Bemerkungen, Tagesbelegung maximal 70 Personen',revision=revision+1,updated=now() where id=r.id;
 update public.mail_inbox set state='imported',updated=now() where id=p->>'mail_id';
 insert into public.mail_outbox(reservation_id,mail_id,recipient,subject,message_text,message_html,created_by,automatic) values(r.id,p->>'mail_id',msg->>'recipient',msg->>'subject',msg->>'text',msg->>'html',cfg.activated_by,true) returning * into o;
 return to_jsonb(o);
end $fn$;
revoke all on function private.automatic_confirmation_assess(text),private.automatic_confirmation_preview(),public.automatic_confirmation_preview(),public.automatic_confirmation_context(jsonb),public.automatic_confirmation_prepare(jsonb) from public,anon,authenticated;
grant execute on function private.automatic_confirmation_preview(),public.automatic_confirmation_preview() to authenticated;
grant execute on function public.automatic_confirmation_context(jsonb),public.automatic_confirmation_prepare(jsonb) to service_role;
commit;
