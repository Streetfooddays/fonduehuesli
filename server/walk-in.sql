begin;
create function private.save_walk_in(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r jsonb:=payload->'reservation'; rid text; booking public.reservations; result jsonb;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 if jsonb_typeof(r) is distinct from 'object' or nullif(r->>'id','') is not null or nullif(r->>'createId','') is null then raise exception 'Neue Laufkundschaft prüfen.';end if;
 if jsonb_typeof(r->'data') is distinct from 'object' then raise exception 'Gastdaten prüfen.';end if;
 perform pg_advisory_xact_lock(922002670);
 rid:=r->>'createId';
 select * into booking from public.reservations where id=rid for update;
 if booking.id is not null and (booking.source<>'Laufkundschaft / manuell' or booking.deleted_at is not null or booking.status<>'Bestätigt') then raise exception 'Eintrag bereits vorhanden. Bitte aktualisieren.' using errcode='40001';end if;
 if coalesce(trim(r->'data'->>'last'),'')='' and coalesce(trim(r->'data'->>'first'),'')='' then r:=jsonb_set(r,'{data}',coalesce(r->'data','{}'::jsonb)||'{"last":"walk in"}'::jsonb);end if;
 r:=r||'{"status":"Bestätigt"}'::jsonb;
 result:=private.save_reservation(jsonb_build_object('action','save','reservation',r));
 select * into booking from public.reservations where id=rid for update;
 perform private.set_reservation_arrival(jsonb_build_object('id',rid,'revision',booking.revision,'arrived',true));
 update public.reservations set source='Laufkundschaft / manuell',reason='Ohne vorherige Reservation erfasst und direkt als angekommen markiert' where id=rid;
 return result||jsonb_build_object('arrived',true);
end $fn$;
create function public.save_walk_in(payload jsonb) returns jsonb language sql set search_path='' as $fn$select private.save_walk_in(payload)$fn$;
revoke all on function private.save_walk_in(jsonb),public.save_walk_in(jsonb) from public,anon;
grant execute on function private.save_walk_in(jsonb),public.save_walk_in(jsonb) to authenticated;
commit;
