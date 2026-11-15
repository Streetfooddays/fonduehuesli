begin;
do $test$
declare uid uuid; conflicts jsonb; result jsonb; blocked boolean; revision_before integer;
begin
 select user_id into uid from public.team_members where active and user_id is not null limit 1;
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.table_reuse_check('{}');exception when insufficient_privilege then blocked:=true;end;assert blocked,'Anonymous inspection forbidden';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 insert into public.reservations(id,date,time,period,people,data,status,source,table_no,arrived,arrived_at) values
 ('reuse-test-old','2099-11-15','17:00','abend',4,'{"last":"Synthetic"}','Bestätigt','Test','5',true,now()),
 ('reuse-test-next','2099-11-15','19:00','abend',2,'{"last":"Next"}','Bestätigt','Test','',false,null);
 conflicts:=public.table_reuse_check('{"id":"reuse-test-next","tableNo":"55"}');
 assert jsonb_array_length(conflicts)=1 and conflicts->0->'tables'='["55"]'::jsonb,'Physical grouped table detected';
 blocked:=false;begin perform public.set_reservation_table('{"id":"reuse-test-next","revision":0,"tableNo":"55"}');exception when sqlstate 'PT409' then blocked:=true;end;assert blocked,'Assignment requires actual release';
 assert (select table_no='' from public.reservations where id='reuse-test-next'),'Decline leaves assignment unchanged';
 blocked:=false;begin perform public.release_arrived_tables(jsonb_build_object('conflicts',jsonb_set(conflicts,'{0,revision}','999')));exception when sqlstate 'PT409' then blocked:=true;end;assert blocked,'Concurrent change requires new confirmation';
 result:=public.release_arrived_tables(jsonb_build_object('conflicts',conflicts));
 assert (select arrived and arrived_at is not null and released_tables=array['55'] and table_no='5, 55' from public.reservations where id='reuse-test-old'),'Original guest and group remain, only 55 released';
 perform public.set_reservation_table('{"id":"reuse-test-next","revision":0,"tableNo":"55"}');
 assert public.table_reuse_check('{"id":"reuse-test-next","tableNo":"55"}')='[]'::jsonb,'Unchanged table is not prompted again';
 assert jsonb_array_length(public.table_reuse_check('{"date":"2099-11-15","tableNo":"5","people":2}'))=1,'Other part of group still occupied';
 assert public.table_reuse_check('{"date":"2099-11-16","tableNo":"5","people":2}')='[]'::jsonb,'Another day does not block';
 assert public.table_reuse_check('{"date":"2099-11-15","tableNo":"5","people":2,"status":"Warteliste"}')='[]'::jsonb,'Waiting list does not occupy';
 insert into public.reservations(id,date,time,period,people,data,status,source,table_no,gondola,arrived) values
 ('reuse-test-g1','2099-11-16','17:00','abend',2,'{}','Bestätigt','Test','G1',1,true),
 ('reuse-test-g2','2099-11-16','17:00','abend',2,'{}','Bestätigt','Test','G2',1,false),
 ('reuse-test-g3','2099-11-16','17:00','abend',2,'{}','Bestätigt','Test','G3',1,false),
 ('reuse-test-g-next','2099-11-16','19:00','abend',2,'{}','Bestätigt','Test','',0,false);
 conflicts:=public.table_reuse_check('{"id":"reuse-test-g-next","tableNo":"G1"}');
 perform public.release_arrived_tables(jsonb_build_object('conflicts',conflicts));
 result:=public.set_reservation_table('{"id":"reuse-test-g-next","revision":0,"tableNo":"G1"}');
 assert result->>'gondola'='1' and result->'released_tables'='[]'::jsonb,'Released gondola can be reused even when all three were reserved';
 result:=public.set_reservation_arrival(jsonb_build_object('id','reuse-test-g-next','revision',(result->>'revision')::integer,'arrived',true));
 assert result->'released_tables'='[]'::jsonb,'Arrival result carries effective table state';
 select revision into revision_before from public.reservations where id='reuse-test-g1';
 result:=public.set_reservation_arrival(jsonb_build_object('id','reuse-test-g1','revision',revision_before,'arrived',false));
 blocked:=false;begin perform public.set_reservation_arrival(jsonb_build_object('id','reuse-test-g1','revision',(result->>'revision')::integer,'arrived',true));exception when sqlstate 'PT409' then blocked:=true;end;
 assert blocked,'Newly arriving guest cannot bypass a second arrived party';
 assert not exists(select 1 from public.mail_outbox where reservation_id like 'reuse-test-%'),'No emails queued';
 assert not has_function_privilege('anon','public.release_arrived_tables(jsonb)','execute'),'Anonymous release forbidden';
end $test$;
rollback;
