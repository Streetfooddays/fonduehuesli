-- Shared online availability; public responses contain no guest information or counts.
create table public.reservation_calendar_settings (
 date date primary key,
 status text not null default 'auto' check(status in ('auto','green','orange','red')),
 opening text not null default 'auto' check(opening in ('auto','open','closed')),
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
alter table public.reservation_calendar_settings enable row level security;
revoke all on public.reservation_calendar_settings from anon,authenticated;
grant select on public.reservation_calendar_settings to authenticated;
create policy calendar_team_read on public.reservation_calendar_settings for select to authenticated
 using((select private.member_role()) is not null);

create function private.calendar_regular_open(d date) returns boolean
language sql immutable set search_path='' as $$
 select d between date '2026-11-11' and date '2027-02-06' and d<>date '2026-11-22' and (
 (extract(month from d)=11 and extract(isodow from d) between 2 and 7) or
 (extract(month from d)=12 and (extract(day from d)<=23 or extract(day from d)=31)) or
 (extract(month from d) in (1,2) and extract(isodow from d) between 2 and 6));
$$;
create function private.calendar_color(people bigint, override_status text) returns text
language sql immutable set search_path='' as $$
 select case when override_status in ('green','orange','red') then override_status
 when coalesce(people,0)<=100 then 'green' else 'orange' end;
$$;
create function private.calendar_before_cutoff(d date, at_time timestamptz) returns boolean
language sql stable set search_path='' as $$
 select d>(at_time at time zone 'Europe/Zurich')::date or
 (d=(at_time at time zone 'Europe/Zurich')::date and (at_time at time zone 'Europe/Zurich')::time<time '12:00');
$$;
revoke all on function private.calendar_regular_open(date),private.calendar_color(bigint,text),private.calendar_before_cutoff(date,timestamptz) from public;

create function public.reservation_calendar(p_from date default '2026-11-11',p_to date default '2027-02-06')
returns table(date date,status text,is_open boolean,bookable boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then
  raise exception 'Ungültiger Kalenderzeitraum.' using errcode='22023';
 end if;
 return query
 with dates as (select s::date d from pg_catalog.generate_series(
  greatest(p_from,'2026-11-11'::date)::timestamp,least(p_to,'2027-02-06'::date)::timestamp,interval '1 day') s),
 occupancy as (select r.date d,sum(greatest(r.people,0)) people from public.reservations r
  where r.deleted_at is null and r.status in ('Offen','Rückfrage nötig','Bestätigt')
  and r.date between p_from and p_to group by r.date),
 availability as (select dates.d,private.calendar_color(o.people,s.status) color,
  case s.opening when 'open' then true when 'closed' then false else private.calendar_regular_open(dates.d) end opened
  from dates left join occupancy o on o.d=dates.d left join public.reservation_calendar_settings s on s.date=dates.d)
 select a.d,a.color,a.opened,a.opened and a.color<>'red' and private.calendar_before_cutoff(a.d,statement_timestamp()) from availability a order by a.d;
end;
$$;
revoke all on function public.reservation_calendar(date,date) from public;
grant execute on function public.reservation_calendar(date,date) to anon,authenticated;

create function public.save_calendar_setting(p jsonb) returns public.reservation_calendar_settings
language plpgsql security definer set search_path='' as $$
declare d date; current_row public.reservation_calendar_settings; result public.reservation_calendar_settings;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 d:=(p->>'date')::date;
 if d is null or d not between date '2026-11-11' and date '2027-02-06' or
  p->>'status' is null or p->>'status' not in ('auto','green','orange','red') or
  p->>'opening' is null or p->>'opening' not in ('auto','open','closed') then
  raise exception 'Ungültige Kalendereinstellung.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('reservation-calendar:'||d::text,0));
 select * into current_row from public.reservation_calendar_settings s where s.date=d;
 if coalesce(current_row.revision,0) is distinct from (p->>'revision')::integer then
  raise exception 'Dieser Tag wurde zwischenzeitlich geändert. Bitte aktualisieren.' using errcode='40001';end if;
 insert into public.reservation_calendar_settings(date,status,opening,revision,updated_by)
 values(d,p->>'status',p->>'opening',coalesce(current_row.revision,0)+1,auth.uid())
 on conflict(date) do update set status=excluded.status,opening=excluded.opening,revision=excluded.revision,updated_at=now(),updated_by=auth.uid()
 returning * into result;
 return result;
end;
$$;
revoke all on function public.save_calendar_setting(jsonb) from public,anon;
grant execute on function public.save_calendar_setting(jsonb) to authenticated;
