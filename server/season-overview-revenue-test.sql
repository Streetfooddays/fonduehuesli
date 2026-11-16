begin;
do $test$
declare uid uuid;r jsonb;blocked boolean;
begin
 select user_id into uid from public.team_members where active and user_id is not null limit 1;assert uid is not null;
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.save_overview_field('{"date":"2099-02-02","key":"effective_revenue","value":10,"previous":null}');exception when insufficient_privilege then blocked:=true;end;assert blocked;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 r:=public.save_overview_field('{"date":"2099-02-02","key":"kk","value":100,"previous":null}');
 r:=public.save_overview_field('{"date":"2099-02-02","key":"effective_revenue","value":250.5,"previous":null}');assert (r->'values'->>'effective_revenue')::numeric=250.5;assert (r->'values'->>'kk')::numeric=100;
 blocked:=false;begin perform public.save_overview_field('{"date":"2099-02-02","key":"effective_revenue","value":20,"previous":null}');exception when sqlstate 'PT409' then blocked:=true;end;assert blocked;
 blocked:=false;begin perform public.save_overview_field('{"date":"2099-02-02","key":"effective_revenue","value":1.234,"previous":250.5}');exception when raise_exception then blocked:=true;end;assert blocked;
 r:=public.save_overview_field('{"date":"2099-02-02","key":"effective_revenue","value":0,"previous":250.5}');assert (r->'values'->>'effective_revenue')::numeric=0;
 assert not has_function_privilege('anon','public.save_overview_field(jsonb)','execute');
end $test$;
rollback;
