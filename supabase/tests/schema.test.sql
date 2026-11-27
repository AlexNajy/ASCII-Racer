-- Keys, constraints and cascades, written as the service role like the Edge Functions will.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', true),
  ('00000000-0000-0000-0000-00000000000b', true);

set local role service_role;

select lives_ok(
  $$insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000a', 10)$$,
  'an attempt'
);
select lives_ok(
  $$insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000a', -3)$$,
  'an attempt on a day before the epoch'
);
select throws_ok(
  $$insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000a', 10)$$,
  '23505', null, 'a second attempt on the same day'
);
select throws_ok(
  $$insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-0000000000ff', 10)$$,
  '23503', null, 'an attempt without a user'
);
select isnt(
  (select started_at from public.attempts where user_id = '00000000-0000-0000-0000-00000000000a' and day = 10),
  null, 'started_at is set'
);

select lives_ok(
  $$insert into public.runs (user_id, day, ticks, nickname, simulation_version)
    values ('00000000-0000-0000-0000-00000000000a', 10, 4321, 'anon', 1)$$,
  'a run'
);
select throws_ok(
  $$insert into public.runs (user_id, day, ticks, nickname, simulation_version)
    values ('00000000-0000-0000-0000-00000000000a', 10, 4000, 'anon', 1)$$,
  '23505', null, 'a second run on the same day'
);
select throws_ok(
  $$insert into public.runs (user_id, day, ticks, nickname, simulation_version)
    values ('00000000-0000-0000-0000-00000000000b', 10, 4000, 'anon', 1)$$,
  '23503', null, 'a run without its attempt'
);

insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000b', 10);
create temporary table run_cases (ticks integer, nickname text, version integer, ok boolean, label text);
insert into run_cases values
  (0, 'anon', 1, false, 'ticks 0'),
  (36000, 'anon', 1, false, 'ticks 36000'),
  (1, 'anon', 1, true, 'ticks 1'),
  (35999, 'anon', 1, true, 'ticks 35999'),
  (100, 'ab', 1, false, 'nickname of 2 characters'),
  (100, 'abcdefghijklm', 1, false, 'nickname of 13 characters'),
  (100, 'abcdefghijkl', 1, true, 'nickname of 12 characters'),
  (100, ' abc', 1, false, 'nickname with a leading space'),
  (100, 'abc ', 1, false, 'nickname with a trailing space'),
  (100, 'a  b', 1, false, 'nickname with a double space'),
  (100, 'a_b', 1, false, 'nickname with an underscore'),
  (100, 'zoë', 1, false, 'nickname with a non-ASCII letter'),
  (100, 'A b 1', 1, true, 'nickname A b 1'),
  (100, 'anon', 0, false, 'simulation version 0'),
  (100, 'anon', -1, false, 'simulation version -1');

create function pg_temp.try_run(t integer, n text, v integer) returns boolean language plpgsql as $$
begin
  insert into public.runs (user_id, day, ticks, nickname, simulation_version)
    values ('00000000-0000-0000-0000-00000000000b', 10, t, n, v);
  delete from public.runs where user_id = '00000000-0000-0000-0000-00000000000b' and day = 10;
  return true;
exception when check_violation then
  return false;
end
$$;

select is(pg_temp.try_run(ticks, nickname, version), ok, label) from run_cases order by ctid;

create function pg_temp.try_log(text) returns boolean language plpgsql as $$
begin
  insert into public.run_logs (user_id, day, log) values ('00000000-0000-0000-0000-00000000000a', 10, $1);
  delete from public.run_logs where user_id = '00000000-0000-0000-0000-00000000000a' and day = 10;
  return true;
exception when check_violation then
  return false;
end
$$;

select is(pg_temp.try_log(''), false, 'a log of length 0');
select is(pg_temp.try_log(repeat('A', 48004)), true, 'a log of MAX_LOG_TEXT characters');
select is(pg_temp.try_log(repeat('A', 48005)), false, 'a log of MAX_LOG_TEXT + 1 characters');
select is(pg_temp.try_log('AQ-_'), true, 'a log in the base64url alphabet');
select is(pg_temp.try_log('AQ=='), false, 'a log with padding');
select throws_ok(
  $$insert into public.run_logs (user_id, day, log) values ('00000000-0000-0000-0000-00000000000b', 10, 'AQ')$$,
  '23503', null, 'a log without its run'
);

insert into public.run_logs (user_id, day, log) values ('00000000-0000-0000-0000-00000000000a', 10, 'AQ');
select throws_ok(
  $$insert into public.run_logs (user_id, day, log) values ('00000000-0000-0000-0000-00000000000a', 10, 'AQ')$$,
  '23505', null, 'a second log for the same run'
);

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select count(*) from public.attempts where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint, 'deleting the user removes its attempts'
);
select is(
  (select count(*) from public.runs where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint, 'deleting the user removes its runs'
);
select is(
  (select count(*) from public.run_logs where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint, 'deleting the user removes its logs'
);
select is(
  (select count(*) from public.attempts where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint, 'other users keep theirs'
);

select * from finish();
rollback;
