begin;
create function private.set_reservation_table(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare booking public.reservations; value text;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 if jsonb_typeof(p->'tableNo') is distinct from 'string' or length(p->>'tableNo')>100 then raise exception 'Tischnummer prüfen (maximal 100 Zeichen).';end if;
 value:=trim(p->>'tableNo');
 perform pg_advisory_xact_lock(922002670);
 select * into booking from public.reservations where id=p->>'id' for update;
 if booking.id is null then raise exception 'Reservation nicht gefunden.';end if;
 if booking.revision<>coalesce((p->>'revision')::integer,-1) then raise exception 'Reservation wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode='40001';end if;
 if booking.table_no is distinct from value then
  update public.reservations set table_no=value,revision=revision+1,updated=now() where id=booking.id returning * into booking;
 end if;
 return jsonb_build_object('id',booking.id,'table_no',booking.table_no,'revision',booking.revision,'updated',booking.updated);
end $fn$;
create function public.set_reservation_table(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.set_reservation_table(p)$fn$;
revoke all on function private.set_reservation_table(jsonb),public.set_reservation_table(jsonb) from public,anon;
grant execute on function private.set_reservation_table(jsonb),public.set_reservation_table(jsonb) to authenticated;
commit;
