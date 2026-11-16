-- Correction: table 20 alone 1–4, plus 120 for 5–8, plus 220 for 9–11.
create or replace function private.table_group_assignment(value text,people integer) returns text language plpgsql immutable set search_path='' as $fn$
declare cleaned text; selected text[]; cluster text[]; base integer; limits integer[];
begin
 if people is null or people<1 or coalesce(trim(value),'')='' then return coalesce(trim(value),'');end if;
 cleaned:=regexp_replace(upper(trim(value)),'^TISCHE?[[:space:]]*','','g');
 cleaned:=regexp_replace(cleaned,'[[:space:]]+UND[[:space:]]+',',','g');
 if cleaned !~ '^[0-9[:space:],;/+&]+$' then return trim(value);end if;
 selected:=array(select distinct token from unnest(regexp_split_to_array(cleaned,'[[:space:],;/+&]+')) token where token<>'');
 for base in 5..8 loop
  cluster:=array[base::text,repeat(base::text,2),repeat(base::text,3)];
  if base::text=any(selected) and selected<@cluster then
   return array_to_string(cluster[1:least(3,(people+1)/2)],', ');
  end if;
 end loop;
 for base in 20..23 loop
  cluster:=case when base=20 then array['20','120','220'] else array[base::text,(base+100)::text,(base+200)::text,(base+109)::text] end;
  limits:=case when base=20 then array[4,8,11] else array[4,6,8,11] end;
 if base::text=any(selected) and selected<@cluster then
   return array_to_string(cluster[1:(case when people<=limits[1] then 1 when people<=limits[2] then 2 when people<=limits[3] then 3 else cardinality(cluster) end)],', ');
  end if;
 end loop;
 return trim(value);
end $fn$;
