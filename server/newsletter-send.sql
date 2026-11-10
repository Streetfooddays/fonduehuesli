begin;
create or replace function private.can_manage_newsletter() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.team_members where user_id=auth.uid() and active and (role='owner' or email='reservation@fonduehuesli.ch'))$$;
revoke all on function private.can_manage_newsletter() from public,anon;
grant execute on function private.can_manage_newsletter() to authenticated;
drop policy if exists newsletter_owner_read on public.newsletter_workspace;
create policy newsletter_manage_read on public.newsletter_workspace for select to authenticated using((select private.can_manage_newsletter()));
create table public.newsletter_campaigns(id uuid primary key,subject text not null,draft jsonb not null,created_at timestamptz not null default now(),created_by uuid references auth.users(id),is_test boolean not null default false);
create table public.newsletter_subscriptions(email text primary key,token uuid not null unique default gen_random_uuid(),unsubscribed_at timestamptz);
create table public.newsletter_batches(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.newsletter_campaigns(id),recipients jsonb not null,state text not null default 'pending' check(state in('pending','sending','sent','failed','skipped')),lease_until timestamptz,first_attempt_at timestamptz,provider_result jsonb,last_error text,unique(campaign_id,id));
alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_subscriptions enable row level security;
alter table public.newsletter_batches enable row level security;
revoke all on public.newsletter_campaigns,public.newsletter_subscriptions,public.newsletter_batches from public,anon,authenticated;
grant all on public.newsletter_campaigns,public.newsletter_subscriptions,public.newsletter_batches to service_role;
create function public.newsletter_create(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid:=(p->>'id')::uuid; emails text[]; d jsonb; is_test boolean:=coalesce((p->>'test')::boolean,false);
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 if exists(select 1 from public.newsletter_campaigns where id=cid) then return cid;end if;
 if is_test then d:=p->'draft';emails:=array[p->>'recipient'];
 else select draft into d from public.newsletter_workspace where id=true and revision=(p->>'revision')::integer;
 if d is null then raise exception 'Entwurf wurde geändert. Bitte speichern und erneut prüfen.';end if;
 select array_agg(email order by email) into emails from (select distinct lower(c->>'email') email from public.newsletter_workspace w,jsonb_array_elements(w.contacts)c where w.id=true and c->>'approved'='true' and not exists(select 1 from public.newsletter_subscriptions s where s.email=lower(c->>'email') and s.unsubscribed_at is not null))t;
 end if;
 if coalesce(cardinality(emails),0)=0 then raise exception 'Keine freigegebenen Empfänger vorhanden.';end if;
 insert into public.newsletter_subscriptions(email) select unnest(emails) on conflict do nothing;
 insert into public.newsletter_campaigns(id,subject,draft,created_by,is_test) values(cid,d->>'subject',d,(p->>'user_id')::uuid,is_test);
 insert into public.newsletter_batches(campaign_id,recipients)
 select cid,jsonb_agg(jsonb_build_object('email',email,'token',s.token) order by n) from unnest(emails) with ordinality e(email,n) join public.newsletter_subscriptions s using(email) group by (n-1)/25;
 return cid;
end$$;
create function public.newsletter_claim(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.newsletter_batches; d jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Kein Zugriff.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into b from public.newsletter_batches where campaign_id=p_id and state in('pending','failed','sending') order by case when state='pending' then 1 else 0 end,id limit 1 for update;
 if b.id is null then return null;end if;
 if b.lease_until>now() then raise exception 'Versand läuft bereits. Bitte kurz warten.';end if;
 if b.first_attempt_at<now()-interval '23 hours' then raise exception 'Versandstatus dieser Gruppe muss manuell in Resend geprüft werden. Kein erneuter Versand nach Ablauf des Duplikatschutzes.';end if;
 if b.first_attempt_at is null then
 select coalesce(jsonb_agg(r),'[]') into b.recipients from jsonb_array_elements(b.recipients)r where not exists(select 1 from public.newsletter_subscriptions s where s.email=r->>'email' and s.unsubscribed_at is not null);
 end if;
 update public.newsletter_batches set recipients=b.recipients,state=case when jsonb_array_length(b.recipients)=0 then 'skipped' else 'sending' end,lease_until=now()+interval '45 seconds',first_attempt_at=coalesce(first_attempt_at,now()),last_error=null where id=b.id;
 select draft into d from public.newsletter_campaigns where id=p_id;
 return jsonb_build_object('id',b.id,'recipients',b.recipients,'draft',d);
end$$;
revoke all on function public.newsletter_create(jsonb),public.newsletter_claim(uuid) from public,anon,authenticated;
grant execute on function public.newsletter_create(jsonb),public.newsletter_claim(uuid) to service_role;
commit;

create or replace function private.newsletter_workspace_save(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare current_revision integer; cleaned jsonb;
begin
 if auth.uid() is null or not private.can_manage_newsletter() then raise exception 'Nur die Administration kann Newsletter verwalten.' using errcode='42501';end if;
 if jsonb_typeof(p->'draft') is distinct from 'object' or jsonb_typeof(p->'contacts') is distinct from 'array' then raise exception 'Newsletterdaten prüfen.';end if;
 if octet_length((p->'draft')::text)>60000 or jsonb_array_length(p->'contacts')>50000 or octet_length((p->'contacts')::text)>15000000 then raise exception 'Entwurf oder Adressliste zu gross.';end if;
 if exists(select 1 from jsonb_array_elements(p->'contacts') c where coalesce(c->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(c->>'email')>254 or length(coalesce(c->>'source',''))>2000 or jsonb_typeof(c->'approved') is distinct from 'boolean') then raise exception 'E-Mail-Adresse oder Freigabe prüfen.';end if;
 select coalesce(jsonb_agg(c),'[]') into cleaned from (select distinct on(lower(c->>'email')) jsonb_build_object('email',lower(c->>'email'),'source',coalesce(c->>'source',''),'approved',(c->>'approved')::boolean,'first_name',left(coalesce(c->>'first_name',''),200),'last_name',left(coalesce(c->>'last_name',''),200)) c from jsonb_array_elements(p->'contacts') c order by lower(c->>'email')) t;
 perform pg_advisory_xact_lock(922002673);
 select revision into current_revision from public.newsletter_workspace where id=true for update;
 if coalesce(current_revision,0)<>coalesce((p->>'revision')::integer,-1) then raise exception 'Der Newsletter wurde inzwischen geändert. Bitte neu laden.' using errcode='40001';end if;
 insert into public.newsletter_workspace(id,draft,contacts,revision) values(true,p->'draft',cleaned,1) on conflict(id) do update set draft=excluded.draft,contacts=excluded.contacts,revision=public.newsletter_workspace.revision+1,updated=now() returning revision into current_revision;
 return jsonb_build_object('revision',current_revision);
end $fn$;
