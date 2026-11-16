begin;
do $test$
declare base integer; people integer; expected text; cluster text[]; blocked boolean; limits integer[];
begin
 for base in 20..23 loop
  cluster:=array[base::text,(base+100)::text,(base+200)::text,case when base=20 then '130' else (base+109)::text end];
  limits:=case when base=20 then array[10,12,14,17] when base=21 then array[4,14,16,19] else array[4,6,8,11] end;
  for people in 1..20 loop
   expected:=array_to_string(cluster[1:(case when people<=limits[1] then 1 when people<=limits[2] then 2 when people<=limits[3] then 3 else 4 end)],', ');
   assert private.table_group_assignment(base::text,people)=expected,'Large group expansion differs';
   assert private.table_group_assignment(array_to_string(cluster,', '),people)=expected,'Large group reduction differs';
  end loop;
 end loop;
 assert private.table_group_assignment('20',18)='20, 120, 220, 130','Manual overcapacity uses all available tables';
 assert private.table_group_assignment('20, 21',14)='20, 21','Mixed groups remain manual';
 assert private.table_group_assignment('5',5)='5, 55, 555','Small group rules retained';
 assert private.table_group_assignment('20',10)='20','Ten guests use table 20 only';
 assert private.table_group_assignment('121',10)='121','Table 121 holds ten guests';
 assert private.table_group_assignment('124',10)='124','Table 124 holds ten guests';
 assert private.table_group_assignment('G1',4)='G1','Gondola unchanged';
end $test$;
rollback;
