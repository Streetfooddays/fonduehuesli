begin;
do $test$
declare uid uuid; blocked boolean; payload jsonb; outbox_before bigint; rev integer;
begin
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 if uid is null then raise exception 'Test requires active verified member';end if;
 select count(*) into outbox_before from public.mail_outbox;
 payload:='{"reservation":{"createId":"test-walk-in-20261113","date":"2099-01-01","time":"19:00","people":2,"status":"Offen","gondola":false,"override":true,"tableNo":"4","note":"Laufkundschaft","data":{}}}'::jsonb;
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.save_walk_in(payload);exception when insufficient_privilege then blocked:=true;end;
 assert blocked,'Unauthenticated request must be rejected';
 assert not has_function_privilege('anon','public.save_walk_in(jsonb)','execute'),'Anon has no execution privilege';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 perform public.save_walk_in(payload);
 assert (select status='Bestätigt' and arrived and arrived_at is not null and source='Laufkundschaft / manuell' and data::jsonb->>'last'='walk in' and table_no='4' and people=2 from public.reservations where id='test-walk-in-20261113'),'Walk-in must be named, confirmed and arrived atomically';
 select revision into rev from public.reservations where id='test-walk-in-20261113';
 perform public.save_walk_in(payload);
 assert (select count(*) from public.reservations where id='test-walk-in-20261113')=1,'Retry must never duplicate entry';
 assert (select revision from public.reservations where id='test-walk-in-20261113')=rev,'Retry must not change arrival revision';
 payload:=jsonb_set(payload,'{reservation,createId}','"test-walk-in-invalid-20261113"'::jsonb);
 payload:=jsonb_set(payload,'{reservation,people}','-1'::jsonb);
 blocked:=false;begin perform public.save_walk_in(payload);exception when raise_exception then blocked:=true;end;
 assert blocked,'Invalid quantity must fail';
 assert not exists(select 1 from public.reservations where id='test-walk-in-invalid-20261113'),'Invalid save must leave no partial entry';
 assert (select count(*) from public.mail_outbox)=outbox_before,'Walk-in never queues mail';
end $test$;
rollback;
