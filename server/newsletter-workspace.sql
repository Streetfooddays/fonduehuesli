begin;
create table public.newsletter_workspace(id boolean primary key default true check(id),draft jsonb not null default '{}',contacts jsonb not null default '[]',revision integer not null default 0,updated timestamptz not null default now());
alter table public.newsletter_workspace enable row level security;
revoke all on public.newsletter_workspace from public,anon,authenticated;
grant select on public.newsletter_workspace to authenticated;
create policy newsletter_owner_read on public.newsletter_workspace for select to authenticated using((select private.member_role())='owner');
create function private.newsletter_workspace_save(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare current_revision integer; cleaned jsonb;
begin
 if auth.uid() is null or private.member_role() is distinct from 'owner' then raise exception 'Nur die Administration kann Newsletter verwalten.' using errcode='42501';end if;
 if jsonb_typeof(p->'draft') is distinct from 'object' or jsonb_typeof(p->'contacts') is distinct from 'array' then raise exception 'Newsletterdaten prüfen.';end if;
 if octet_length((p->'draft')::text)>60000 or jsonb_array_length(p->'contacts')>50000 or octet_length((p->'contacts')::text)>15000000 then raise exception 'Entwurf oder Adressliste zu gross.';end if;
 if exists(select 1 from jsonb_array_elements(p->'contacts') c where coalesce(c->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(c->>'email')>254 or length(coalesce(c->>'source',''))>2000 or jsonb_typeof(c->'approved') is distinct from 'boolean') then raise exception 'E-Mail-Adresse oder Freigabe prüfen.';end if;
 select coalesce(jsonb_agg(c),'[]') into cleaned from (select distinct on(lower(c->>'email')) jsonb_build_object('email',lower(c->>'email'),'source',coalesce(c->>'source',''),'approved',(c->>'approved')::boolean) c from jsonb_array_elements(p->'contacts') c order by lower(c->>'email')) t;
 perform pg_advisory_xact_lock(922002673);
 select revision into current_revision from public.newsletter_workspace where id=true for update;
 if coalesce(current_revision,0)<>coalesce((p->>'revision')::integer,-1) then raise exception 'Der Newsletter wurde inzwischen geändert. Bitte neu laden.' using errcode='40001';end if;
 insert into public.newsletter_workspace(id,draft,contacts,revision) values(true,p->'draft',cleaned,1) on conflict(id) do update set draft=excluded.draft,contacts=excluded.contacts,revision=public.newsletter_workspace.revision+1,updated=now() returning revision into current_revision;
 return jsonb_build_object('revision',current_revision);
end $fn$;
create function public.newsletter_workspace_save(p jsonb) returns jsonb language sql set search_path='' as $fn$select private.newsletter_workspace_save(p)$fn$;
revoke all on function private.newsletter_workspace_save(jsonb),public.newsletter_workspace_save(jsonb) from public,anon;
grant execute on function private.newsletter_workspace_save(jsonb),public.newsletter_workspace_save(jsonb) to authenticated;
commit;
