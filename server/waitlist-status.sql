begin;
alter table public.reservations drop constraint reservations_status_check;
alter table public.reservations add constraint reservations_status_check check(status in ('Offen','Rückfrage nötig','Bestätigt','Warteliste','Storniert'));
-- Persist receipt order independently of later edits or status changes.
alter table public.reservations add column received_at timestamptz;
update public.reservations r set received_at=coalesce((select min(m.received_at) from public.mail_inbox m where m.reservation_id=r.id),r.created);
alter table public.reservations alter column received_at set default now();
alter table public.reservations alter column received_at set not null;
do $patch$
declare definition text; fname text;
begin
 definition:=pg_get_functiondef('private.save_reservation(jsonb)'::regprocedure);
 if position('rs not in (''Offen'',''Rückfrage nötig'',''Bestätigt'',''Storniert'')' in definition)=0 then raise exception 'Status validation changed';end if;
 execute replace(definition,'rs not in (''Offen'',''Rückfrage nötig'',''Bestätigt'',''Storniert'')','rs not in (''Offen'',''Rückfrage nötig'',''Bestätigt'',''Warteliste'',''Storniert'')');
 foreach fname in array array['private.mail_review(jsonb)','private.mail_sync_status()','private.excel_link_mail(jsonb)'] loop
  definition:=pg_get_functiondef(fname::regprocedure);
  definition:=replace(definition,'when new.status=''Storniert''','when new.status in (''Warteliste'',''Storniert'')');
  definition:=replace(definition,'when r.status=''Storniert''','when r.status in (''Warteliste'',''Storniert'')');
  definition:=replace(definition,'when r->>''status''=''Storniert''','when r->>''status'' in (''Warteliste'',''Storniert'')');
  execute definition;
 end loop;
 definition:=pg_get_functiondef('private.apply_table_group_rules()'::regprocedure);
 execute replace(definition,'new.status=''Storniert''','new.status in (''Warteliste'',''Storniert'')');
 definition:=pg_get_functiondef('private.set_reservation_arrival(jsonb)'::regprocedure);
 execute replace(definition,'if booking.arrived is distinct from value then','if value and booking.status in (''Warteliste'',''Storniert'') then raise exception ''Reservation zuerst bestaetigen oder aktivieren.'';end if; if booking.arrived is distinct from value then');
 definition:=pg_get_functiondef('private.automatic_confirmation_assess(text)'::regprocedure);
 execute replace(definition,'status<>''Storniert''','status not in (''Warteliste'',''Storniert'')');
end $patch$;
commit;
