-- A checked run and its log in one transaction, so two submits racing each other leave exactly one run and never a
-- run without its log. Only the service role (submit-run) calls it.

create function public.store_run(
  player uuid,
  run_day integer,
  run_ticks integer,
  run_nickname text,
  run_version integer,
  run_log text
)
returns table (stored boolean, ticks integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.runs (user_id, day, ticks, nickname, simulation_version)
  values (player, run_day, run_ticks, run_nickname, run_version)
  on conflict on constraint runs_pkey do nothing;
  if not found then
    -- A run was there already (or committed by a racing submit while this one waited): left as it is.
    return query select false, r.ticks from public.runs r where r.user_id = player and r.day = run_day;
    return;
  end if;
  insert into public.run_logs (user_id, day, log) values (player, run_day, run_log);
  return query select true, run_ticks;
end;
$$;

revoke all on function public.store_run(uuid, integer, integer, text, integer, text) from public, anon, authenticated;
grant execute on function public.store_run(uuid, integer, integer, text, integer, text) to service_role;
