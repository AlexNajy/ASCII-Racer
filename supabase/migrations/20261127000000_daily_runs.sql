-- Daily tries and their checked runs. Only the service role (the Edge Functions) writes; the browser
-- reads its own attempts and, once its try for a day is used, that day's runs.

create table public.attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  day integer not null,
  started_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.runs (
  user_id uuid not null,
  day integer not null,
  -- MAX_RUN_TICKS in src/game/inputLog.ts
  ticks integer not null check (ticks between 1 and 35999),
  -- validNickname in src/app/settings.ts
  nickname text not null check (
    char_length(nickname) between 3 and 12
    and nickname ~ '^[A-Za-z0-9]+( [A-Za-z0-9]+)*$'
  ),
  simulation_version integer not null check (simulation_version > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, day),
  foreign key (user_id, day) references public.attempts (user_id, day) on delete cascade
);

create index runs_leaderboard on public.runs (day, ticks, created_at);

-- Apart from runs so no browser can read another player's inputs and send them as its own.
create table public.run_logs (
  user_id uuid not null,
  day integer not null,
  -- encodeLogText's base64url, MAX_LOG_TEXT in src/game/inputLog.ts
  log text not null check (char_length(log) between 1 and 48004 and log ~ '^[A-Za-z0-9_-]+$'),
  primary key (user_id, day),
  foreign key (user_id, day) references public.runs (user_id, day) on delete cascade
);

alter table public.attempts enable row level security;
alter table public.runs enable row level security;
alter table public.run_logs enable row level security;

revoke all on table public.attempts, public.runs, public.run_logs from public, anon, authenticated;
grant select on table public.attempts, public.runs to authenticated;
grant select, insert, update, delete on table public.attempts, public.runs, public.run_logs to service_role;

create policy "attempts: own" on public.attempts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "runs: days with own attempt" on public.runs
  for select to authenticated
  using (
    exists (
      select 1 from public.attempts
      where attempts.user_id = (select auth.uid()) and attempts.day = runs.day
    )
  );
