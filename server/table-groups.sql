begin;
create function private.table_group_assignment(value text,people integer) returns text language plpgsql immutable set search_path='' as $fn$
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
 return trim(value);
end $fn$;
create function private.apply_table_group_rules() returns trigger language plpgsql set search_path='' as $fn$
begin
 if tg_op='UPDATE' then
  if new.table_no is not distinct from old.table_no and new.people is not distinct from old.people then return new;end if;
 end if;
 if new.status='Storniert' then return new;end if;
 new.table_no:=private.table_group_assignment(new.table_no,new.people);
 return new;
end $fn$;
revoke all on function private.table_group_assignment(text,integer),private.apply_table_group_rules() from public,anon;
grant execute on function private.table_group_assignment(text,integer),private.apply_table_group_rules() to authenticated;
create trigger reservation_table_group_rules before insert or update of table_no,people on public.reservations for each row execute function private.apply_table_group_rules();
-- Return table changes made by the rule together with inline guest-count saves.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('private.set_reservation_people(jsonb)'::regprocedure);
 if position('''people'',booking.people,''data'',booking.data' in definition)=0 then raise exception 'Guest-count return structure changed';end if;
 definition:=replace(definition,'''people'',booking.people,''data'',booking.data','''people'',booking.people,''table_no'',booking.table_no,''data'',booking.data');
 execute definition;
end $patch$;
commit;
