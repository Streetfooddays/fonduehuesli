-- Public website availability for the evening service, with no guest data.
create function public.reservation_calendar_gondolas(p_from date default '2026-11-11',p_to date default '2027-02-06')
returns table(date date,status text,is_open boolean,bookable boolean,gondolas_available boolean)
language sql stable security definer set search_path='' as $$
 with active as (
  select r.date, greatest(1,cardinality(g.tables)) as occupied
  from public.reservations r
  cross join lateral (select private.gondola_tables(r.table_no) as tables) g
  where r.date between p_from and p_to and r.deleted_at is null
   and r.status in ('Offen','Rückfrage nötig','Bestätigt')
   and coalesce(nullif(r.period,''),case when r.time='' then 'ungeklaert' when r.time<'16:00' then 'mittag' else 'abend' end) in ('abend','ungeklaert')
   and (r.gondola=1 or lower(coalesce(r.data::jsonb->>'gondola','')) in ('ja','true','1') or cardinality(g.tables)>0)
   and not (cardinality(g.tables)>0 and g.tables <@ r.released_tables)
 ), occupancy as (select a.date,sum(a.occupied) as used from active a group by a.date)
 select c.date,c.status,c.is_open,c.bookable,coalesce(o.used,0)<3
 from public.reservation_calendar(p_from,p_to) c left join occupancy o on o.date=c.date
 order by c.date;
$$;
revoke all on function public.reservation_calendar_gondolas(date,date) from public;
grant execute on function public.reservation_calendar_gondolas(date,date) to anon,authenticated;
