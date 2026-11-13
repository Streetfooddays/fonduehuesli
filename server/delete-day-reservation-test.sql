begin;
do $test$
declare uid uuid; blocked boolean; outbox_before bigint;
begin
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 if uid is null then raise exception 'Test requires an active verified member';end if;
 select count(*) into outbox_before from public.mail_outbox;
 insert into public.reservations(id,date,time,period,people,data,status,source,arrived) values('test-day-delete-20261113','2099-01-01','19:00','abend',2,'{"last":"Synthetic","first":"Test"}','Bestätigt','Test',true);
 insert into public.mail_inbox(id,sender,subject,body,state,reservation_id) values('test-day-delete-mail-20261113','test@example.invalid','Synthetic test','','confirmed','test-day-delete-20261113');
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.delete_day_reservation('{"id":"test-day-delete-20261113","date":"2099-01-01","revision":0}');exception when insufficient_privilege then blocked:=true;end;
 assert blocked,'Unauthenticated caller must be rejected';
 assert not has_function_privilege('anon','public.delete_day_reservation(jsonb)','execute'),'Anon must have no execution privilege';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 blocked:=false;begin perform public.delete_day_reservation('{"id":"test-day-delete-20261113","date":"2099-01-02","revision":0}');exception when serialization_failure then blocked:=true;end;
 assert blocked,'Changed date must be rejected';
 blocked:=false;begin perform public.delete_day_reservation('{"id":"test-day-delete-20261113","date":"2099-01-01","revision":9}');exception when serialization_failure then blocked:=true;end;
 assert blocked,'Stale revision must be rejected';
 perform public.delete_day_reservation('{"id":"test-day-delete-20261113","date":"2099-01-01","revision":0}');
 assert (select status='Storniert' and deleted_at is not null and revision=1 and arrived from public.reservations where id='test-day-delete-20261113'),'Delete preserves history but excludes capacity';
 assert not exists(select 1 from public.reservations where id='test-day-delete-20261113' and deleted_at is null),'Deleted booking must be excluded from app query';
 assert (select state='ignored' from public.mail_inbox where id='test-day-delete-mail-20261113'),'Linked mail must be archived';
 perform public.delete_day_reservation('{"id":"test-day-delete-20261113","date":"2099-01-01","revision":0}');
 assert (select revision=1 from public.reservations where id='test-day-delete-20261113'),'Repeated delete must be idempotent';
 assert (select count(*) from public.mail_outbox)=outbox_before,'Delete must never queue mail';
end $test$;
rollback;
