begin;
do $test$
declare base integer; people integer; expected text; blocked boolean; uid uuid; booking public.reservations;
begin
 for base in 5..8 loop
  for people in 1..6 loop
   expected:=array_to_string((array[base::text,repeat(base::text,2),repeat(base::text,3)])[1:((people+1)/2)],', ');
   assert private.table_group_assignment(base::text,people)=expected,'Group expansion differs';
   assert private.table_group_assignment(array_to_string(array[base::text,repeat(base::text,2),repeat(base::text,3)],', '),people)=expected,'Group reduction differs';
  end loop;
 end loop;
 assert private.table_group_assignment('5, 6',8)='5, 6','Mixed groups remain manual';
 assert private.table_group_assignment('55',2)='55','Standalone side table remains explicit';
 assert private.table_group_assignment('G1',3)='G1','Gondola must stay unchanged';
 assert private.table_group_assignment('5 (55?)',3)='5 (55?)','Ambiguous assignments must stay unchanged';
 blocked:=false;begin perform private.table_group_assignment('5',7);exception when raise_exception then blocked:=true;end;assert blocked,'A single group holds at most six';
 select t.user_id into uid from public.team_members t join auth.users u on u.id=t.user_id where t.active and u.email_confirmed_at is not null limit 1;
 if uid is null then raise exception 'Active verified member required';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 insert into public.reservations(id,date,time,period,people,data,status,table_no,source) values('test-table-groups-20261113','2099-01-01','19:00','abend',3,'{"last":"Synthetic"}','Bestätigt','5','Test');
 assert (select table_no='5, 55' from public.reservations where id='test-table-groups-20261113'),'Insert expands assigned tables';
 perform public.set_reservation_people('{"id":"test-table-groups-20261113","revision":0,"people":6}');
 select * into booking from public.reservations where id='test-table-groups-20261113';assert booking.table_no='5, 55, 555','Person edit expands all tables';
 perform public.set_reservation_table(jsonb_build_object('id',booking.id,'revision',booking.revision,'tableNo','6'));
 select * into booking from public.reservations where id='test-table-groups-20261113';assert booking.table_no='6, 66, 666','Table edit uses the selected group';
 perform public.set_reservation_people(jsonb_build_object('id',booking.id,'revision',booking.revision,'people',2));
 assert (select table_no='6' from public.reservations where id='test-table-groups-20261113'),'Person reduction releases side tables';
end $test$;
rollback;
