begin;
do $test$
declare uid uuid; blocked boolean; original jsonb;
begin
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 if uid is null then raise exception 'Verified member required';end if;
 insert into public.reservations(id,date,time,period,people,data,status,source) values('ignore-excel-test-20261115','2099-12-29','18:00','abend',2,'{"last":"Synthetic"}','Offen','Test');
 insert into public.mail_inbox(id,sender,subject,body,state,reservation_id) values('ignore-excel-linked-test-20261115','test@example.invalid','Synthetic','','imported','ignore-excel-test-20261115'),('ignore-excel-unlinked-test-20261115','test@example.invalid','Synthetic','','review',null),('ignore-excel-pending-test-20261115','test@example.invalid','Synthetic','','imported','ignore-excel-test-20261115');
 select to_jsonb(r) into original from public.reservations r where id='ignore-excel-test-20261115';
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.excel_ignore_mail('{"id":"ignore-excel-linked-test-20261115"}');exception when insufficient_privilege then blocked:=true;end;assert blocked,'Unauthenticated caller rejected';
 assert not has_function_privilege('anon','public.excel_ignore_mail(jsonb)','execute');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 perform public.excel_ignore_mail('{"id":"ignore-excel-linked-test-20261115"}');
 perform public.excel_ignore_mail('{"id":"ignore-excel-linked-test-20261115"}');
 assert (select state='ignored' from public.mail_inbox where id='ignore-excel-linked-test-20261115');
 assert (select to_jsonb(r)=original from public.reservations r where id='ignore-excel-test-20261115'),'Linked reservation remains completely unchanged';
 perform public.excel_ignore_mail('{"id":"ignore-excel-unlinked-test-20261115"}');
 assert (select state='ignored' and reservation_id is null from public.mail_inbox where id='ignore-excel-unlinked-test-20261115'),'Unlinked request ignored without creating a booking';
 assert not exists(select 1 from public.mail_outbox where reservation_id='ignore-excel-test-20261115'),'Ignoring never prepares mail';
 insert into public.mail_outbox(reservation_id,mail_id,recipient,subject,message_text,message_html,state,created_by) values('ignore-excel-test-20261115','ignore-excel-pending-test-20261115','test@example.invalid','Synthetic','Synthetic','Synthetic','failed',uid);
 blocked:=false;begin perform public.excel_ignore_mail('{"id":"ignore-excel-pending-test-20261115"}');exception when raise_exception then blocked:=true;end;assert blocked,'Open delivery must be resolved first';
 assert (select state='imported' from public.mail_inbox where id='ignore-excel-pending-test-20261115');
end $test$;
rollback;
