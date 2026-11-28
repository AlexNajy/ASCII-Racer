-- What the browser's roles can read and write: anon (not signed in) and authenticated (an
-- anonymous sign-in), switched with the JWT claims PostgREST sets.
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

-- a: the player under test, b and c: other players
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', true),
  ('00000000-0000-0000-0000-00000000000b', true),
  ('00000000-0000-0000-0000-00000000000c', true);
insert into public.attempts (user_id, day) values
  ('00000000-0000-0000-0000-00000000000b', 10),
  ('00000000-0000-0000-0000-00000000000c', 10),
  ('00000000-0000-0000-0000-00000000000b', 11);
insert into public.runs (user_id, day, ticks, nickname, simulation_version) values
  ('00000000-0000-0000-0000-00000000000b', 10, 5000, 'bee', 1),
  ('00000000-0000-0000-0000-00000000000c', 10, 4000, 'sea', 1),
  ('00000000-0000-0000-0000-00000000000b', 11, 4500, 'bee', 1);
insert into public.run_logs (user_id, day, log) values
  ('00000000-0000-0000-0000-00000000000b', 10, 'AQ'),
  ('00000000-0000-0000-0000-00000000000c', 10, 'AQ'),
  ('00000000-0000-0000-0000-00000000000b', 11, 'AQ');

select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.attempts'::regclass, 'public.runs'::regclass, 'public.run_logs'::regclass)),
  'row level security is enabled on every table'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and cmd <> 'SELECT'),
  0::bigint, 'no policy allows a write'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'run_logs'),
  0::bigint, 'no policy on run_logs'
);

-- Exact table privileges (owner aside): TRUNCATE is the one write row level security does not stop.
create function pg_temp.privs(tbl text, grantee_name text) returns text language sql as $$
  select coalesce(string_agg(a.privilege_type, ',' order by a.privilege_type), '')
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = ('public.' || tbl)::regclass
    and a.grantee = case when grantee_name = 'public' then 0 else (select oid from pg_roles where rolname = grantee_name) end
$$;

select is(pg_temp.privs(t, 'anon'), '', 'anon has no privilege on ' || t) from unnest(array['attempts', 'runs', 'run_logs']) t;
select is(pg_temp.privs(t, 'public'), '', 'public has no privilege on ' || t) from unnest(array['attempts', 'runs', 'run_logs']) t;
select is(pg_temp.privs('attempts', 'authenticated'), 'SELECT', 'authenticated: exactly SELECT on attempts');
select is(pg_temp.privs('runs', 'authenticated'), 'SELECT', 'authenticated: exactly SELECT on runs');
select is(pg_temp.privs('run_logs', 'authenticated'), '', 'authenticated: nothing on run_logs');
-- The migration grants these four; the local default privileges give service_role more, which is fine.
select ok(
  string_to_array(pg_temp.privs(t, 'service_role'), ',') @> array['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  'service_role: select, insert, update, delete on ' || t
) from unnest(array['attempts', 'runs', 'run_logs']) t;
select is(
  (select count(*) from pg_attribute
   where attrelid in ('public.attempts'::regclass, 'public.runs'::regclass, 'public.run_logs'::regclass)
     and attacl is not null),
  0::bigint, 'no column level privileges'
);

-- Exact function privileges: hosted defaults grant EXECUTE on new functions to public, anon and authenticated.
create function pg_temp.fprivs(fn regprocedure, grantee_name text) returns text language sql as $$
  select coalesce(string_agg(a.privilege_type, ',' order by a.privilege_type), '')
  from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = fn
    and a.grantee = case when grantee_name = 'public' then 0 else (select oid from pg_roles where rolname = grantee_name) end
$$;

select is(
  pg_temp.fprivs('public.store_run(uuid, integer, integer, text, integer, text)', r), '',
  r || ' has no privilege on store_run'
) from unnest(array['public', 'anon', 'authenticated']) r;
select is(
  pg_temp.fprivs('public.store_run(uuid, integer, integer, text, integer, text)', 'service_role'), 'EXECUTE',
  'service_role: exactly EXECUTE on store_run'
);
select is(
  (select count(*) from pg_proc
   where pronamespace = 'public'::regnamespace
     and (has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'))),
  0::bigint, 'no function in public is executable by anon or authenticated'
);

-- anon
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok('select * from public.attempts', '42501', null, 'anon: attempts unreadable');
select throws_ok('select * from public.runs', '42501', null, 'anon: runs unreadable');
select throws_ok('select * from public.run_logs', '42501', null, 'anon: run_logs unreadable');
select throws_ok(
  $$insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000a', 12)$$,
  '42501', null, 'anon: no insert into attempts'
);
select throws_ok(
  $$insert into public.runs (user_id, day, ticks, nickname, simulation_version)
    values ('00000000-0000-0000-0000-00000000000b', 11, 1, 'anon', 1)$$,
  '42501', null, 'anon: no insert into runs'
);
select throws_ok(
  $$insert into public.run_logs (user_id, day, log) values ('00000000-0000-0000-0000-00000000000b', 11, 'AQ')$$,
  '42501', null, 'anon: no insert into run_logs'
);
select throws_ok('delete from public.attempts', '42501', null, 'anon: no delete from attempts');
select throws_ok('update public.runs set ticks = 1', '42501', null, 'anon: no update of runs');

-- a, signed in, no attempt yet
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*) from public.attempts), 0::bigint, 'a without attempts sees no attempts');
select is((select count(*) from public.runs where day = 10), 0::bigint, 'a without an attempt sees no runs of day 10');
select is((select count(*) from public.runs), 0::bigint, 'a without attempts sees no runs');

