begin;
alter table public.reservations add column arrived boolean not null default false;
alter table public.reservations add column arrived_at timestamptz;
-- Arrival is operational metadata and cannot alter a queued confirmation's content.
create or replace function private.confirmation_hold() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if exists(select 1 from public.mail_outbox where reservation_id=old.id and state<>'sent') then
  if tg_op='UPDATE' and (to_jsonb(old)-array['arrived','arrived_at','revision','updated']) is not distinct from (to_jsonb(new)-array['arrived','arrived_at','revision','updated']) then return new;end if;
  raise exception 'Bestätigung ist für den Versand vorgemerkt. Zuerst den Versand abschliessen.';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $fn$;
create function private.set_reservation_arrival(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare booking public.reservations; value boolean;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 if jsonb_typeof(p->'arrived') is distinct from 'boolean' then raise exception 'Ankunft prüfen.';end if;
 value:=(p->>'arrived')::boolean;
 perform pg_advisory_xact_lock(922002670);
 select * into booking from public.reservations where id=p->>'id' for update;
 if booking.id is null then raise exception 'Reservation nicht gefunden.';end if;
 if booking.revision<>coalesce((p->>'revision')::integer,-1) then raise exception 'Reservation wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode='40001';end if;
 if booking.arrived is distinct from value then
  update public.reservations set arrived=value,arrived_at=case when value then now() else null end,revision=revision+1,updated=now() where id=booking.id returning * into booking;
 end if;
 return jsonb_build_object('id',booking.id,'arrived',booking.arrived,'arrived_at',booking.arrived_at,'revision',booking.revision,'updated',booking.updated);
end $fn$;
create function public.set_reservation_arrival(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.set_reservation_arrival(p)$fn$;
revoke all on function private.set_reservation_arrival(jsonb),public.set_reservation_arrival(jsonb) from public,anon;
grant execute on function private.set_reservation_arrival(jsonb),public.set_reservation_arrival(jsonb) to authenticated;
commit;
