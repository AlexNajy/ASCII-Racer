-- daily_results: a day's count, the caller's rank, the top times and the histogram, only for a caller whose try is used.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- a: the caller under test; b to f: other players; p01 to p21: a crowd for day 30
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', true),
  ('00000000-0000-0000-0000-00000000000b', true),
  ('00000000-0000-0000-0000-00000000000c', true),
  ('00000000-0000-0000-0000-00000000000d', true),
  ('00000000-0000-0000-0000-00000000000e', true),
  ('00000000-0000-0000-0000-00000000000f', true);
insert into auth.users (id, is_anonymous)
  select ('10000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, true from generate_series(1, 21) g;

-- Day 20: three tied at 4000 (c, d, e in that order of arrival), b 5000, f 6000. Day 21: b only.
insert into public.attempts (user_id, day) values
  ('00000000-0000-0000-0000-00000000000b', 20),
  ('00000000-0000-0000-0000-00000000000c', 20),
  ('00000000-0000-0000-0000-00000000000d', 20),
  ('00000000-0000-0000-0000-00000000000e', 20),
  ('00000000-0000-0000-0000-00000000000f', 20),
  ('00000000-0000-0000-0000-00000000000b', 21),
  ('00000000-0000-0000-0000-00000000000b', 70);
insert into public.runs (user_id, day, ticks, nickname, simulation_version, created_at) values
  ('00000000-0000-0000-0000-00000000000b', 20, 5000, 'bee', 1, '2026-11-27 10:00:00+00'),
  ('00000000-0000-0000-0000-00000000000c', 20, 4000, 'sea', 1, '2026-11-27 10:00:01+00'),
  ('00000000-0000-0000-0000-00000000000d', 20, 4000, 'dee', 1, '2026-11-27 10:00:02+00'),
  ('00000000-0000-0000-0000-00000000000e', 20, 4000, 'eee', 2, '2026-11-27 10:00:03+00'),
  ('00000000-0000-0000-0000-00000000000f', 20, 6000, 'eff', 1, '2026-11-27 10:00:04+00'),
  ('00000000-0000-0000-0000-00000000000b', 21, 100, 'bee', 1, '2026-11-27 10:00:05+00'),
  ('00000000-0000-0000-0000-00000000000b', 70, 3000, 'bee', 1, '2026-11-27 10:00:06+00');

-- Day 30: 4000 to 4019 and one outlier at 30000.
insert into public.attempts (user_id, day)
  select ('10000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 30 from generate_series(1, 21) g;
insert into public.runs (user_id, day, ticks, nickname, simulation_version, created_at)
  select ('10000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 30,
    case when g = 21 then 30000 else 3999 + g end, 'p' || lpad(g::text, 2, '0'), 1,
    '2026-11-27 10:00:00+00'::timestamptz + g * interval '1 second'
  from generate_series(1, 21) g;

-- Day 50: five runs of 7000.
insert into public.attempts (user_id, day) values
  ('00000000-0000-0000-0000-00000000000b', 50),
  ('00000000-0000-0000-0000-00000000000c', 50),
  ('00000000-0000-0000-0000-00000000000d', 50),
  ('00000000-0000-0000-0000-00000000000e', 50),
  ('00000000-0000-0000-0000-00000000000f', 50);
insert into public.runs (user_id, day, ticks, nickname, simulation_version)
  select user_id, 50, 7000, 'same', 1 from public.attempts where day = 50;

select has_function('public', 'daily_results', array['integer']);
select is(
  (select prosecdef from pg_proc where oid = 'public.daily_results(integer)'::regprocedure),
  false, 'daily_results runs as its caller'
);
select is(
  (select proconfig from pg_proc where oid = 'public.daily_results(integer)'::regprocedure),
  array['search_path=""'], 'daily_results has an empty search_path'
);
select is(
  (select provolatile from pg_proc where oid = 'public.daily_results(integer)'::regprocedure),
  's', 'daily_results is stable'
);

-- anon
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok('select public.daily_results(20)', '42501', null, 'anon can not execute daily_results');

-- authenticated without a user
reset role;
set local role authenticated;
set local request.jwt.claims to '{"role":"authenticated"}';
select is(public.daily_results(20), null, 'no user: null');

-- a, no attempt at all
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(public.daily_results(20), null, 'a without an attempt gets null');

-- a, an attempt for another day
reset role;
insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000a', 21);
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(public.daily_results(20), null, 'a with an attempt for day 21 only gets null for day 20');
select is(
  public.daily_results(21),
  '{"count": 1, "own": null, "top": [{"rank": 1, "nickname": "bee", "ticks": 100, "own": false}],
    "histogram": {"from": 100, "to": 148, "counts": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}}'::jsonb,
  'day 21: one run by another player, the histogram one tick per bucket'
);

-- a's try for day 20 is used, no run sent
reset role;
insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000a', 20);
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(public.daily_results(20) -> 'count', '5'::jsonb, 'attempt without a run: every run of the day counted');
select is(public.daily_results(20) -> 'own', 'null'::jsonb, 'attempt without a run: own is null');
select is(
  public.daily_results(20) -> 'top',
  '[{"rank": 1, "nickname": "sea", "ticks": 4000, "own": false},
    {"rank": 1, "nickname": "dee", "ticks": 4000, "own": false},
    {"rank": 1, "nickname": "eee", "ticks": 4000, "own": false},
    {"rank": 4, "nickname": "bee", "ticks": 5000, "own": false},
    {"rank": 5, "nickname": "eff", "ticks": 6000, "own": false}]'::jsonb,
  'top: ties share a rank and keep their order of arrival, the next is rank 4, other versions counted'
);

-- a finished day 20 in 4500
reset role;
insert into public.runs (user_id, day, ticks, nickname, simulation_version, created_at)
  values ('00000000-0000-0000-0000-00000000000a', 20, 4500, 'anon', 1, '2026-11-27 11:00:00+00');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(public.daily_results(20) -> 'count', '6'::jsonb, 'with a run: six runs, none of day 21 or 70');
select is(public.daily_results(20) -> 'own', '{"ticks": 4500, "rank": 4, "slower": 2}'::jsonb, 'own: ticks, rank, slower');
select is(
  public.daily_results(20) -> 'top',
  '[{"rank": 1, "nickname": "sea", "ticks": 4000, "own": false},
    {"rank": 1, "nickname": "dee", "ticks": 4000, "own": false},
    {"rank": 1, "nickname": "eee", "ticks": 4000, "own": false},
    {"rank": 4, "nickname": "anon", "ticks": 4500, "own": true},
    {"rank": 5, "nickname": "bee", "ticks": 5000, "own": false},
    {"rank": 6, "nickname": "eff", "ticks": 6000, "own": false}]'::jsonb,
  'top: the own row is marked'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.daily_results(20)) k),
  array['count', 'histogram', 'own', 'top'], 'only the documented keys at the top'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.daily_results(20) -> 'own') k),
  array['rank', 'slower', 'ticks'], 'only the documented keys in own'
);
select is(
  (select array_agg(distinct k order by k)
   from jsonb_array_elements(public.daily_results(20) -> 'top') e, jsonb_object_keys(e) k),
  array['nickname', 'own', 'rank', 'ticks'], 'only the documented keys in top rows'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.daily_results(20) -> 'histogram') k),
  array['counts', 'from', 'to'], 'only the documented keys in histogram'
);
select ok(
  position('00000000-0000-0000-0000-00000000000' in public.daily_results(20)::text) = 0,
  'no user id anywhere in the answer'
);
-- 95th percentile of 4000 x3, 4500, 5000, 6000 is 6000; buckets of 2000 / 48 ticks
select is(public.daily_results(20) -> 'histogram' -> 'from', '4000'::jsonb, 'histogram from the fastest time');
select is(public.daily_results(20) -> 'histogram' -> 'to', '6000'::jsonb, 'histogram to the 95th percentile');
select is(
  (select jsonb_agg(c.value::int order by c.ordinality) from jsonb_array_elements(public.daily_results(20) -> 'histogram' -> 'counts')
     with ordinality c where c.value <> '0'::jsonb),
  '[3, 1, 1, 1]'::jsonb, 'four buckets hold runs'
);
select is(public.daily_results(20) #> '{histogram,counts,0}', '3'::jsonb, 'the fastest runs are in bucket 0');
select is(public.daily_results(20) #> '{histogram,counts,12}', '1'::jsonb, '4500 is in bucket (500 * 48) / 2000 = 12');
select is(public.daily_results(20) #> '{histogram,counts,24}', '1'::jsonb, '5000 is in bucket 24');
select is(public.daily_results(20) #> '{histogram,counts,47}', '1'::jsonb, '6000, the cap, is in the last bucket');
select is(
  (select sum(value::int) from jsonb_array_elements(public.daily_results(20) -> 'histogram' -> 'counts')),
  6::bigint, 'counts sum to count'
);

-- the caller is always auth.uid(): day 70 is b's, not a's
select is(public.daily_results(70), null, 'a can not read day 70, which only b has an attempt for');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is(public.daily_results(70) -> 'own', '{"ticks": 3000, "rank": 1, "slower": 0}'::jsonb, 'b reads its own day 70');
select is(public.daily_results(20) -> 'own', '{"ticks": 5000, "rank": 5, "slower": 1}'::jsonb, 'b gets its own row of day 20');
select is(
  (select count(*) from jsonb_array_elements(public.daily_results(20) -> 'top') e where (e ->> 'own')::boolean),
  1::bigint, 'b: one own row in top'
);

-- day 30, seen by a crowd member: length cap and an outlier
set local request.jwt.claims to '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(jsonb_array_length(public.daily_results(30) -> 'top'), 10, 'top holds at most 10 rows');
select is(
  (select jsonb_agg(e -> 'ticks') from jsonb_array_elements(public.daily_results(30) -> 'top') e),
  '[4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009]'::jsonb, 'top: the fastest ten in order'
);
select is(public.daily_results(30) -> 'own', '{"ticks": 4000, "rank": 1, "slower": 20}'::jsonb, 'the fastest player');
-- 95th percentile of 21 runs is the 20th, 4019; below from + 48, so to is 4048
select is(public.daily_results(30) -> 'histogram' -> 'to', '4048'::jsonb, 'cap at least from + 48');
select is(public.daily_results(30) #> '{histogram,counts,47}', '1'::jsonb, 'the 30000 outlier is in the last bucket');
select is(
  (select sum(value::int) from jsonb_array_elements(public.daily_results(30) -> 'histogram' -> 'counts')),
  21::bigint, 'day 30: counts sum to count'
);
select is(jsonb_array_length(public.daily_results(30) #> '{histogram,counts}'), 48, 'exactly 48 buckets');

-- day 50: all equal
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is(public.daily_results(50) -> 'own', '{"ticks": 7000, "rank": 1, "slower": 0}'::jsonb, 'all equal: rank 1');
select is(
  (select array_agg(distinct (e ->> 'rank')::int) from jsonb_array_elements(public.daily_results(50) -> 'top') e),
  array[1], 'all equal: every row rank 1'
);
select is(
  public.daily_results(50) -> 'histogram',
  '{"from": 7000, "to": 7048, "counts": [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}'::jsonb,
  'all equal: everyone in bucket 0'
);

-- day 60: an attempt, no runs at all
reset role;
insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000a', 60);
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  public.daily_results(60),
  '{"count": 0, "own": null, "top": [], "histogram": null}'::jsonb,
  'zero runs: count 0, no own, empty top, no histogram'
);

select * from finish();
rollback;
