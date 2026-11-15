begin;
do $test$
declare uid uuid; blocked boolean; original_count integer;
begin
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 if uid is null then raise exception 'Active verified member required';end if;
 insert into public.reservations(id,date,time,period,people,data,status,table_no,source) values('test-excel-link-20261115','2099-03-01','18:00','abend',4,'{"last":"Muster","first":"Anna","email":"test@example.invalid"}','Bestätigt','1','Test');
 insert into public.mail_inbox(id,sender,subject,body,state,draft) values('test-excel-link-mail-20261115','test@example.invalid','Synthetic test','','review','{"date":"2099-03-01","time":"18:00","people":4,"data":{"last":"Muster","first":"Anna","email":"test@example.invalid"}}');
 select count(*) into original_count from public.reservations;
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.excel_link_mail('{"mail_id":"test-excel-link-mail-20261115","reservation_id":"test-excel-link-20261115","revision":0}');exception when insufficient_privilege then blocked:=true;end;assert blocked,'Unauthenticated caller rejected';
 assert not has_function_privilege('anon','public.excel_link_mail(jsonb)','execute'),'Anon has no execution privilege';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 blocked:=false;begin perform public.excel_link_mail('{"mail_id":"test-excel-link-mail-20261115","reservation_id":"test-excel-link-20261115","revision":5}');exception when sqlstate 'PT409' then blocked:=true;end;assert blocked,'Stale reservation revision rejected';
 update public.mail_inbox set draft=jsonb_set(draft,'{people}','5') where id='test-excel-link-mail-20261115';
 blocked:=false;begin perform public.excel_link_mail('{"mail_id":"test-excel-link-mail-20261115","reservation_id":"test-excel-link-20261115","revision":0}');exception when raise_exception then blocked:=true;end;assert blocked,'Different guest count requires review';
 update public.mail_inbox set draft=jsonb_set(draft,'{people}','4') where id='test-excel-link-mail-20261115';
 perform public.excel_link_mail('{"mail_id":"test-excel-link-mail-20261115","reservation_id":"test-excel-link-20261115","revision":0}');
 assert (select reservation_id='test-excel-link-20261115' and state='confirmed' from public.mail_inbox where id='test-excel-link-mail-20261115'),'Matching existing booking linked';
 assert (select count(*) from public.reservations)=original_count,'Link must not create a duplicate booking';
 assert not exists(select 1 from public.mail_outbox where reservation_id='test-excel-link-20261115'),'Link never sends mail';
 perform public.excel_link_mail('{"mail_id":"test-excel-link-mail-20261115","reservation_id":"test-excel-link-20261115","revision":0}');
end $test$;
rollback;
