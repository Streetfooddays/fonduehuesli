begin;
do $test$
declare uid uuid; result jsonb; blocked boolean;
begin
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 assert uid is not null;
 insert into public.reservations(id,date,time,period,people,data,status,source,table_no,arrived)
 values('guest-count-synthetic','2099-11-11','18:00','abend',4,'{"last":"Synthetic","phone":"keep","people":"4","excel_source":{"row":12}}','Bestätigt','Test','1',true);
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.set_reservation_people('{"id":"guest-count-synthetic","revision":0,"people":3}');exception when insufficient_privilege then blocked:=true;end;
 assert blocked,'Unauthenticated change rejected';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 result:=public.set_reservation_people('{"id":"guest-count-synthetic","revision":0,"people":3}');
 assert result->>'people'='3';
 assert (select people=3 and revision=1 and arrived and status='Bestätigt' and table_no='1' and data::jsonb->>'phone'='keep' and data::jsonb->'excel_source'->>'row'='12' and data::jsonb->>'people'='3' from public.reservations where id='guest-count-synthetic'),'Only guest count changes';
 blocked:=false;begin perform public.set_reservation_people('{"id":"guest-count-synthetic","revision":0,"people":8}');exception when serialization_failure then blocked:=true;end;
 assert blocked,'Stale revision rejected';
 blocked:=false;begin perform public.set_reservation_people('{"id":"guest-count-synthetic","revision":1,"people":2.5}');exception when raise_exception then blocked:=true;end;
 assert blocked,'Fraction rejected';
 blocked:=false;begin perform public.set_reservation_people('{"id":"guest-count-synthetic","revision":1,"people":-1}');exception when raise_exception then blocked:=true;end;
 assert blocked,'Negative rejected';
 blocked:=false;begin perform public.set_reservation_people('{"id":"guest-count-synthetic","revision":1,"people":1001}');exception when raise_exception then blocked:=true;end;
 assert blocked,'Upper bound enforced';
 perform public.set_reservation_people('{"id":"guest-count-synthetic","revision":1,"people":0}');
 assert (select people=0 and revision=2 from public.reservations where id='guest-count-synthetic'),'Zero effective guests retained';
 perform public.set_reservation_people('{"id":"guest-count-synthetic","revision":2,"people":80}');
 assert (select people=80 from public.reservations where id='guest-count-synthetic'),'Actual attendance can be recorded above planning limit';
 assert not exists(select 1 from public.mail_outbox where reservation_id='guest-count-synthetic'),'No confirmation queued';
 assert not has_function_privilege('anon','public.set_reservation_people(jsonb)','execute'),'Anonymous role has no function access';
end $test$;
rollback;
