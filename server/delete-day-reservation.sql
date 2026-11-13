begin;
-- Preserve reservation and message history, while removing deleted bookings from all views.
alter table public.reservations add column deleted_at timestamptz;
create function private.delete_day_reservation(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare booking public.reservations;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into booking from public.reservations where id=p->>'id' for update;
 if booking.id is null then raise exception 'Reservation nicht gefunden.';end if;
 if booking.date is distinct from (p->>'date')::date then raise exception 'Reservationsdatum wurde geändert. Bitte aktualisieren.' using errcode='40001';end if;
 if booking.deleted_at is not null then return jsonb_build_object('ok',true,'id',booking.id);end if;
 if booking.revision<>coalesce((p->>'revision')::integer,-1) then raise exception 'Reservation wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode='40001';end if;
 if exists(select 1 from public.mail_outbox where reservation_id=booking.id and state<>'sent') then raise exception 'Bestätigung ist für den Versand vorgemerkt. Zuerst den Versand abschliessen.';end if;
 update public.reservations set status='Storniert',deleted_at=now(),revision=revision+1,updated=now(),reason='In der Tagesübersicht gelöscht' where id=booking.id;
 update public.mail_inbox set state='ignored',updated=now() where reservation_id=booking.id;
 return jsonb_build_object('ok',true,'id',booking.id);
end $fn$;
create function public.delete_day_reservation(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.delete_day_reservation(p)$fn$;
revoke all on function private.delete_day_reservation(jsonb),public.delete_day_reservation(jsonb) from public,anon;
grant execute on function private.delete_day_reservation(jsonb),public.delete_day_reservation(jsonb) to authenticated;
commit;
