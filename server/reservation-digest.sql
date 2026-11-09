begin;
create extension if not exists pg_net with schema extensions;
create table private.reservation_digest_config(id boolean primary key default true check(id),enabled boolean not null default true,last_cutoff timestamptz not null);
create table private.reservation_digests(
 id uuid primary key default gen_random_uuid(),slot timestamptz not null unique,window_start timestamptz not null,window_end timestamptz not null,
 subject text not null,message_text text not null,message_count integer not null,
 state text not null default 'prepared' check(state in ('prepared','queued','failed','sent','needs_review')),
 request_id bigint,provider_id text,last_error text not null default '',attempts integer not null default 0,
 created timestamptz not null default now(),requested_at timestamptz,sent_at timestamptz
);
alter table private.reservation_digest_config enable row level security;
alter table private.reservation_digests enable row level security;
revoke all on private.reservation_digest_config,private.reservation_digests from public,anon,authenticated;
create function private.reservation_digest_slot(at_time timestamptz) returns timestamptz language sql stable set search_path='' as $fn$
 select (case when local_time::time>='18:00' then local_time::date+time '18:00' when local_time::time>='05:00' then local_time::date+time '05:00' else (local_time::date-1)+time '18:00' end) at time zone 'Europe/Zurich' from (select at_time at time zone 'Europe/Zurich' as local_time) t
$fn$;
insert into private.reservation_digest_config(id,last_cutoff) values(true,private.reservation_digest_slot(now()));
create function private.reservation_digest_text(starts timestamptz,ends timestamptz) returns jsonb language plpgsql set search_path='' as $fn$
declare content text; total integer; open_count integer;
begin
 with incoming as (
  select m.received_at as arrived,
   'E-Mail: '||coalesce(nullif(m.subject,''),'Ohne Betreff')||E'\nVon: '||m.sender||E'\n'||
   case when r.id is not null or nullif(m.draft->'data'->>'last','') is not null or nullif(m.draft->'data'->>'first','') is not null then
    'Gast: '||coalesce(nullif(concat_ws(' ',coalesce(r.data::jsonb,m.draft->'data')->>'first',coalesce(r.data::jsonb,m.draft->'data')->>'last'),''),'Name offen')||E'\nReservation: '||coalesce(to_char(r.date,'DD.MM.YYYY'),nullif(m.draft->>'date',''),'Datum offen')||' · '||coalesce(nullif(r.time,''),nullif(m.draft->>'time',''),'Uhrzeit offen')||' · '||coalesce(r.people::text,nullif(m.draft->>'people',''),'Anzahl offen')||' Personen'||E'\n' else '' end||
   'Status: '||coalesce(r.status,case m.state when 'review' then 'Prüfen / Angaben ergänzen' when 'question' then 'Rückfrage nötig' when 'confirmed' then 'Bestätigt' when 'ignored' then 'Erledigt / abgelegt' else 'Offen' end)||
   case when r.gondola=1 then E'\nGondel: '||coalesce(nullif(r.table_no,''),'Nummer offen') when nullif(r.table_no,'') is not null then E'\nTisch: '||r.table_no else '' end||
   case when nullif(m.body,'') is not null then E'\nAuszug: '||left(regexp_replace(m.body,'[[:space:]]+',' ','g'),500)||case when length(m.body)>500 then ' …' else '' end else '' end as line
  from public.mail_inbox m left join public.reservations r on r.id=m.reservation_id
  where m.received_at>starts and m.received_at<=ends and m.sender not like 'Excel-Import%'
   and not (position('[Fonduehüsli] Eingangsübersicht' in m.subject)>0 and lower(m.sender) like '%reservation@fonduehuesli.ch%')
  union all
  select r.created,'Manuell erfasst: '||concat_ws(' ',r.data::jsonb->>'first',r.data::jsonb->>'last')||E'\nReservation: '||to_char(r.date,'DD.MM.YYYY')||' · '||coalesce(nullif(r.time,''),'Uhrzeit offen')||' · '||r.people||E' Personen\nStatus: '||r.status||case when r.gondola=1 then E'\nGondel: '||coalesce(nullif(r.table_no,''),'Nummer offen') when nullif(r.table_no,'') is not null then E'\nTisch: '||r.table_no else '' end
  from public.reservations r where r.created>starts and r.created<=ends and r.source not ilike '%excel%' and not exists(select 1 from public.mail_inbox m where m.reservation_id=r.id)
 ) select count(*),string_agg(to_char(arrived at time zone 'Europe/Zurich','DD.MM. HH24:MI')||E' Uhr\n'||line,E'\n\n--------------------\n\n' order by arrived) into total,content from incoming;
 select count(*) into open_count from public.mail_inbox m left join public.reservations r on r.id=m.reservation_id where m.state not in ('ignored','confirmed') and coalesce(r.status,'Offen') not in ('Bestätigt','Storniert');
 return jsonb_build_object('count',total,'text','Fonduehüsli Bülach – Eingangsübersicht'||E'\n\nZeitraum: '||to_char(starts at time zone 'Europe/Zurich','DD.MM.YYYY HH24:MI')||' bis '||to_char(ends at time zone 'Europe/Zurich','DD.MM.YYYY HH24:MI')||E' Uhr (Schweizer Zeit)\nNeue Eingänge: '||total||E'\nAktuell offene Mailanfragen insgesamt: '||open_count||E'\n\n'||coalesce(content,'Keine neuen Reservationen oder Mailanfragen in diesem Zeitraum.')||E'\n\nAlle Anfragen ansehen und bearbeiten:\nhttps://fonduehuesli-reservationen.onrender.com/\n\nDiese Übersicht bestätigt keine Reservation und beantwortet keine Gästeanfrage.');
