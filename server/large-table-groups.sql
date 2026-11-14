begin;
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
  cluster:=array[base::text,(base+100)::text,(base+200)::text,case when base=20 then '131' else (base+110)::text end];
  if base::text=any(selected) and selected<@cluster then
   if people>11 then raise exception 'Die Tischgruppe % bietet maximal 11 Personen Platz. Bitte weitere Tische zuweisen.',array_to_string(cluster,' / ');end if;
   return array_to_string(cluster[1:(case when people<=4 then 1 when people<=6 then 2 when people<=8 then 3 else 4 end)],', ');
  end if;
 end loop;
 return trim(value);
end $fn$;
commit;
