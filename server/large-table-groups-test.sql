begin;
do $test$
declare base integer; people integer; expected text; cluster text[]; blocked boolean;
begin
 for base in 20..23 loop
  cluster:=array[base::text,(base+100)::text,(base+200)::text,case when base=20 then '131' else (base+110)::text end];
  for people in 1..11 loop
   expected:=array_to_string(cluster[1:(case when people<=4 then 1 when people<=6 then 2 when people<=8 then 3 else 4 end)],', ');
   assert private.table_group_assignment(base::text,people)=expected,'Large group expansion differs';
   assert private.table_group_assignment(array_to_string(cluster,', '),people)=expected,'Large group reduction differs';
  end loop;
 end loop;
 blocked:=false;begin perform private.table_group_assignment('20',12);exception when raise_exception then blocked:=true;end;assert blocked,'Maximum group size is eleven';
 assert private.table_group_assignment('20, 21',14)='20, 21','Mixed groups remain manual';
 assert private.table_group_assignment('5',5)='5, 55, 555','Small group rules retained';
 assert private.table_group_assignment('G1',4)='G1','Gondola unchanged';
end $test$;
rollback;
