begin;
do $test$
declare uid uuid; blocked boolean; result jsonb; booking public.reservations;
begin
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 if uid is null then raise exception 'Active verified member required';end if;
 insert into public.reservations(id,date,time,period,people,data,status,table_no,source,arrived) values('test-day-status-capacity-20261114','2099-02-02','18:00','abend',70,'{"last":"Synthetic capacity"}','Bestätigt','','Test',false),('test-day-status-20261114','2099-02-02','19:00','abend',2,'{"last":"Synthetic guest"}','Offen','1','Test',true);
 insert into public.mail_inbox(id,sender,subject,body,state,reservation_id) values('test-day-status-mail-20261114','test@example.invalid','Synthetic test','','imported','test-day-status-20261114');
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.confirm_day_reservation('{"id":"test-day-status-20261114","date":"2099-02-02","revision":0}');exception when insufficient_privilege then blocked:=true;end;assert blocked,'Unauthenticated caller rejected';
 assert not has_function_privilege('anon','public.confirm_day_reservation(jsonb)','execute'),'Anon cannot execute';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 blocked:=false;begin perform public.confirm_day_reservation('{"id":"test-day-status-20261114","date":"2099-02-03","revision":0}');exception when serialization_failure then blocked:=true;end;assert blocked,'Changed date rejected';
 blocked:=false;begin perform public.confirm_day_reservation('{"id":"test-day-status-20261114","date":"2099-02-02","revision":4}');exception when serialization_failure then blocked:=true;end;assert blocked,'Stale revision rejected';
 result:=public.confirm_day_reservation('{"id":"test-day-status-20261114","date":"2099-02-02","revision":0}');
 select * into booking from public.reservations where id='test-day-status-20261114';assert booking.status='Bestätigt' and booking.revision=1 and booking.people=2 and booking.table_no='1' and booking.arrived,'Only status/revision changes';
 assert (result->>'over_capacity')::boolean,'Manual confirmation reports over-capacity';
 assert (select state='confirmed' from public.mail_inbox where id='test-day-status-mail-20261114'),'Linked inbox follows confirmation';
 perform public.confirm_day_reservation('{"id":"test-day-status-20261114","date":"2099-02-02","revision":0}');
 assert (select revision=1 from public.reservations where id='test-day-status-20261114'),'Repeated confirm is idempotent';
 assert not exists(select 1 from public.mail_outbox where reservation_id='test-day-status-20261114'),'No mail queued';
 update public.reservations set status='Rückfrage nötig',revision=revision+1 where id='test-day-status-20261114';
 blocked:=false;begin perform public.confirm_day_reservation('{"id":"test-day-status-20261114","date":"2099-02-02","revision":2}');exception when raise_exception then blocked:=true;end;assert blocked,'Review requests remain manual';
end $test$;
rollback;
