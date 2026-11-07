begin;
do $test$
declare uid uuid; result jsonb; blocked boolean;
begin
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 assert uid is not null;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 assert private.gondola_tables('G1, G 2, G3')=array['G1','G2','G3'];
 assert cardinality(private.gondola_tables('T1, 1, G12, GONDEL 1'))=0;
 insert into public.reservations(id,date,time,period,people,data,status,source) values('gondola-plan-test-small','2099-03-01','18:00','abend',4,'{"last":"Synthetic"}','Offen','Test'),('gondola-plan-test-large','2099-03-01','18:00','abend',5,'{"last":"Synthetic"}','Offen','Test');
 result:=public.set_reservation_table('{"id":"gondola-plan-test-small","revision":0,"tableNo":"G1"}');
 assert result->>'gondola'='1';assert (select gondola=1 and data::jsonb->>'gondola'='Ja' from public.reservations where id='gondola-plan-test-small');
 blocked:=false;begin perform public.set_reservation_table('{"id":"gondola-plan-test-large","revision":0,"tableNo":"G2"}');exception when raise_exception then blocked:=true;end;assert blocked,'Max 4 must apply when picking gondolas';
 blocked:=false;begin perform public.set_reservation_table('{"id":"gondola-plan-test-small","revision":1,"tableNo":"G1, G2"}');exception when raise_exception then blocked:=true;end;assert blocked,'One gondola per reservation';
 result:=public.save_reservation('{"action":"save","reservation":{"id":"gondola-plan-test-small","revision":1,"date":"2099-03-01","time":"18:00","people":4,"status":"Offen","gondola":false,"override":false,"tableNo":"G2","data":{"last":"Synthetic"}}}');
 assert (select gondola=1 from public.reservations where id='gondola-plan-test-small'),'Gondola table must set the reservation flag';
 perform public.set_reservation_table('{"id":"gondola-plan-test-small","revision":2,"tableNo":"T1"}');
 assert (select gondola=0 from public.reservations where id='gondola-plan-test-small'),'Ordinary table assignment removes numbered gondola flag';
 perform public.save_floor_position('{"date":"2099-03-01","number":"G3","x":1100,"y":250,"revision":0}');
 assert (select positions ? 'G3' from public.floor_plan_layouts where date='2099-03-01');
 assert not exists(select 1 from public.mail_outbox where reservation_id like 'gondola-plan-test-%');
end $test$;
rollback;
