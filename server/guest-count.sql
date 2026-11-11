begin;
alter table public.reservations drop constraint reservations_people_check;
alter table public.reservations add constraint reservations_people_check check(people between 0 and 1000);
create function private.set_reservation_people(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare booking public.reservations; value integer;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 if jsonb_typeof(p->'people') is distinct from 'number' or (p->>'people') !~ '^[0-9]{1,4}$' then raise exception 'Bitte 0 bis 1000 Personen eintragen.';end if;
 value:=(p->>'people')::integer;
 if value>1000 then raise exception 'Bitte 0 bis 1000 Personen eintragen.';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into booking from public.reservations where id=p->>'id' for update;
 if booking.id is null then raise exception 'Reservation nicht gefunden.';end if;
 if booking.revision<>coalesce((p->>'revision')::integer,-1) then raise exception 'Reservation wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode='40001';end if;
 if booking.status='Storniert' then raise exception 'Stornierte Reservation zuerst über Bearbeiten wieder aktivieren.';end if;
 if booking.people is distinct from value then
  update public.reservations set people=value,data=(data::jsonb||jsonb_build_object('people',value::text))::text,revision=revision+1,updated=now() where id=booking.id returning * into booking;
 end if;
 return jsonb_build_object('id',booking.id,'people',booking.people,'data',booking.data,'revision',booking.revision,'updated',booking.updated);
end $fn$;
create function public.set_reservation_people(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.set_reservation_people(p)$fn$;
revoke all on function private.set_reservation_people(jsonb),public.set_reservation_people(jsonb) from public,anon;
grant execute on function private.set_reservation_people(jsonb),public.set_reservation_people(jsonb) to authenticated;
-- Existing zero-guest records must remain editable without silently resetting to two.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('private.save_reservation(jsonb)'::regprocedure);
 if position('rp<1 or rp>1000' in definition)=0 then raise exception 'Expected person validation changed';end if;
 definition:=replace(definition,'rp<1 or rp>1000','rp<0 or rp>1000');
 definition:=replace(definition,'select * into old from public.reservations where id=rid;',E'select * into old from public.reservations where id=rid;\n if rp=0 and old.id is null then raise exception ''Für neue Reservationen mindestens eine Person eintragen.'';end if;');
 execute definition;
end $patch$;
commit;
