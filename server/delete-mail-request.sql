begin;
-- Keep the provider ID and original message so webhook retries cannot recreate it.
create function private.delete_mail_request(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare m public.mail_inbox; booking public.reservations;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into m from public.mail_inbox where id=p->>'id' for update;
 if m.id is null then raise exception 'Mail nicht gefunden.';end if;
 if m.reservation_id is distinct from nullif(p->>'reservation_id','') then raise exception 'Anfrage wurde geändert. Bitte aktualisieren.' using errcode='40001';end if;
 if m.state='ignored' then return '{"ok":true}'::jsonb;end if;
 if m.state='confirmed' or exists(select 1 from public.mail_outbox where mail_id=m.id or reservation_id=m.reservation_id) then raise exception 'Bestätigte Anfragen oder Anfragen mit vorgemerktem Versand können hier nicht gelöscht werden.';end if;
 if m.reservation_id is not null then
  select * into booking from public.reservations where id=m.reservation_id for update;
  if booking.id is null then raise exception 'Reservation nicht gefunden.';end if;
  if booking.revision<>coalesce((p->>'revision')::integer,-1) then raise exception 'Reservation wurde geändert. Bitte aktualisieren.' using errcode='40001';end if;
  if booking.status not in ('Offen','Rückfrage nötig') or booking.arrived then raise exception 'Nur offene, noch nicht angekommene Reservationen können hier gelöscht werden.';end if;
  update public.reservations set status='Storniert',revision=revision+1,updated=now() where id=booking.id;
 end if;
 update public.mail_inbox set state='ignored',updated=now() where id=m.id;
 return '{"ok":true}'::jsonb;
end $fn$;
create function public.delete_mail_request(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.delete_mail_request(p)$fn$;
revoke all on function private.delete_mail_request(jsonb),public.delete_mail_request(jsonb) from public,anon;
grant execute on function private.delete_mail_request(jsonb),public.delete_mail_request(jsonb) to authenticated;
commit;
