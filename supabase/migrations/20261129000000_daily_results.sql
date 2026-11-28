-- A day's results in one answer, for the daily results screen: selects of runs are capped at 1000 rows by PostgREST
-- and would show other players' user ids. Security invoker: runs are read through row level security, which shows
-- every run of a day to a caller with an attempt for it and none otherwise, so the answer never holds more than the
-- caller could select. Without an attempt for the day the answer is null, not even the count.
--
-- The histogram's bucket of ticks t (from <= t): least(buckets - 1, (t - from) * buckets / (to - from)), integer
-- division; runs slower than `to` land in the last bucket.

create function public.daily_results(run_day integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  -- TOP_ROWS, RESULT_BUCKETS and CAP_PERCENTILE in src/app/dailyResults.ts
  top_rows constant integer := 10;
  buckets constant integer := 48;
  cap_percentile constant integer := 95;
  caller uuid := auth.uid();
  total integer;
  fastest integer;
  cap integer;
  mine integer;
begin
  if caller is null
    or not exists (select 1 from public.attempts a where a.user_id = caller and a.day = run_day) then
    return null;
  end if;

  select count(*), min(r.ticks), percentile_disc(cap_percentile / 100.0) within group (order by r.ticks)
    into total, fastest, cap
    from public.runs r
    where r.day = run_day;
  if total = 0 then
    return jsonb_build_object('count', 0, 'own', null, 'top', '[]'::jsonb, 'histogram', null);
  end if;
  -- Buckets at least one tick wide, so one run or all-equal times work.
  cap := greatest(cap, fastest + buckets);

  select r.ticks into mine from public.runs r where r.user_id = caller and r.day = run_day;

  return jsonb_build_object(
    'count', total,
    'own', case when mine is null then null else jsonb_build_object(
      'ticks', mine,
      'rank', 1 + (select count(*) from public.runs r where r.day = run_day and r.ticks < mine),
      'slower', (select count(*) from public.runs r where r.day = run_day and r.ticks > mine)
    ) end,
    'top', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'rank', 1 + (select count(*) from public.runs f where f.day = run_day and f.ticks < t.ticks),
          'nickname', t.nickname,
          'ticks', t.ticks,
          'own', t.user_id = caller
        ) order by t.ticks, t.created_at, t.user_id), '[]'::jsonb)
      from (
        select r.user_id, r.nickname, r.ticks, r.created_at
        from public.runs r
        where r.day = run_day
        order by r.ticks, r.created_at, r.user_id
        limit top_rows
      ) t
    ),
    'histogram', jsonb_build_object(
      'from', fastest,
      'to', cap,
      'counts', (
        select jsonb_agg(coalesce(h.n, 0) order by b.i)
        from generate_series(0, buckets - 1) b (i)
        left join (
          select least(buckets - 1, (r.ticks - fastest) * buckets / (cap - fastest)) as i, count(*) as n
          from public.runs r
          where r.day = run_day
          group by 1
        ) h on h.i = b.i
      )
    )
  );
end;
$$;

revoke all on function public.daily_results(integer) from public, anon, authenticated, service_role;
grant execute on function public.daily_results(integer) to authenticated;
