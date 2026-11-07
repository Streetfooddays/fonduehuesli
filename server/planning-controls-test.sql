begin;
do $test$
declare uid uuid; r jsonb; blocked boolean;
begin
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 assert uid is not null,'Verified team member required for synthetic tests';
 insert into public.reservations(id,date,time,period,people,data,status,source,gondola) values
 ('planning-test-big','2099-02-01','18:00','abend',90,'{"last":"Synthetic"}','Bestätigt','Test',0),
 ('planning-test-edit','2099-02-01','18:00','abend',4,'{"last":"Synthetic","excel_source":{"row":12}}','Bestätigt','Test',1),
 ('planning-test-g2','2099-02-01','18:00','abend',2,'{"last":"Synthetic"}','Bestätigt','Test',1),
 ('planning-test-g3','2099-02-01','18:00','abend',2,'{"last":"Synthetic"}','Bestätigt','Test',1);
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.save_floor_position('{"date":"2099-02-01","number":"1","x":100,"y":200,"revision":0}');exception when insufficient_privilege then blocked:=true;end;
 assert blocked,'Unauthenticated layout writes must be blocked';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 r:='{"id":"planning-test-edit","revision":0,"date":"2099-02-01","time":"18:00","people":4,"status":"Bestätigt","gondola":true,"override":false,"tableNo":"1, 2","note":"Changed","data":{"last":"Synthetic"}}';
 perform public.save_reservation(jsonb_build_object('action','save','reservation',r));
 assert (select revision=1 and table_no='1, 2' and data::jsonb->'excel_source'->>'row'='12' from public.reservations where id='planning-test-edit'),'Existing capacity edit must save and retain origin';
 r:=r||'{"revision":1,"people":5,"gondola":false}'::jsonb;
 blocked:=false;begin perform public.save_reservation(jsonb_build_object('action','save','reservation',r));exception when serialization_failure then blocked:=true;end;
 assert blocked,'Adding guests above 70 must still need explicit override';
 perform public.save_floor_position('{"date":"2099-02-01","number":"1","x":100,"y":200,"revision":0}');
 perform public.save_floor_position('{"date":"2099-02-01","number":"2","x":300,"y":400,"revision":1}');
 assert (select revision=2 and positions->'1'->>'x'='100.00' and positions ? '2' from public.floor_plan_layouts where date='2099-02-01'),'Two distinct moved tables must persist';
 blocked:=false;begin perform public.save_floor_position('{"date":"2099-02-01","number":"3","x":100,"y":200,"revision":1}');exception when serialization_failure then blocked:=true;end;
 assert blocked,'Stale layout must be rejected';
 blocked:=false;begin perform public.save_floor_position('{"date":"2099-02-01","number":"9999","x":100,"y":200,"revision":2}');exception when raise_exception then blocked:=true;end;
 assert blocked,'Unknown table must be rejected';
 blocked:=false;begin perform public.save_floor_position('{"date":"2099-02-01","number":"3","x":-1,"y":200,"revision":2}');exception when raise_exception then blocked:=true;end;
 assert blocked,'Out of plan position must be rejected';
 assert not exists(select 1 from public.mail_outbox where reservation_id like 'planning-test-%'),'Planning must never queue mail';
end $test$;
rollback;
