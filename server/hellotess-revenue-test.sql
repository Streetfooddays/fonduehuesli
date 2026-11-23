begin;
do $$
declare p jsonb; v jsonb; total numeric;
begin
 assert not exists(select 1 from public.reservation_overview_days where date='2099-04-01');
 p:='{"shift_id":"hellotess-test-one","date":"2099-04-01","cents":12345,"source_order":10,"event_id":"test-event","terminal_id":"one","closed_at":"2099-04-02T00:15:00Z","rooms":[]}'::jsonb;
 insert into public.reservation_overview_days(date,values) values('2099-04-01','{"kk":20,"twint":5,"team":"Unverändert"}');
 perform public.import_hellotess_revenue(p);
 select values into v from public.reservation_overview_days where date='2099-04-01';assert (v->>'effective_revenue')::numeric=123.45;assert v->>'team'='Unverändert';assert (v->>'kk')::numeric=20;
 perform public.import_hellotess_revenue(p);
 perform public.import_hellotess_revenue(p||'{"shift_id":"hellotess-test-two","cents":1000,"source_order":11}'::jsonb);
 select (values->>'effective_revenue')::numeric into total from public.reservation_overview_days where date='2099-04-01';assert total=133.45,'Closed shifts sum once';
 perform public.import_hellotess_revenue(p||'{"cents":12000,"source_order":12}'::jsonb);
 perform public.import_hellotess_revenue(p||'{"cents":99999,"source_order":9}'::jsonb);
 select (values->>'effective_revenue')::numeric into total from public.reservation_overview_days where date='2099-04-01';assert total=130,'Stale updates ignored';
 update public.reservation_overview_days set values=values||'{"effective_revenue":150}'::jsonb where date='2099-04-01';
 perform public.import_hellotess_revenue(p||'{"cents":12000,"source_order":20}'::jsonb);
 perform public.import_hellotess_revenue(p||'{"cents":13000,"source_order":19}'::jsonb);
 select (values->>'effective_revenue')::numeric into total from public.reservation_overview_days where date='2099-04-01';assert total=150,'Replay retains manual correction and moves source order forward';
 assert not has_function_privilege('anon','public.import_hellotess_revenue(jsonb)','execute');
 assert not has_function_privilege('authenticated','public.import_hellotess_revenue(jsonb)','execute');
 assert has_function_privilege('service_role','public.import_hellotess_revenue(jsonb)','execute');
end $$;
rollback;
