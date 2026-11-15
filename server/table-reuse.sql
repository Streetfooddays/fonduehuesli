begin;
alter table public.reservations add column released_tables text[] not null default '{}';
-- Retain the arrival history, and release only the physical tables explicitly checked by the team.
create function private.reuse_table_numbers(value text) returns text[] language plpgsql immutable set search_path='' as $fn$
declare cleaned text:=upper(coalesce(value,'')); part text[]; lo integer; hi integer;
begin
 for part in select regexp_matches(cleaned,'([0-9]+)[[:space:]]*[-–][[:space:]]*([0-9]+)','g') loop
  lo:=part[1]::integer;hi:=part[2]::integer;
  if hi>=lo and hi-lo<=25 then cleaned:=regexp_replace(cleaned,part[1]||'[[:space:]]*[-–][[:space:]]*'||part[2],(select string_agg(n::text,',') from generate_series(lo,hi) n));end if;
 end loop;
 return array(select distinct regexp_replace(m[1],'[[:space:]]','','g') from regexp_matches(cleaned,'([TG]?[[:space:]]*[0-9]+)','g') m order by 1);
end $fn$;
create function private.table_reuse_check(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare target public.reservations; day date; value text; wanted text[]; result jsonb; target_status text;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 select * into target from public.reservations where id=p->>'id' and deleted_at is null;
 day:=coalesce(nullif(p->>'date','')::date,target.date);
 target_status:=coalesce(p->>'status',target.status,'Bestätigt');
 if day is null or target_status in ('Warteliste','Storniert') then return '[]'::jsonb;end if;
 value:=private.table_group_assignment(coalesce(p->>'tableNo',target.table_no,''),coalesce((p->>'people')::integer,target.people,1));
 if length(value)>100 then raise exception 'Tischnummer prüfen (maximal 100 Zeichen).';end if;
 wanted:=private.reuse_table_numbers(value);
 if cardinality(wanted)=0 then return '[]'::jsonb;end if;
 if target.id is not null and target.date=day and target.status not in ('Warteliste','Storniert') and wanted=private.reuse_table_numbers(target.table_no) and not coalesce((p->>'arriving')::boolean,false) then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'revision',r.revision,'date',r.date,'tables',x.tables,'name',trim(concat_ws(' ',r.data::jsonb->>'first',r.data::jsonb->>'last')),'time',r.time) order by r.id),'[]'::jsonb) into result
 from public.reservations r cross join lateral (select array(select n from unnest(private.reuse_table_numbers(r.table_no)) n where n=any(wanted) and not n=any(r.released_tables)) as tables) x
 where r.date=day and r.id is distinct from target.id and r.arrived and r.deleted_at is null and r.status not in ('Warteliste','Storniert') and cardinality(x.tables)>0;
 return result;
