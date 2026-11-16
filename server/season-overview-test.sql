begin;
do $test$
declare uid uuid;r jsonb;blocked boolean;n integer;
begin
 select user_id into uid from public.team_members where active and user_id is not null limit 1;assert uid is not null;
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.save_overview_field('{"date":"2099-02-01","key":"kk","value":10,"previous":null}');exception when insufficient_privilege then blocked:=true;end;assert blocked,'Unauthenticated mutation rejected';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 r:=public.save_overview_field('{"date":"2099-02-01","key":"kk","value":100.5,"previous":null}');assert r->'values'->>'kk'='100.5';
 r:=public.save_overview_field('{"date":"2099-02-01","key":"cds","value":"Synthetic","previous":null}');assert r->'values'->>'kk'='100.5','Field patch preserves other cells';
 blocked:=false;begin perform public.save_overview_field('{"date":"2099-02-01","key":"kk","value":20,"previous":null}');exception when sqlstate 'PT409' then blocked:=true;end;assert blocked,'Concurrent edit protected';
 blocked:=false;begin perform public.save_overview_field('{"date":"2099-02-01","key":"kk","value":1.234,"previous":100.5}');exception when raise_exception then blocked:=true;end;assert blocked,'Fraction validation';
 assert not has_table_privilege('anon','public.reservation_overview_days','select'),'Staff names private';
 assert not has_table_privilege('authenticated','public.reservation_overview_days','update'),'Only validated RPC writes';
 assert not has_function_privilege('anon','public.save_overview_field(jsonb)','execute'),'Anonymous writes forbidden';
 for n in 1..4 loop assert private.table_group_assignment('20',n)='20';end loop;
 for n in 5..8 loop assert private.table_group_assignment('20',n)='20, 120';end loop;
 for n in 9..12 loop assert private.table_group_assignment('20',n)='20, 120, 220';end loop;
 assert private.table_group_assignment('21',7)='21, 121, 221';
 assert private.table_group_assignment('21',9)='21, 121, 221, 130';
 assert private.table_group_assignment('124',10)='124';
end $test$;
rollback;