end $fn$;
create function private.reservation_digest_run() returns jsonb language plpgsql set search_path='' as $fn$
declare config private.reservation_digest_config; report private.reservation_digests; reply record; current_slot timestamptz; message jsonb; api_key text; response_data jsonb;
begin
 perform pg_advisory_xact_lock(922002672);
 select * into config from private.reservation_digest_config where id=true for update;
 if not coalesce(config.enabled,false) then return '{"state":"disabled"}'::jsonb;end if;
 -- Reconcile completed requests before deciding whether a retry or a new report is needed.
 for report in select * from private.reservation_digests where state='queued' order by slot loop
  select * into reply from net._http_response where id=report.request_id;
  if found then
   if reply.status_code between 200 and 299 and coalesce(reply.error_msg,'')='' then
    begin response_data:=reply.content::jsonb;exception when others then response_data:='{}';end;
    if nullif(response_data->>'id','') is not null then
     update private.reservation_digests set state='sent',sent_at=now(),provider_id=response_data->>'id',last_error='' where id=report.id;
     update private.reservation_digest_config set last_cutoff=greatest(last_cutoff,report.window_end) where id=true;
    else update private.reservation_digests set state='failed',last_error='Resend hat keine Versand-ID zurückgegeben.' where id=report.id;end if;
   else update private.reservation_digests set state='failed',last_error=case when reply.status_code is null then 'Netzwerkfehler beim Versand.' else 'Resend HTTP '||reply.status_code end where id=report.id;end if;
  end if;
 end loop;
 select * into config from private.reservation_digest_config where id=true;
 current_slot:=private.reservation_digest_slot(now());
 select * into report from private.reservation_digests where state<>'sent' order by slot limit 1;
 if report.id is null then
  if current_slot<=config.last_cutoff then return jsonb_build_object('state','already_sent_or_not_due','last_cutoff',config.last_cutoff);end if;
  message:=private.reservation_digest_text(config.last_cutoff,current_slot);
  insert into private.reservation_digests(slot,window_start,window_end,subject,message_text,message_count)
  values(current_slot,config.last_cutoff,current_slot,'[Fonduehüsli] Eingangsübersicht · '||to_char(current_slot at time zone 'Europe/Zurich','DD.MM.YYYY HH24:MI'),message->>'text',(message->>'count')::integer) returning * into report;
 end if;
 if report.state='needs_review' then return jsonb_build_object('state','needs_review','id',report.id,'error',report.last_error);end if;
 if report.state='queued' and report.requested_at>now()-interval '60 seconds' then return jsonb_build_object('state','pending','id',report.id,'request_id',report.request_id);end if;
 if report.requested_at is not null and report.created<now()-interval '23 hours' then
  update private.reservation_digests set state='needs_review',last_error='Versandstatus unklar; Idempotenzfrist läuft ab. Manuelle Prüfung nötig.' where id=report.id;
  return jsonb_build_object('state','needs_review','id',report.id,'error','Versandstatus manuell prüfen.');
 end if;
 if report.attempts>=3 then return jsonb_build_object('state','failed','id',report.id,'error',report.last_error);end if;
 if not exists(select 1 from private.mail_connection where enabled and api_secret is not null) then raise exception 'Mailanbindung ist nicht aktiv.';end if;
 select v.decrypted_secret into api_key from private.mail_connection c join vault.decrypted_secrets v on v.id=c.api_secret where c.enabled limit 1;
 if nullif(api_key,'') is null then raise exception 'Versandschlüssel nicht verfügbar.';end if;
 update private.reservation_digests set request_id=net.http_post(
  url:='https://api.resend.com/emails',
  headers:=jsonb_build_object('Authorization','Bearer '||api_key,'Content-Type','application/json','Idempotency-Key','reservation-digest/'||report.id),
  body:=jsonb_build_object('from','Fonduehüsli Bülach <reservation@fonduehuesli.ch>','to',jsonb_build_array('reservation@fonduehuesli.ch'),'reply_to','reservation@fonduehuesli.ch','subject',report.subject,'text',report.message_text),timeout_milliseconds:=15000
 ),state='queued',requested_at=now(),attempts=attempts+1 where id=report.id returning * into report;
 return jsonb_build_object('state','pending','id',report.id,'request_id',report.request_id,'recipient','reservation@fonduehuesli.ch','count',report.message_count,'period_end',report.window_end);
end $fn$;
revoke all on function private.reservation_digest_slot(timestamptz),private.reservation_digest_text(timestamptz,timestamptz),private.reservation_digest_run() from public,anon,authenticated,service_role;
-- Suppress the digest itself when the receiving mailbox forwards it back into the tool.
do $patch$ declare definition text;begin
 select pg_get_functiondef('private.mail_ingest(jsonb)'::regprocedure) into definition;
 if position('perform pg_advisory_xact_lock(922002670);' in definition)=0 then raise exception 'Mail ingest definition changed';end if;
 definition:=replace(definition,'perform pg_advisory_xact_lock(922002670);',E'if position(''[Fonduehüsli] Eingangsübersicht'' in coalesce(p->>''subject'',''''))>0 and lower(coalesce(p->>''sender'','''')) like ''%reservation@fonduehuesli.ch%'' then return ''{"ok":true,"ignored_digest":true}''::jsonb;end if;\n perform pg_advisory_xact_lock(922002670);');
 execute definition;
end $patch$;
commit;
