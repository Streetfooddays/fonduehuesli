begin;
select pg_advisory_xact_lock(922002670);
select pg_advisory_xact_lock(922002671);
lock table public.reservations,public.floor_plan_layouts in share row exclusive mode;
-- Exact tokens are mapped simultaneously, so 33 -> 32 never becomes 31 -> 30.
create function private.renumber_tables_20261115(value text) returns text language sql immutable set search_path='' as $fn$
 select coalesce(string_agg(case m[1] when '31' then '30' when '131' then '130' when '32' then '31' when '132' then '131' when '33' then '32' when '133' then '132' else m[1] end,'' order by ord),'') from regexp_matches(value,'(\m(?:31|131|32|132|33|133)\M|.)','g') with ordinality as t(m,ord)
$fn$;
revoke all on function private.renumber_tables_20261115(text) from public,anon,authenticated;
-- The transaction holds the original assignments until verification completes.
create temporary table renumber_before on commit drop as select * from public.reservations;
create temporary table layouts_before on commit drop as select * from public.floor_plan_layouts;
alter table public.reservations disable trigger reservation_table_group_rules;
update public.reservations set table_no=private.renumber_tables_20261115(table_no),revision=revision+1,updated=now() where table_no ~ '\m(31|32|33|131|132|133)\M';
update public.floor_plan_layouts l set positions=(select jsonb_object_agg(private.renumber_tables_20261115(key),value) from jsonb_each(l.positions)),revision=revision+1,updated=now() where positions ?| array['31','32','33','131','132','133'];
alter table public.reservations enable trigger reservation_table_group_rules;
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('private.save_floor_position(jsonb)'::regprocedure);
 if position('"33":' in definition)=0 or position('"133":' in definition)=0 then raise exception 'Position dimensions changed';end if;
 execute replace(replace(definition,'"33":','"30":'),'"133":','"130":');
end $patch$;
create or replace function private.table_group_assignment(value text,people integer) returns text language plpgsql immutable set search_path='' as $fn$
declare cleaned text; selected text[]; cluster text[]; base integer;
begin
 if people is null or people<1 or coalesce(trim(value),'')='' then return coalesce(trim(value),'');end if;
 cleaned:=regexp_replace(upper(trim(value)),'^TISCHE?[[:space:]]*','','g');
 cleaned:=regexp_replace(cleaned,'[[:space:]]+UND[[:space:]]+',',','g');
 if cleaned !~ '^[0-9[:space:],;/+&]+$' then return trim(value);end if;
 selected:=array(select distinct token from unnest(regexp_split_to_array(cleaned,'[[:space:],;/+&]+')) token where token<>'');
 for base in 5..8 loop
  cluster:=array[base::text,repeat(base::text,2),repeat(base::text,3)];
  if base::text=any(selected) and selected<@cluster then
   if people>6 then raise exception 'Die Tischgruppe % / % / % bietet maximal 6 Personen Platz. Bitte weitere Tische zuweisen.',cluster[1],cluster[2],cluster[3];end if;
   return array_to_string(cluster[1:((people+1)/2)],', ');
  end if;
 end loop;
 for base in 20..23 loop
  cluster:=array[base::text,(base+100)::text,(base+200)::text,case when base=20 then '130' else (base+109)::text end];
  if base::text=any(selected) and selected<@cluster then
   if people>11 then raise exception 'Die Tischgruppe % bietet maximal 11 Personen Platz. Bitte weitere Tische zuweisen.',array_to_string(cluster,' / ');end if;
   return array_to_string(cluster[1:(case when people<=4 then 1 when people<=6 then 2 when people<=8 then 3 else 4 end)],', ');
  end if;
 end loop;
 return trim(value);
end $fn$;

do $verify$
begin
 assert private.renumber_tables_20261115('31, 131 / 32 + 132; 33 & 133; 1310 T31')='30, 130 / 31 + 131; 32 & 132; 1310 T31','Exact simultaneous mapping';
 assert not exists(select 1 from public.reservations r full join renumber_before b using(id) where r.id is null or b.id is null or (to_jsonb(r)-array['table_no','revision','updated']) is distinct from (to_jsonb(b)-array['table_no','revision','updated']) or r.table_no is distinct from private.renumber_tables_20261115(b.table_no)),'Only table numbers may change';
 assert not exists(select 1 from layouts_before b join public.floor_plan_layouts l using(date),lateral jsonb_each(b.positions) p where l.positions->private.renumber_tables_20261115(p.key) is distinct from p.value),'Moved positions remain attached to the same physical table';
end $verify$;
commit;
