-- store_run: a run and its log together or not at all, a second run for the same try reported and left alone.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', true),
  ('00000000-0000-0000-0000-00000000000b', true);
insert into public.attempts (user_id, day) values
  ('00000000-0000-0000-0000-00000000000a', 10),
  ('00000000-0000-0000-0000-00000000000b', 10);

select has_function('public', 'store_run', array['uuid', 'integer', 'integer', 'text', 'integer', 'text']);
select is(
  (select prosecdef from pg_proc where oid = 'public.store_run(uuid, integer, integer, text, integer, text)'::regprocedure),
  false, 'store_run runs as its caller'
);
select is(
  (select proconfig from pg_proc where oid = 'public.store_run(uuid, integer, integer, text, integer, text)'::regprocedure),
  array['search_path=""'], 'store_run has an empty search_path'
);

set local role service_role;

select results_eq(
  $$select * from public.store_run('00000000-0000-0000-0000-00000000000a', 10, 5000, 'anon', 1, 'AQID')$$,
  $$values (true, 5000)$$,
  'a new run is stored'
);
select results_eq(
  $$select ticks, nickname, simulation_version from public.runs where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values (5000, 'anon'::text, 1)$$,
  'the run row is there'
);
select results_eq(
  $$select log from public.run_logs where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values ('AQID'::text)$$,
  'its log is there'
);

select results_eq(
  $$select * from public.store_run('00000000-0000-0000-0000-00000000000a', 10, 4000, 'other', 1, 'BBBB')$$,
  $$values (false, 5000)$$,
  'a second run for the same try reports the stored ticks'
);
select results_eq(
  $$select ticks, nickname from public.runs where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values (5000, 'anon'::text)$$,
  'the second call changed no run'
);
select results_eq(
  $$select log from public.run_logs where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values ('AQID'::text)$$,
  'the second call changed no log'
);

select throws_ok(
  $$select * from public.store_run('00000000-0000-0000-0000-00000000000b', 10, 5000, 'bee', 1, 'not base64!')$$,
  '23514', null, 'a log that fails its check is refused'
);
select is(
  (select count(*) from public.runs where user_id = '00000000-0000-0000-0000-00000000000b'),
  0::bigint, 'and leaves no run behind'
);
select throws_ok(
  $$select * from public.store_run('00000000-0000-0000-0000-00000000000b', 10, 0, 'bee', 1, 'AQID')$$,
  '23514', null, 'ticks out of range are refused'
);
select throws_ok(
  $$select * from public.store_run('00000000-0000-0000-0000-00000000000b', 11, 5000, 'bee', 1, 'AQID')$$,
  '23503', null, 'a run without an attempt is refused'
);
select is(
  (select count(*) from public.run_logs where user_id = '00000000-0000-0000-0000-00000000000b'),
  0::bigint, 'no log was left by the refused calls'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok(
  $$select * from public.store_run('00000000-0000-0000-0000-00000000000b', 10, 1, 'bee', 1, 'AQID')$$,
  '42501', null, 'authenticated can not execute store_run'
);

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select * from public.store_run('00000000-0000-0000-0000-00000000000b', 10, 1, 'bee', 1, 'AQID')$$,
  '42501', null, 'anon can not execute store_run'
);

reset role;
select is(
  (select count(*) from public.runs where user_id = '00000000-0000-0000-0000-00000000000b'),
  0::bigint, 'b still has no run'
);
select is((select count(*) from public.runs), 1::bigint, 'one run in all');
select is((select count(*) from public.run_logs), 1::bigint, 'one log in all');

select * from finish();
rollback;
