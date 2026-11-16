-- Team-only daily accounting and staffing. Reservation totals remain derived live.
create table if not exists public.reservation_overview_days (
 date date primary key,
 values jsonb not null default '{}'::jsonb check(jsonb_typeof(values)='object'),
 average_basis text not null default 'total' check(average_basis in ('total','abend')),
 revision integer not null default 1,
 updated timestamptz not null default now()
);
alter table public.reservation_overview_days enable row level security;
revoke all on public.reservation_overview_days from anon,authenticated;
grant select on public.reservation_overview_days to authenticated;
create policy overview_team_read on public.reservation_overview_days for select to authenticated using (private.member_role() is not null);
create or replace function private.save_overview_field(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d date; k text; v jsonb; r public.reservation_overview_days;
begin
 if auth.uid() is null or private.member_role() is null then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 d:=(p->>'date')::date;k:=p->>'key';v:=p->'value';
 if d is null or k is null or k not in ('kk','twint','cash','rechnung','tg','cds','team','service1','service2','service3','team2','abwasch','kueche1','kueche2','kueche3') then raise exception 'Ungültiges Übersichts-Feld.';end if;
 if k in ('kk','twint','cash','rechnung','tg') then
  if jsonb_typeof(v) is distinct from 'number' or abs((v#>>'{}')::numeric)>10000000 or round((v#>>'{}')::numeric,2)<>(v#>>'{}')::numeric then raise exception 'Betrag mit maximal zwei Nachkommastellen eingeben.';end if;
 else
  if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>300 then raise exception 'Text mit maximal 300 Zeichen eingeben.';end if;
 end if;
 insert into public.reservation_overview_days(date) values(d) on conflict do nothing;
 select * into r from public.reservation_overview_days where date=d for update;
 if coalesce(r.values->k,'null'::jsonb) is distinct from coalesce(p->'previous','null'::jsonb) then raise exception 'Dieses Feld wurde zwischenzeitlich geändert. Bitte aktualisieren und erneut prüfen.' using errcode='PT409';end if;
 update public.reservation_overview_days set values=jsonb_set(values,array[k],v),revision=revision+1,updated=now() where date=d returning * into r;
 return to_jsonb(r);
end $$;
create or replace function public.save_overview_field(p jsonb) returns jsonb language sql set search_path='' as $$select private.save_overview_field(p)$$;
revoke all on function public.save_overview_field(jsonb) from public,anon;
revoke all on function private.save_overview_field(jsonb) from public,anon;
grant execute on function public.save_overview_field(jsonb),private.save_overview_field(jsonb) to authenticated;
