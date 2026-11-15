begin;
create function private.excel_ignore_mail(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare m public.mail_inbox;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into m from public.mail_inbox where id=p->>'id' for update;
 if m.id is null then raise exception 'Anfrage nicht gefunden.';end if;
 if exists(select 1 from public.mail_outbox where state<>'sent' and (mail_id=m.id or reservation_id=m.reservation_id)) then raise exception 'Bestätigungsversand ist noch offen. Bitte zuerst den Versand prüfen.';end if;
 if m.state='ignored' then return jsonb_build_object('id',m.id,'state','ignored');end if;
 if m.state='confirmed' then raise exception 'Diese Anfrage wurde bereits bestätigt. Bitte aktualisieren.' using errcode='PT409';end if;
 -- Ignoring affects the inbox only, including when a provisional booking exists.
 update public.mail_inbox set state='ignored',updated=now() where id=m.id;
 return jsonb_build_object('id',m.id,'state','ignored');
end $fn$;
create function public.excel_ignore_mail(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.excel_ignore_mail(p)$fn$;
revoke all on function private.excel_ignore_mail(jsonb),public.excel_ignore_mail(jsonb) from public,anon;
grant execute on function private.excel_ignore_mail(jsonb),public.excel_ignore_mail(jsonb) to authenticated;
commit;
