begin;
create function private.gondola_tables(value text) returns text[] language sql immutable set search_path='' as $fn$
 select coalesce(array_agg(distinct regexp_replace(m[1],'\s','','g')),'{}'::text[]) from regexp_matches(upper(coalesce(value,'')),'\m(G[[:space:]]*[123])\M','g') as m
$fn$;
revoke all on function private.gondola_tables(text) from public,anon,authenticated;
do $patch$
declare definition text;
begin
 select pg_get_functiondef('private.save_floor_position(jsonb)'::regprocedure) into definition;
 if position('if number is null' in definition)=0 then raise exception 'Position function changed';end if;
 definition:=replace(definition,'if number is null','dimensions:=dimensions||''{"G1":[98.89,65],"G2":[98.89,65],"G3":[98.89,65]}''::jsonb; if number is null');
 execute definition;
 select pg_get_functiondef('private.save_reservation(jsonb)'::regprocedure) into definition;
 if position('perform pg_advisory_xact_lock(922002670);' in definition)=0 then raise exception 'Save function changed';end if;
 definition:=replace(definition,'perform pg_advisory_xact_lock(922002670);',E'perform pg_advisory_xact_lock(922002670);\n if payload->>''action''=''save'' then\n  if cardinality(private.gondola_tables(r->>''tableNo''))>1 then raise exception ''Bitte je Gondel eine eigene Reservation mit maximal 4 Personen anlegen.'';end if;\n  if cardinality(private.gondola_tables(r->>''tableNo''))=1 then r:=r||''{"gondola":true}''::jsonb;end if;\n end if;');
 execute definition;
end $patch$;
create or replace function private.set_reservation_table(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare booking public.reservations; value text; gondolas text[]; flag integer;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 if jsonb_typeof(p->'tableNo') is distinct from 'string' or length(p->>'tableNo')>100 then raise exception 'Tischnummer prüfen (maximal 100 Zeichen).';end if;
 value:=trim(p->>'tableNo');gondolas:=private.gondola_tables(value);
 if cardinality(gondolas)>1 then raise exception 'Bitte je Gondel eine eigene Reservation mit maximal 4 Personen anlegen.';end if;
 perform pg_advisory_xact_lock(922002670);
 select * into booking from public.reservations where id=p->>'id' for update;
 if booking.id is null then raise exception 'Reservation nicht gefunden.';end if;
 if booking.revision<>coalesce((p->>'revision')::integer,-1) then raise exception 'Reservation wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode='40001';end if;
 flag:=case when cardinality(gondolas)=1 then 1 when cardinality(private.gondola_tables(booking.table_no))>0 then 0 else booking.gondola end;
 if flag=1 and booking.people>4 then raise exception 'Maximal vier Personen je Fonduegondel.';end if;
 if flag=1 and booking.gondola=0 and booking.status='Bestätigt' and (select count(*) from public.reservations where date=booking.date and id<>booking.id and gondola=1 and status='Bestätigt' and (period=booking.period or period='ungeklaert' or booking.period='ungeklaert'))>=3 then raise exception 'Alle drei Gondeln sind für diesen Mittag / Abend bereits reserviert.';end if;
 if booking.table_no is distinct from value or booking.gondola<>flag then
  update public.reservations set table_no=value,gondola=flag,data=(data::jsonb||jsonb_build_object('gondola',case when flag=1 then 'Ja' else '' end))::text,revision=revision+1,updated=now() where id=booking.id returning * into booking;
 end if;
 return jsonb_build_object('id',booking.id,'table_no',booking.table_no,'gondola',booking.gondola,'data',booking.data,'revision',booking.revision,'updated',booking.updated);
end $fn$;
commit;
