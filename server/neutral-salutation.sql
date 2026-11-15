begin;
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('private.confirmation_prepare(jsonb)'::regprocedure);
 if position('not in (''Liebe'',''Lieber'')' in definition)=0 then raise exception 'Expected salutation validation changed';end if;
 execute replace(definition,'not in (''Liebe'',''Lieber'')','not in (''Liebe'',''Lieber'',''Hallo'')');
end $patch$;
commit;
