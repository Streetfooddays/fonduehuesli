begin;
do $test$
declare uid uuid; result jsonb; blocked boolean; payload jsonb;
begin
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 if uid is null then raise exception 'Verified member required';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 payload:='{"reservation":{"createId":"neutral-greeting-test-20261115","date":"2099-12-28","time":"18:00","people":2,"status":"Bestätigt","gondola":false,"override":false,"tableNo":"","note":"","data":{"last":"Synthetic","first":"Kim","salutation":"Hallo","email":"test@example.invalid"}},"recipient_reviewed":true,"message":{"recipient":"test@example.invalid","subject":"Synthetic test","text":"Hallo Kim, synthetic test only.","html":"<p>Synthetic test only.</p>"}}'::jsonb;
 result:=public.confirmation_prepare(payload);
 assert result->>'recipient'='test@example.invalid';
 assert (select data::jsonb->>'salutation'='Hallo' from public.reservations where id='neutral-greeting-test-20261115'),'Neutral greeting saved';
 payload:=jsonb_set(payload,'{reservation,createId}','"neutral-greeting-invalid-20261115"');payload:=jsonb_set(payload,'{reservation,data,salutation}','"Invalid"');
 blocked:=false;begin perform public.confirmation_prepare(payload);exception when raise_exception then blocked:=true;end;assert blocked,'Invalid salutation still rejected';
end $test$;
rollback;
