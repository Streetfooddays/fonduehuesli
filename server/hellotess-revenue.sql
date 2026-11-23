-- Dedicated inbound channel. No register credentials, guest data or article data are stored.
create table private.hellotess_revenue_config (
 id boolean primary key default true check(id),enabled boolean not null default false,
 key_hash text not null check(key_hash~'^[a-f0-9]{64}$'),customer_host text not null,
 room_ids text[] not null,room_names text[] not null
);
alter table private.hellotess_revenue_config enable row level security;
revoke all on private.hellotess_revenue_config from public,anon,authenticated;
create table private.hellotess_closed_shifts (
 shift_id text primary key,date date not null,cents bigint not null check(abs(cents)<=1000000000),
 source_order bigint not null,event_id text not null,terminal_id text not null,closed_at text not null,
 rooms jsonb not null,previous_effective jsonb,received_at timestamptz not null default now()
);
alter table private.hellotess_closed_shifts enable row level security;
revoke all on private.hellotess_closed_shifts from public,anon,authenticated;
create function public.hellotess_revenue_config() returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(c) from private.hellotess_revenue_config c where id=true;
$$;
revoke all on function public.hellotess_revenue_config() from public,anon,authenticated;
grant execute on function public.hellotess_revenue_config() to service_role;
create function public.import_hellotess_revenue(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d date; amount bigint; shift text; old private.hellotess_closed_shifts; ledger public.reservation_overview_days; total numeric; shift_count integer;
begin
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'cents') is distinct from 'number' or jsonb_typeof(p->'source_order') is distinct from 'number' then raise exception 'Ungültiger Abschluss.';end if;
 d:=(p->>'date')::date;amount:=(p->>'cents')::bigint;shift:=p->>'shift_id';
 if d is null or shift is null or length(shift) not between 1 and 128 or amount is null or abs(amount)>1000000000 or (p->>'cents')::numeric<>amount or (p->>'source_order')::numeric<0 or (p->>'source_order')::numeric<>trunc((p->>'source_order')::numeric) or coalesce(p->>'event_id','')='' or coalesce(p->>'terminal_id','')='' or coalesce(p->>'closed_at','')='' or jsonb_typeof(p->'rooms') is distinct from 'array' then raise exception 'Ungültiger Abschluss.';end if;
 perform pg_advisory_xact_lock(hashtextextended('hellotess-revenue',0));
 select * into old from private.hellotess_closed_shifts where shift_id=shift;
 if old.shift_id is not null then
  if old.date<>d then raise exception 'Kassentag des Abschlusses hat sich geändert.';end if;
  if (p->>'source_order')::bigint<old.source_order then return jsonb_build_object('duplicate',true,'date',d);end if;
  if old.cents=amount then
   update private.hellotess_closed_shifts set source_order=greatest(source_order,(p->>'source_order')::bigint) where shift_id=shift;
   return jsonb_build_object('duplicate',true,'date',d);
  end if;
  if (p->>'source_order')::bigint=old.source_order then raise exception 'Widersprüchlicher Abschluss.';end if;
 end if;
 insert into public.reservation_overview_days(date) values(d) on conflict do nothing;
 select * into ledger from public.reservation_overview_days where date=d for update;
 insert into private.hellotess_closed_shifts(shift_id,date,cents,source_order,event_id,terminal_id,closed_at,rooms,previous_effective)
 values(shift,d,amount,(p->>'source_order')::bigint,p->>'event_id',p->>'terminal_id',p->>'closed_at',p->'rooms',ledger.values->'effective_revenue')
 on conflict(shift_id) do update set cents=excluded.cents,source_order=excluded.source_order,event_id=excluded.event_id,closed_at=excluded.closed_at,rooms=excluded.rooms,previous_effective=excluded.previous_effective,received_at=now();
 select sum(cents)::numeric/100,count(*) into total,shift_count from private.hellotess_closed_shifts where date=d;
 if abs(total)>10000000 then raise exception 'Tagesumsatz ausserhalb des erlaubten Bereichs.';end if;
 update public.reservation_overview_days set values=values||jsonb_build_object('effective_revenue',total,'hellotess_revenue',total,'hellotess_imported_at',now(),'hellotess_shift_count',shift_count),revision=revision+1,updated=now() where date=d;
 return jsonb_build_object('date',d,'revenue',total,'closed_shifts',shift_count);
end;
$$;
revoke all on function public.import_hellotess_revenue(jsonb) from public,anon,authenticated;
grant execute on function public.import_hellotess_revenue(jsonb) to service_role;
