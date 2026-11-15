begin;
-- A reviewed mail can be linked to the matching existing booking without creating a duplicate.
create function private.excel_link_mail(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare m public.mail_inbox; r public.reservations; d jsonb; md text; rd text; same_name boolean; same_email boolean;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into m from public.mail_inbox where id=p->>'mail_id' for update;
 select * into r from public.reservations where id=p->>'reservation_id' for update;
 if m.id is null or r.id is null or r.deleted_at is not null or r.status='Storniert' then raise exception 'Anfrage oder aktive Reservation nicht gefunden.';end if;
 if m.reservation_id=r.id then return to_jsonb(r);end if;
 if m.reservation_id is not null or m.state in ('confirmed','ignored') then raise exception 'Die Anfrage wurde inzwischen bearbeitet. Bitte aktualisieren.' using errcode='PT409';end if;
 if r.revision<>coalesce((p->>'revision')::integer,-1) then raise exception 'Reservation wurde inzwischen geändert. Bitte aktualisieren.' using errcode='PT409';end if;
 if exists(select 1 from public.mail_outbox where state<>'sent' and (mail_id=m.id or reservation_id=r.id)) then raise exception 'Ein Bestätigungsversand ist noch offen. Bitte zuerst den Versand prüfen.';end if;
 d:=m.draft->'data';
 if m.draft->>'date' is distinct from r.date::text or (m.draft->>'people')::integer is distinct from r.people or coalesce(m.draft->>'time','') is distinct from coalesce(r.time,'') then raise exception 'Datum, Uhrzeit oder Personenzahl stimmen nicht mit dem vorhandenen Eintrag überein.';end if;
 md:=lower(regexp_replace(coalesce(d->>'first','')||coalesce(d->>'last',''),'[^[:alnum:]]','','g'));
 rd:=lower(regexp_replace(coalesce(r.data::jsonb->>'first','')||coalesce(r.data::jsonb->>'last',''),'[^[:alnum:]]','','g'));
 same_name:=md<>'' and (md=rd or md=lower(regexp_replace(coalesce(r.data::jsonb->>'last','')||coalesce(r.data::jsonb->>'first',''),'[^[:alnum:]]','','g')));
 same_email:=trim(coalesce(d->>'email',''))<>'' and lower(trim(d->>'email'))=lower(trim(r.data::jsonb->>'email'));
 if not same_name and not same_email then raise exception 'Name oder E-Mail stimmen nicht eindeutig überein. Bitte manuell prüfen.';end if;
 update public.mail_inbox set reservation_id=r.id,state=case when r.status='Bestätigt' then 'confirmed' when r.status='Rückfrage nötig' then 'question' else 'imported' end,updated=now() where id=m.id;
 return to_jsonb(r);
end $fn$;
create function public.excel_link_mail(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.excel_link_mail(p)$fn$;
revoke all on function private.excel_link_mail(jsonb),public.excel_link_mail(jsonb) from public,anon;
grant execute on function private.excel_link_mail(jsonb),public.excel_link_mail(jsonb) to authenticated;
commit;
