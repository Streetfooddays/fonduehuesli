begin;
do $test$
declare summary jsonb; result jsonb; request_count integer;
begin
 assert private.reservation_digest_slot('2026-11-10T03:59:59Z')='2026-11-09T17:00:00Z'::timestamptz;
 assert private.reservation_digest_slot('2026-11-10T04:00:00Z')='2026-11-10T04:00:00Z'::timestamptz;
 assert private.reservation_digest_slot('2026-07-10T03:00:00Z')='2026-07-10T03:00:00Z'::timestamptz;
 assert private.reservation_digest_slot('2026-07-10T16:00:00Z')='2026-07-10T16:00:00Z'::timestamptz;
 insert into public.reservations(id,date,time,period,people,data,status,source,created)
 values('digest-test-linked','2099-03-01','18:30','abend',4,'{"first":"Test","last":"Synthetic"}','Offen','E-Mail','2099-02-01T12:00Z'),('digest-test-manual','2099-03-02','19:00','abend',2,'{"last":"Manual Synthetic"}','Bestätigt','Telefon / manuell','2099-02-01T13:00Z');
 insert into public.mail_inbox(id,sender,subject,body,draft,state,reservation_id,received_at) values
 ('digest-test-mail','test@example.invalid','Synthetic reservation','Testtext','{}','imported','digest-test-linked','2099-02-01T12:00Z'),
 ('digest-test-question','test@example.invalid','Synthetic question','Can you clarify?','{}','review',null,'2099-02-01T14:00Z'),
 ('digest-test-loop','reservation@fonduehuesli.ch','[Fonduehüsli] Eingangsübersicht · Test','Loop','{}','review',null,'2099-02-01T15:00Z');
 summary:=private.reservation_digest_text('2099-02-01T11:00Z','2099-02-01T17:00Z');
 assert summary->>'count'='3','Linked reservation must not be counted twice, digest itself excluded';
 assert position('Test Synthetic' in summary->>'text')>0 and position('01.03.2099' in summary->>'text')>0 and position('18:30' in summary->>'text')>0;
 assert position('Synthetic question' in summary->>'text')>0 and position('Manual Synthetic' in summary->>'text')>0;
 assert not has_function_privilege('anon','private.reservation_digest_run()','execute');
 assert not has_function_privilege('authenticated','private.reservation_digest_run()','execute');
 -- Rollback prevents pg_net from transmitting this synthetic frozen report.
 insert into private.reservation_digests(slot,window_start,window_end,subject,message_text,message_count) values('2099-02-01T17:00Z','2099-02-01T11:00Z','2099-02-01T17:00Z','Synthetic rollback-only test','Synthetic',0);
 select count(*) into request_count from net.http_request_queue;
 result:=private.reservation_digest_run();
 assert result->>'state'='pending';
 assert (select count(*)=request_count+1 from net.http_request_queue);
 -- A second invocation while pending does not queue a second send.
 result:=private.reservation_digest_run();
 assert (select count(*)=request_count+1 from net.http_request_queue);
end $test$;
rollback;
