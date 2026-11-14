begin;
create function private.confirm_day_reservation(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare booking public.reservations; total integer;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into booking from public.reservations where id=p->>'id' for update;
 if booking.id is null or booking.deleted_at is not null then raise exception 'Reservation nicht gefunden.';end if;
 if booking.date is distinct from (p->>'date')::date then raise exception 'Reservationsdatum wurde geändert. Bitte aktualisieren.' using errcode='40001';end if;
 if booking.status<>'Bestätigt' then
  if booking.revision<>coalesce((p->>'revision')::integer,-1) then raise exception 'Reservation wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode='40001';end if;
  if booking.status<>'Offen' then raise exception 'Nur offene Reservationen können hier bestätigt werden. Rückfragen bitte über Bearbeiten klären.';end if;
  if exists(select 1 from public.mail_outbox where reservation_id=booking.id and state<>'sent') then raise exception 'Ein Bestätigungsversand ist bereits vorgemerkt. Bitte zuerst den Versand prüfen.';end if;
  if booking.gondola=1 and booking.people>4 then raise exception 'Maximal vier Personen je Fonduegondel.';end if;
  if booking.gondola=1 and (select count(*) from public.reservations where id<>booking.id and date=booking.date and deleted_at is null and gondola=1 and status='Bestätigt' and (period=booking.period or period='ungeklaert' or booking.period='ungeklaert'))>=3 then raise exception 'Alle drei Gondeln sind bereits reserviert. Bitte die Zuteilung prüfen.';end if;
  update public.reservations set status='Bestätigt',reason='In der Tagesübersicht manuell bestätigt, ohne Mailversand',revision=revision+1,updated=now() where id=booking.id returning * into booking;
 end if;
 select coalesce(sum(people),0) into total from public.reservations where date=booking.date and deleted_at is null and status='Bestätigt' and period in ('abend','ungeklaert');
 return jsonb_build_object('reservation',to_jsonb(booking),'over_capacity',booking.period<>'mittag' and total>70);
end $fn$;
create function public.confirm_day_reservation(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.confirm_day_reservation(p)$fn$;
revoke all on function private.confirm_day_reservation(jsonb),public.confirm_day_reservation(jsonb) from public,anon;
grant execute on function private.confirm_day_reservation(jsonb),public.confirm_day_reservation(jsonb) to authenticated;
commit;
