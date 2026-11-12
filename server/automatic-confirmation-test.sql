begin;
do $test$
declare a jsonb;
begin
 assert (select not enabled and activated_at is null from private.automatic_confirmation_config where id),'Automation must remain disabled';
 insert into public.reservations(id,date,time,period,people,data,status,source,note) values
 ('auto-synthetic-candidate','2099-02-01','18:00','abend',2,'{"last":"Synthetic","first":"Alex","email":"auto-unique@example.invalid","comment":""}','Offen','Test','Maileingang: Synthetic'),
 ('auto-synthetic-other','2099-02-01','12:00','mittag',68,'{"last":"Other","email":"other@example.invalid"}','Bestätigt','Test','');
 insert into public.mail_inbox(id,sender,subject,body,draft,issues,state,reservation_id) values('auto-synthetic-mail','test@example.invalid','Synthetic','','{}','[]','imported','auto-synthetic-candidate');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 a:=private.automatic_confirmation_assess('auto-synthetic-mail');assert (a->>'eligible')::boolean and a->>'total_people'='70','Exactly 70 across lunch and evening is eligible';
 assert public.automatic_confirmation_context('{"mail_id":"auto-synthetic-mail"}')->>'enabled'='false';
 assert public.automatic_confirmation_prepare('{"mail_id":"auto-synthetic-mail"}')->>'enabled'='false';
 assert (select status='Offen' from public.reservations where id='auto-synthetic-candidate'),'Disabled mode must not confirm';
 assert not exists(select 1 from public.mail_outbox where mail_id='auto-synthetic-mail'),'Disabled mode must never queue email';
 update public.reservations set people=69 where id='auto-synthetic-other';
 a:=private.automatic_confirmation_assess('auto-synthetic-mail');assert (a->>'eligible')::boolean=false and a->>'total_people'='71','71 is manual';
 update public.reservations set people=68 where id='auto-synthetic-other';
 update public.reservations set data=(data::jsonb||'{"comment":"Bitte am Fenster"}')::text where id='auto-synthetic-candidate';
 a:=private.automatic_confirmation_assess('auto-synthetic-mail');assert (a->>'eligible')::boolean=false,'Guest remarks are manual';
 update public.reservations set data=(data::jsonb||'{"comment":"[http://click.promote.weebly.com/wf/open?upn=tracking]"}')::text where id='auto-synthetic-candidate';
 a:=private.automatic_confirmation_assess('auto-synthetic-mail');assert (a->>'eligible')::boolean,'A technical tracking pixel is not a guest remark';
 update public.reservations set note='Unsere interne Notiz' where id='auto-synthetic-candidate';
 assert (private.automatic_confirmation_assess('auto-synthetic-mail')->>'eligible')::boolean=false,'Internal remarks are manual';
 update public.reservations set note='Maileingang: Synthetic' where id='auto-synthetic-candidate';
 update public.mail_inbox set issues='["Datum fehlt oder ist nicht eindeutig."]' where id='auto-synthetic-mail';
 assert (private.automatic_confirmation_assess('auto-synthetic-mail')->>'eligible')::boolean=false,'Ambiguous extraction is manual';
 update public.mail_inbox set issues='[]' where id='auto-synthetic-mail';
 insert into public.reservation_days(date,manual_only,note) values('2099-02-01',1,'Synthetic manual day');
 assert (private.automatic_confirmation_assess('auto-synthetic-mail')->>'eligible')::boolean=false,'Manual review day stays manual';
 assert not has_function_privilege('anon','public.automatic_confirmation_prepare(jsonb)','execute');
 assert not has_function_privilege('authenticated','public.automatic_confirmation_prepare(jsonb)','execute');
 assert (select not enabled from private.automatic_confirmation_config where id),'Tests must not activate anything';
end $test$;
rollback;
