begin;
-- Retain already held capacity when editing existing confirmed bookings.
do $patch$
declare definition text; original text;
begin
 select pg_get_functiondef('private.save_reservation(jsonb)'::regprocedure) into definition;
 original:=definition;
 definition:=replace(definition, 'if rs=''Bestätigt'' and per<>''mittag'' and n+rp>70 and not over then', 'if rs=''Bestätigt'' and per<>''mittag'' and n+rp>70 and not over and not (old.id is not null and old.status=''Bestätigt'' and old.date=rd and old.period<>''mittag'' and rp<=old.people) then');
 definition:=replace(definition, 'if (r->>''gondola'')::boolean and rs=''Bestätigt'' and (select count(*)', 'if (r->>''gondola'')::boolean and rs=''Bestätigt'' and not (old.id is not null and old.status=''Bestätigt'' and old.date=rd and old.period=per and old.gondola=1) and (select count(*)');
 definition:=replace(definition, 'd:=d||jsonb_build_object(''date'',rd', 'd:=coalesce(old.data::jsonb,''{}''::jsonb)||d||jsonb_build_object(''date'',rd');
 if definition=original or position('rp<=old.people' in definition)=0 or position('old.gondola=1' in definition)=0 then raise exception 'Expected save function definition changed';end if;
 execute definition;
end $patch$;
create table public.floor_plan_layouts(date date primary key,positions jsonb not null default '{}' check(jsonb_typeof(positions)='object'),revision integer not null default 0,updated timestamptz not null default now());
alter table public.floor_plan_layouts enable row level security;
revoke all on public.floor_plan_layouts from public,anon,authenticated;
grant select on public.floor_plan_layouts to authenticated;
create policy floor_layout_team_read on public.floor_plan_layouts for select to authenticated using((select private.member_role()) is not null);
create function private.save_floor_position(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare day date; number text:=p->>'number'; x numeric; y numeric; layout public.floor_plan_layouts; dimensions jsonb; width numeric; height numeric;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 day:=(p->>'date')::date;
 if day is null or day<'2020-01-01' or day>'2100-12-31' then raise exception 'Datum prüfen.';end if;
 dimensions:='{"1":[98.89,48.89],"2":[98.89,48.89],"3":[98.89,48.89],"4":[98.89,48.89],"5":[48.6,48.89],"6":[48.6,48.89],"7":[48.6,48.89],"8":[48.6,48.89],"20":[98.89,48.89],"21":[98.89,48.89],"22":[98.89,48.89],"23":[98.89,48.89],"24":[109.88,54.32],"31":[48.6,48.89],"32":[48.6,48.89],"33":[48.6,48.89],"55":[48.6,48.89],"60":[48.6,48.89],"61":[48.6,48.89],"62":[48.89,98.89],"63":[48.89,98.89],"64":[48.89,98.89],"65":[48.89,98.89],"66":[48.6,48.89],"67":[48.89,98.89],"68":[98.89,48.89],"77":[48.6,48.89],"88":[48.6,48.89],"120":[48.6,48.89],"121":[48.6,48.89],"122":[48.6,48.89],"123":[48.6,48.89],"124":[109.88,54.32],"131":[48.6,48.89],"132":[48.6,48.89],"133":[48.6,48.89],"160":[48.6,48.89],"161":[48.6,48.89],"162":[48.6,48.89],"163":[48.6,48.89],"220":[48.6,48.89],"221":[48.6,48.89],"222":[48.6,48.89],"223":[48.6,48.89],"262":[48.6,48.89],"263":[48.6,48.89],"555":[48.6,48.89],"666":[48.6,48.89],"777":[48.6,48.89],"888":[48.6,48.89],"T3":[98.89,48.89],"T2":[98.89,48.89],"T1":[98.89,48.89]}'::jsonb;
 if number is null or not dimensions ? number or jsonb_typeof(p->'x') is distinct from 'number' or jsonb_typeof(p->'y') is distinct from 'number' then raise exception 'Tischposition prüfen.';end if;
 x:=(p->>'x')::numeric;y:=(p->>'y')::numeric;width:=(dimensions->number->>0)::numeric;height:=(dimensions->number->>1)::numeric;
 if x<35 or x>1475-width or y<145 or y>1390-height then raise exception 'Der Tisch muss innerhalb des Plans bleiben.';end if;
 perform pg_advisory_xact_lock(922002671);
 select * into layout from public.floor_plan_layouts where date=day for update;
 if coalesce(layout.revision,0)<>coalesce((p->>'revision')::integer,-1) then raise exception 'Der Tagesplan wurde inzwischen geändert. Bitte die Übersicht aktualisieren.' using errcode='40001';end if;
 insert into public.floor_plan_layouts(date,positions,revision) values(day,jsonb_build_object(number,jsonb_build_object('x',round(x,2),'y',round(y,2))),1)
 on conflict(date) do update set positions=jsonb_set(public.floor_plan_layouts.positions,array[number],jsonb_build_object('x',round(x,2),'y',round(y,2))),revision=public.floor_plan_layouts.revision+1,updated=now()
 returning * into layout;
 return jsonb_build_object('date',layout.date,'positions',layout.positions,'revision',layout.revision);
end $fn$;
create function public.save_floor_position(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.save_floor_position(p)$fn$;
revoke all on function private.save_floor_position(jsonb),public.save_floor_position(jsonb) from public,anon;
grant execute on function private.save_floor_position(jsonb),public.save_floor_position(jsonb) to authenticated;
commit;
