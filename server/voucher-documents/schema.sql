begin;

create table public.voucher_documents (
  id uuid primary key,
  issued_by uuid not null,
  issued_on date not null,
  due_on date not null,
  fiscal_year integer not null,
  serial integer not null check (serial > 0),
  voucher_no text not null unique,
  invoice_no text not null unique,
  name text not null,
  street text not null,
  building text not null,
  postcode text not null,
  city text not null,
  email text not null,
  note text not null,
  amount_cents integer not null check (amount_cents between 1 and 99999999),
  documents jsonb,
  first_send_attempt timestamptz,
  resend_id text,
  sent_at timestamptz,
  unique (fiscal_year, serial)
);

alter table public.voucher_documents enable row level security;
revoke all on public.voucher_documents from public, anon, authenticated;
grant select, insert, update on public.voucher_documents to service_role;
create index voucher_documents_latest on public.voucher_documents (issued_on desc, serial desc);

create function public.issue_voucher(p_id uuid, p_user uuid, p_data jsonb)
returns public.voucher_documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.voucher_documents;
  today date := (now() at time zone 'Europe/Zurich')::date;
  yr integer := extract(year from today)::integer;
  next_serial integer;
  suffix text;
begin
  -- Preview retries and concurrent issues are serialized before assigning a number.
  perform pg_catalog.pg_advisory_xact_lock(40260319);
  select * into existing from public.voucher_documents where id = p_id;
  if found then
    if existing.issued_by <> p_user or jsonb_build_object(
      'name', existing.name, 'street', existing.street, 'building', existing.building,
      'postcode', existing.postcode, 'city', existing.city, 'email', existing.email,
      'note', existing.note, 'amount_cents', existing.amount_cents
    ) <> p_data then
      raise exception 'Voucher request already used';
    end if;
    return existing;
  end if;

  select greatest(coalesce(max(serial), 0), case when yr = 2026 then 26 else 0 end) + 1
    into next_serial from public.voucher_documents where fiscal_year = yr;
  suffix := lpad(next_serial::text, greatest(3, length(next_serial::text)), '0');
  insert into public.voucher_documents (
    id, issued_by, issued_on, due_on, fiscal_year, serial, voucher_no, invoice_no,
    name, street, building, postcode, city, email, note, amount_cents
  ) values (
    p_id, p_user, today, today + 14, yr, next_serial, right(yr::text, 2) || '_' || suffix,
    'RE-GS-' || yr || '-' || suffix, p_data->>'name', p_data->>'street', p_data->>'building',
    p_data->>'postcode', p_data->>'city', p_data->>'email', p_data->>'note', (p_data->>'amount_cents')::integer
  ) returning * into existing;
  return existing;
end;
$$;
revoke all on function public.issue_voucher(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.issue_voucher(uuid, uuid, jsonb) to service_role;

commit;
