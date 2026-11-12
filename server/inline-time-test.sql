begin;
do $test$
declare uid uuid; result jsonb; blocked boolean;
begin
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 assert uid is not null;
 insert into public.reservations(id,date,time,period,people,data,status,source,table_no,arrived)
 values('inline-time-synthetic','2099-11-11','18:00','abend',4,'{"last":"Synthetic","comment":"Keep","excel_source":{"row":12}}','Bestätigt','Test','1',true);
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.set_reservation_time('{"id":"inline-time-synthetic","revision":0,"time":"12:30"}');exception when insufficient_privilege then blocked:=true;end;
 assert blocked,'Unauthenticated change rejected';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 result:=public.set_reservation_time('{"id":"inline-time-synthetic","revision":0,"time":"12:30"}');
 assert result->>'time'='12:30' and result->>'period'='mittag';
 assert (select people=4 and revision=1 and arrived and status='Bestätigt' and table_no='1' and data::jsonb->>'comment'='Keep' and data::jsonb->'excel_source'->>'row'='12' and data::jsonb->>'time'='12:30' from public.reservations where id='inline-time-synthetic'),'Guest count, arrival, tables and source preserved';
 blocked:=false;begin perform public.set_reservation_time('{"id":"inline-time-synthetic","revision":0,"time":"19:00"}');exception when serialization_failure then blocked:=true;end;
 assert blocked,'Stale edit rejected';
 blocked:=false;begin perform public.set_reservation_time('{"id":"inline-time-synthetic","revision":1,"time":"24:60"}');exception when raise_exception then blocked:=true;end;
 assert blocked,'Invalid time rejected';
 perform public.set_reservation_time('{"id":"inline-time-synthetic","revision":1,"time":"19:00"}');
 assert (select period='abend' from public.reservations where id='inline-time-synthetic'),'Evening period updates';
 perform public.set_reservation_time('{"id":"inline-time-synthetic","revision":2,"time":""}');
 assert (select time='' and period='ungeklaert' from public.reservations where id='inline-time-synthetic'),'Missing time remains explicit';
 assert not exists(select 1 from public.mail_outbox where reservation_id='inline-time-synthetic'),'No mail queued';
 assert not has_function_privilege('anon','public.set_reservation_time(jsonb)','execute');
end $test$;
rollback;