-- a's try for day 10 is used (written by the service role)
reset role;
insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000a', 10);
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select results_eq(
  'select user_id, day from public.attempts',
  $$values ('00000000-0000-0000-0000-00000000000a'::uuid, 10)$$,
  'a sees only its own attempt'
);
select results_eq(
  'select nickname, ticks from public.runs order by ticks',
  $$values ('sea'::text, 4000), ('bee'::text, 5000)$$,
  'a with an attempt for day 10 sees every run of day 10 and none of day 11'
);

-- a finished day 10
reset role;
insert into public.runs (user_id, day, ticks, nickname, simulation_version)
  values ('00000000-0000-0000-0000-00000000000a', 10, 4200, 'anon', 1);
insert into public.run_logs (user_id, day, log) values ('00000000-0000-0000-0000-00000000000a', 10, 'AQ');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*) from public.runs where day = 10), 3::bigint, 'a sees its own run of day 10 with the others');
select throws_ok('select * from public.run_logs', '42501', null, 'a: run_logs unreadable');
select throws_ok(
  $$select log from public.run_logs where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'a: its own log unreadable'
);

select throws_ok(
  $$insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000a', 11)$$,
  '42501', null, 'a: no forged attempt'
);
select throws_ok(
  $$insert into public.runs (user_id, day, ticks, nickname, simulation_version)
    values ('00000000-0000-0000-0000-00000000000a', 11, 1, 'anon', 1)$$,
  '42501', null, 'a: no forged run'
);
select throws_ok(
  $$insert into public.run_logs (user_id, day, log) values ('00000000-0000-0000-0000-00000000000a', 11, 'AQ')$$,
  '42501', null, 'a: no forged log'
);
select throws_ok(
  $$update public.attempts set day = 12 where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'a: no update of its attempt'
);
select throws_ok(
  $$update public.runs set ticks = 1 where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'a: no update of its run'
);
select throws_ok('update public.run_logs set log = $$AQ$$', '42501', null, 'a: no update of logs');
select throws_ok(
  $$delete from public.attempts where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'a: no delete of its attempt (no second try)'
);
select throws_ok(
  $$delete from public.runs where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'a: no delete of its run'
);
select throws_ok('delete from public.run_logs', '42501', null, 'a: no delete of logs');
select throws_ok('truncate public.attempts', '42501', null, 'a: no truncate');

-- The second layer: with every table privilege granted back, row level security alone still
-- lets nothing through but the reads above.
reset role;
grant all on table public.attempts, public.runs, public.run_logs to anon, authenticated;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*) from public.run_logs), 0::bigint, 'rls: a reads no logs');
select is((select count(*) from public.attempts), 1::bigint, 'rls: a still reads only its own attempt');
select throws_ok(
  $$insert into public.attempts (user_id, day) values ('00000000-0000-0000-0000-00000000000a', 11)$$,
  '42501', 'new row violates row-level security policy for table "attempts"', 'rls: no forged attempt'
);
select throws_ok(
  $$insert into public.runs (user_id, day, ticks, nickname, simulation_version)
    values ('00000000-0000-0000-0000-00000000000b', 11, 1, 'anon', 1)$$,
  '42501', 'new row violates row-level security policy for table "runs"', 'rls: no forged run'
);
select throws_ok(
  $$insert into public.run_logs (user_id, day, log) values ('00000000-0000-0000-0000-00000000000b', 11, 'AQ')$$,
  '42501', 'new row violates row-level security policy for table "run_logs"', 'rls: no forged log'
);
select lives_ok('update public.attempts set day = 12', 'rls: update of attempts runs');
select lives_ok('update public.runs set ticks = 1', 'rls: update of runs runs');
select lives_ok('delete from public.attempts', 'rls: delete from attempts runs');
select lives_ok('delete from public.runs', 'rls: delete from runs runs');
select lives_ok('delete from public.run_logs', 'rls: delete from run_logs runs');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*) from public.attempts), 0::bigint, 'rls: anon reads no attempts');
select is((select count(*) from public.runs), 0::bigint, 'rls: anon reads no runs');
select is((select count(*) from public.run_logs), 0::bigint, 'rls: anon reads no logs');

reset role;
select is((select count(*) from public.attempts), 4::bigint, 'rls: every attempt is still there');
select results_eq(
  'select ticks from public.runs order by ticks',
  $$values (4000), (4200), (4500), (5000)$$,
  'rls: every run is still there, unchanged'
);
select is((select count(*) from public.run_logs), 4::bigint, 'rls: every log is still there');

select * from finish();
rollback;
