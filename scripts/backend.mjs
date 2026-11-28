// Every backend test against the local Supabase stack (Docker must be running): start what is needed, reset the
// database, pgTAP, the database lint, the functions' unit tests, then the functions end to end over HTTP.
// `node scripts/backend.mjs stop` stops the stack.
import { spawnSync } from 'node:child_process';

const DENO_CONFIG = 'supabase/functions/deno.json';
const UNIT_TESTS = ['supabase/functions/tests/handlers.test.ts', 'supabase/functions/tests/http.test.ts'];
const E2E_TESTS = ['supabase/functions/tests/e2e.test.ts'];

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function supabase(...args) {
  run('npx', ['--no', 'supabase', ...args]);
}

function deno(args, env) {
  run('npx', ['--no', 'deno', 'test', '--config', DENO_CONFIG, ...args], { env: { ...process.env, ...env } });
}

function status() {
  const result = spawnSync('npx', ['--no', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`supabase status failed: ${result.stderr}`);
  return JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
}

if (process.argv[2] === 'stop') {
  supabase('stop');
} else {
  supabase('start');
  supabase('db', 'reset');
  supabase('test', 'db');
  supabase('db', 'lint', '--fail-on', 'warning');
  deno(UNIT_TESTS);
  const stack = status();
  deno(['--allow-net', '--allow-env', ...E2E_TESTS], {
    SUPABASE_URL: stack.API_URL,
    SUPABASE_PUBLISHABLE_KEY: stack.PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: stack.ANON_KEY,
    SUPABASE_SERVICE_KEY: stack.SECRET_KEY ?? stack.SERVICE_ROLE_KEY,
  });
}