end $fn$;
create function public.table_reuse_check(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.table_reuse_check(p)$fn$;
create function private.release_arrived_tables(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare item jsonb; r public.reservations; selected text[]; result jsonb:='[]';
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 if jsonb_typeof(p->'conflicts') is distinct from 'array' or jsonb_array_length(p->'conflicts')>100 then raise exception 'Tischfreigabe prüfen.';end if;
 perform pg_advisory_xact_lock(922002670);
 for item in select v from jsonb_array_elements(p->'conflicts') v order by v->>'id' loop
  select * into r from public.reservations where id=item->>'id' for update;
  if r.id is null or r.revision is distinct from (item->>'revision')::integer or r.date is distinct from (item->>'date')::date or not r.arrived or r.deleted_at is not null or r.status in ('Warteliste','Storniert') then raise exception 'Die Tischbelegung wurde geändert. Bitte erneut versuchen.' using errcode='PT409';end if;
  selected:=array(select jsonb_array_elements_text(item->'tables'));
  if cardinality(selected)=0 or not selected<@private.reuse_table_numbers(r.table_no) then raise exception 'Tischfreigabe prüfen.';end if;
  update public.reservations set released_tables=array(select distinct n from unnest(released_tables||selected) n order by n),revision=revision+1,updated=now() where id=r.id returning * into r;
  result:=result||jsonb_build_array(jsonb_build_object('id',r.id,'released_tables',r.released_tables,'revision',r.revision,'updated',r.updated));
 end loop;
 return result;
end $fn$;
create function public.release_arrived_tables(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.release_arrived_tables(p)$fn$;
-- Also reject stale browsers or assignments made while somebody else is changing the seating.
create function private.guard_table_reuse() returns trigger language plpgsql security definer set search_path='' as $fn$
declare wanted text[]; occupied text[]; checking boolean:=true;
begin
 if tg_op='UPDATE' then
  checking:=new.date is distinct from old.date or private.reuse_table_numbers(new.table_no) is distinct from private.reuse_table_numbers(old.table_no) or (new.arrived and not old.arrived) or (old.status in ('Warteliste','Storniert') and new.status not in ('Warteliste','Storniert'));
  if new.date is distinct from old.date or (new.arrived and not old.arrived) then new.released_tables:='{}';
  else new.released_tables:=array(select n from unnest(new.released_tables) n where n=any(private.reuse_table_numbers(new.table_no)));end if;
 end if;
 if not checking or new.deleted_at is not null or new.status in ('Warteliste','Storniert') then return new;end if;
 perform pg_advisory_xact_lock(922002670);
 wanted:=private.reuse_table_numbers(new.table_no);
 select array_agg(distinct n) into occupied from public.reservations r cross join lateral unnest(private.reuse_table_numbers(r.table_no)) n
 where r.id<>new.id and r.date=new.date and r.arrived and r.deleted_at is null and r.status not in ('Warteliste','Storniert') and n=any(wanted) and not n=any(r.released_tables);
 if cardinality(occupied)>0 then raise exception 'Tisch % ist noch als angekommen belegt. Bitte Tischzuteilung erneut wählen und die Freigabe bestätigen.',array_to_string(occupied,', ') using errcode='PT409';end if;
 return new;
end $fn$;
create trigger reservation_table_reuse_guard before insert or update of date,table_no,people,status,arrived on public.reservations for each row execute function private.guard_table_reuse();
-- Table release is operational metadata, just like the arrival flag.
do $patch$ declare definition text; begin
 definition:=pg_get_functiondef('private.confirmation_hold()'::regprocedure);
 if position('array[''arrived'',''arrived_at'',''revision'',''updated'']' in definition)=0 then raise exception 'Confirmation guard changed';end if;
 execute replace(definition,'array[''arrived'',''arrived_at'',''revision'',''updated'']','array[''arrived'',''arrived_at'',''released_tables'',''revision'',''updated'']');
end $patch$;
revoke all on function private.reuse_table_numbers(text),private.table_reuse_check(jsonb),private.release_arrived_tables(jsonb),private.guard_table_reuse(),public.table_reuse_check(jsonb),public.release_arrived_tables(jsonb) from public,anon;
grant execute on function private.table_reuse_check(jsonb),private.release_arrived_tables(jsonb),public.table_reuse_check(jsonb),public.release_arrived_tables(jsonb) to authenticated;
do $patch$
declare f text; definition text;
begin
 foreach f in array array['save_reservation','set_reservation_table','confirm_day_reservation'] loop
  definition:=pg_get_functiondef(to_regprocedure('private.'||f||'(jsonb)'));
  if position('gondola=1 and status=''Bestätigt'' and' in definition)=0 then raise exception 'Gondola capacity guard changed: %',f;end if;
  execute replace(definition,'gondola=1 and status=''Bestätigt'' and','gondola=1 and status=''Bestätigt'' and not (cardinality(private.gondola_tables(table_no))>0 and private.gondola_tables(table_no)<@released_tables) and');
 end loop;
 foreach f in array array['set_reservation_table','set_reservation_people','set_reservation_arrival'] loop
  definition:=pg_get_functiondef(to_regprocedure('private.'||f||'(jsonb)'));
  if position('''updated'',booking.updated' in definition)=0 then raise exception 'Inline result changed: %',f;end if;
  execute replace(definition,'''updated'',booking.updated','''released_tables'',booking.released_tables,''updated'',booking.updated');
 end loop;
end $patch$;
commit;
