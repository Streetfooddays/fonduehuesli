begin;
create function private.set_reservation_time(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare booking public.reservations; value text; service text;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 if jsonb_typeof(p->'time') is distinct from 'string' then raise exception 'Uhrzeit prüfen.';end if;
 value:=p->>'time';
 if value<>'' and value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Uhrzeit prüfen.';end if;
 service:=case when value='' then 'ungeklaert' when value<'16:00' then 'mittag' else 'abend' end;
 perform pg_advisory_xact_lock(922002670);
 select * into booking from public.reservations where id=p->>'id' for update;
 if booking.id is null then raise exception 'Reservation nicht gefunden.';end if;
 if booking.revision<>coalesce((p->>'revision')::integer,-1) then raise exception 'Reservation wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode='40001';end if;
 if booking.status='Storniert' then raise exception 'Stornierte Reservation zuerst über Bearbeiten wieder aktivieren.';end if;
 if booking.time is distinct from value then
  update public.reservations set time=value,period=service,data=(data::jsonb||jsonb_build_object('time',value))::text,revision=revision+1,updated=now() where id=booking.id returning * into booking;
 end if;
 return jsonb_build_object('id',booking.id,'time',booking.time,'period',booking.period,'data',booking.data,'revision',booking.revision,'updated',booking.updated);
end $fn$;
create function public.set_reservation_time(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.set_reservation_time(p)$fn$;
revoke all on function private.set_reservation_time(jsonb),public.set_reservation_time(jsonb) from public,anon;
grant execute on function private.set_reservation_time(jsonb),public.set_reservation_time(jsonb) to authenticated;
commit;
