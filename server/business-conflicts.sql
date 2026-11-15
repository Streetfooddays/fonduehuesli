-- Business conflicts must not masquerade as retryable serialization failures.
-- Preserve every validation, function privilege, owner, security mode and signature.
do $migration$
declare f record; definition text; changed integer:=0;
begin
 for f in
  select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
    and p.prosrc like '%40001%'
 loop
  definition:=pg_get_functiondef(f.oid);
  if position('errcode=''40001''' in definition)=0 then
   raise exception 'Unexpected serialization code usage in %',f.oid::regprocedure;
  end if;
  execute replace(definition,'''40001''','''PT409''');
  changed:=changed+1;
 end loop;
 if changed not in (0,15) then raise exception 'Expected 15 conflict functions, found %',changed;end if;
end $migration$;
notify pgrst,'reload schema';