begin;
do $test$
declare d date; available boolean;
begin
 select c.date into d from public.reservation_calendar_gondolas() c where c.date>current_date and not exists(select 1 from public.reservations r where r.date=c.date) limit 1;
 assert d is not null,'Need a date without live reservations';
 select gondolas_available into available from public.reservation_calendar_gondolas(d,d);assert available;
 insert into public.reservations(id,date,time,period,people,data,status,source,gondola,table_no) values
 ('test-public-gondola-1',d,'18:00','abend',2,'{}','Bestätigt','Test',1,''),
 ('test-public-gondola-2',d,'19:00','abend',2,'{"gondola":"Ja"}','Offen','Test',0,''),
 ('test-public-gondola-3',d,'','ungeklaert',2,'{}','Rückfrage nötig','Test',0,'G3');
 select gondolas_available into available from public.reservation_calendar_gondolas(d,d);assert not available,'Flags, legacy data and table assignments occupy all three';
 update public.reservations set released_tables=array['G3'] where id='test-public-gondola-3';
 select gondolas_available into available from public.reservation_calendar_gondolas(d,d);assert available,'Released gondola becomes available';
 insert into public.reservations(id,date,time,period,people,data,status,source,gondola,table_no) values
 ('test-public-gondola-midday',d,'12:00','mittag',2,'{}','Bestätigt','Test',1,''),
 ('test-public-gondola-cancelled',d,'18:00','abend',2,'{}','Storniert','Test',1,''),
 ('test-public-gondola-waiting',d,'18:00','abend',2,'{}','Warteliste','Test',1,'');
 insert into public.reservations(id,date,time,period,people,data,status,source,gondola,table_no,deleted_at) values
 ('test-public-gondola-deleted',d,'18:00','abend',2,'{}','Bestätigt','Test',1,'',now());
 select gondolas_available into available from public.reservation_calendar_gondolas(d,d);assert available,'Midday, cancelled, waiting and deleted rows do not block the evening';
 assert not exists(select 1 from public.mail_outbox where reservation_id like 'test-public-gondola-%');
end $test$;
set local role anon;
select count(*)=88 as public_season_access, bool_and((select count(*)=5 from jsonb_object_keys(to_jsonb(c)))) as availability_only from public.reservation_calendar_gondolas() c;
rollback;
