begin;

alter table public.mail_inbox add column voucher_sent_at timestamptz;
alter table public.voucher_documents
  add column mail_id text references public.mail_inbox (id) on delete set null;
create index voucher_documents_mail_id on public.voucher_documents (mail_id) where mail_id is not null;

create function public.issue_voucher(p_id uuid, p_user uuid, p_data jsonb, p_mail_id text)
returns public.voucher_documents
language plpgsql security invoker set search_path = ''
as $$
declare
  voucher public.voucher_documents;
  previous_mail text;
  already_issued boolean;
begin
  -- Match the issuing lock used by the original three-argument function.
  perform pg_catalog.pg_advisory_xact_lock(40260319);
  select mail_id into previous_mail from public.voucher_documents where id = p_id;
  already_issued := found;
  if already_issued and previous_mail is distinct from p_mail_id then
    raise exception 'Voucher request already bound to another source';
  end if;
  voucher := public.issue_voucher(p_id, p_user, p_data);
  if not already_issued and p_mail_id is not null then
    update public.voucher_documents set mail_id = p_mail_id where id = p_id returning * into voucher;
  end if;
  return voucher;
end;
$$;

create function public.finish_voucher_delivery(p_id uuid, p_resend_id text)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  voucher public.voucher_documents;
  archived_at timestamptz;
begin
  select * into strict voucher from public.voucher_documents where id = p_id for update;
  if voucher.sent_at is null then
    if voucher.first_send_attempt is null or nullif(p_resend_id, '') is null then
      raise exception 'Voucher mail was not accepted';
    end if;
    update public.voucher_documents
      set resend_id = p_resend_id, sent_at = now() where id = p_id returning * into voucher;
  end if;

  if voucher.mail_id is not null then
    update public.mail_inbox
      set state = case when state = 'confirmed' then state else 'ignored' end,
          voucher_sent_at = voucher.sent_at,
          updated = now()
      where id = voucher.mail_id and voucher_sent_at is null;
    select voucher_sent_at into archived_at from public.mail_inbox where id = voucher.mail_id;
  end if;
  return jsonb_build_object('sent_at', voucher.sent_at, 'mail_id', voucher.mail_id, 'voucher_sent_at', archived_at);
end;
$$;

revoke all on function public.issue_voucher(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.finish_voucher_delivery(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_voucher(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.finish_voucher_delivery(uuid, text) to service_role;

commit;
