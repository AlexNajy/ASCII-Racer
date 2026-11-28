// The hosted backend from GitHub Actions. Reads SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD and SUPABASE_PROJECT_REF;
// when any is empty it does nothing and exits 0, so a fork still builds and deploys the site.
//   node scripts/deploy-backend.mjs deploy   link, push the migrations, deploy the functions, auth settings, smoke check
//   node scripts/deploy-backend.mjs check    link, then a dry run of the migrations (changes nothing on the project)
//   node scripts/deploy-backend.mjs env      the site's public connection values into $GITHUB_ENV for Vite
// --print shows what would run, secrets masked, and runs nothing.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SECRET_NAMES = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_PROJECT_REF'];
export const FUNCTIONS = ['start-attempt', 'submit-run'];
// What the game needs of the hosted auth server; field names of the Management API's /config/auth.
export const AUTH_SETTINGS = {
  external_anonymous_users_enabled: true,
  external_email_enabled: false,
  disable_signup: false, // anonymous sign-ins are sign-ups
};
const MANAGEMENT_API = 'https://api.supabase.com';
const PROJECT_REF = /^[a-z]{20}$/;
const SMOKE_WAIT_MS = 240000; // freshly patched auth settings can be served stale for a while
const SMOKE_DELAY_MS = 5000;
const SMOKE_TRIES = Math.ceil(SMOKE_WAIT_MS / SMOKE_DELAY_MS);
const FETCH_TIMEOUT_MS = 30000;

export function missingSecrets(env) {
  return SECRET_NAMES.filter((name) => !env[name]);
}

export function projectUrl(ref) {
  return `https://${ref}.supabase.co`;
}

// Every secret value in text replaced by ***, longest first so one inside another can't leave a part showing.
export function mask(text, env) {
  const secrets = SECRET_NAMES.map((name) => env[name]).filter(Boolean).sort((a, b) => b.length - a.length);
  return secrets.reduce((out, secret) => out.split(secret).join('***'), text);
}

// The CLI's arguments, in order. The database password reaches `db push` as SUPABASE_DB_PASSWORD in the
// environment, never on the command line. Functions keep `verify_jwt = false` from supabase/config.jsonc.
export function cliSteps(mode, ref) {
  const link = ['link', '--project-ref', ref];
  if (mode === 'check') return [link, ['db', 'push', '--remote', '--dry-run']];
  return [link, ['db', 'push', '--remote', '--yes'], ['functions', 'deploy', ...FUNCTIONS, '--yes']];
}

// The fields of AUTH_SETTINGS that the current config doesn't match, or null when it matches.
export function authChanges(current) {
  const changes = Object.entries(AUTH_SETTINGS).filter(([field, value]) => current[field] !== value);
  return changes.length > 0 ? Object.fromEntries(changes) : null;
}

// The key the site may carry: the project's publishable key, else the legacy anon key. Never a secret one.
export function publicKey(keys) {
  const publishable = keys.find((key) => key.type === 'publishable' && /^sb_publishable_\S+$/.test(key.api_key ?? ''));
  if (publishable) return publishable.api_key;
  const anon = keys.find((key) => key.name === 'anon' && (key.type ?? 'legacy') === 'legacy' && /^eyJ\S+$/.test(key.api_key ?? ''));
  return anon ? anon.api_key : null;
}

// What is wrong with the deployed project, read without creating anything; empty when all is well.
export async function smokeFailures(url, key, fetchFn) {
  const failures = [];
  const check = async (label, request, test) => {
    try {
      const reason = await test(await fetchFn(...request));
      if (reason) failures.push(`${label}: ${reason}`);
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const cors = (response) => {
    if (response.headers.get('access-control-allow-origin') !== '*') return 'no Access-Control-Allow-Origin: *';
    if (!/\bPOST\b/.test(response.headers.get('access-control-allow-methods') ?? '')) return 'POST not allowed';
    const headers = response.headers.get('access-control-allow-headers') ?? '';
    if (!/\bauthorization\b/i.test(headers) || !/\bcontent-type\b/i.test(headers)) return 'authorization or content-type not allowed';
    return null;
  };
  // A plain OPTIONS reaches the function's own answer; a gateway may answer a browser's preflight itself.
  const preflight = {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  };
  for (const name of FUNCTIONS) {
    await check(`OPTIONS ${name}`, [`${url}/functions/v1/${name}`, { method: 'OPTIONS' }], async (response) => {
      await response.arrayBuffer();
      return response.status === 204 ? cors(response) : `status ${response.status}, expected 204`;
    });
    await check(`preflight ${name}`, [`${url}/functions/v1/${name}`, preflight], async (response) => {
      await response.arrayBuffer();
      return response.ok ? cors(response) : `status ${response.status}`;
    });
  }
  const noToken = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
  await check('POST start-attempt without a token', [`${url}/functions/v1/start-attempt`, noToken], async (response) => {
    const text = await response.text();
    if (response.status !== 401) return `status ${response.status}, expected 401: ${text.slice(0, 200)}`;
    return text === JSON.stringify({ error: 'unauthorized' }) ? null : `body ${text.slice(0, 200)}, expected {"error":"unauthorized"}`;
  });
  await check('GET auth settings', [`${url}/auth/v1/settings`, { headers: { apikey: key } }], async (response) => {
    const text = await response.text();
    if (response.status !== 200) return `status ${response.status}: ${text.slice(0, 200)}`;
    const settings = JSON.parse(text);
    if (settings.external?.anonymous_users !== true) return 'anonymous sign-ins are off';
    if (settings.external?.email !== false) return 'email sign-in is on';
    if (settings.disable_signup !== false) return 'sign-ups are off';
    return null;
  });
  return failures;
}

function managementApi(env, fetchFn) {
  const base = `${MANAGEMENT_API}/v1/projects/${env.SUPABASE_PROJECT_REF}`;
  return async (method, path, body) => {
    const response = await fetchFn(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(mask(`${method} ${base}${path}: request failed: ${reason}`, env));
    });
    const text = await response.text();
    if (!response.ok) throw new Error(mask(`${method} ${base}${path}: status ${response.status}: ${text.slice(0, 300)}`, env));
    return text === '' ? null : JSON.parse(text);
  };
}

async function sitePublicKey(api) {
  const key = publicKey(await api('GET', '/api-keys?reveal=false'));
  if (!key) throw new Error('the project has neither a publishable key nor a legacy anon key');
  return key;
}

function supabaseCli(args, env) {
  const result = spawnSync('npx', ['--no', 'supabase', ...args], { stdio: 'inherit', env });
  return result.status ?? 1;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Exit code of one run. `io` is everything outside: the CLI, fetch, the log, $GITHUB_ENV and waiting.
export async function main(argv, env, io = {}) {
  const { run = supabaseCli, fetchFn: rawFetch = fetch, log = console.log, appendEnv = appendFileSync, sleep = wait } = io;
  const fetchFn = (url, init = {}) => rawFetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const [mode] = argv;
  const print = argv.includes('--print');
  if (!['deploy', 'check', 'env'].includes(mode)) {
    log('usage: node scripts/deploy-backend.mjs deploy|check|env [--print]');
    return 2;
  }
  const missing = missingSecrets(env);
  if (missing.length > 0) {
    log(`backend ${mode}: skipped, ${missing.join(', ')} not set (no hosted backend; the site builds without one)`);
    return 0;
  }
  const ref = env.SUPABASE_PROJECT_REF;
  if (!PROJECT_REF.test(ref)) {
    log(`backend ${mode}: SUPABASE_PROJECT_REF is not a project ref (20 lowercase letters)`);
    return 1;
  }
  const say = (text) => log(mask(text, env));
  try {
    return await execute({ mode, print, ref, env, io: { run, fetchFn, appendEnv, sleep }, say });
  } catch (error) {
    say(`backend ${mode}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

async function execute({ mode, print, ref, env, io: { run, fetchFn, appendEnv, sleep }, say }) {
  const url = projectUrl(ref);
  const api = managementApi(env, fetchFn);

  if (mode === 'env') {
    if (print) {
      say(`GET ${MANAGEMENT_API}/v1/projects/${ref}/api-keys?reveal=false`);
      say(`VITE_SUPABASE_URL=${url} and VITE_SUPABASE_KEY=<publishable key> into $GITHUB_ENV`);
      return 0;
    }
    const key = await sitePublicKey(api);
    if (!env.GITHUB_ENV) throw new Error('GITHUB_ENV is not set');
    appendEnv(env.GITHUB_ENV, `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_KEY=${key}\n`);
    say(`backend env: VITE_SUPABASE_URL=${url}, VITE_SUPABASE_KEY=${key}`);
    return 0;
  }

  for (const args of cliSteps(mode, ref)) {
    say(`\n> supabase ${args.join(' ')}`);
    if (print) continue;
    const status = run(args, env);
    if (status !== 0) {
      say(`backend ${mode}: supabase ${args.join(' ')} failed (exit ${status})`);
      return status;
    }
  }
  if (mode === 'check') return 0;

  say(`\n> auth settings: GET ${MANAGEMENT_API}/v1/projects/${ref}/config/auth, PATCH what differs from ${JSON.stringify(AUTH_SETTINGS)}`);
  say(`\n> smoke check ${url}: OPTIONS and a preflight on ${FUNCTIONS.join(', ')}; POST start-attempt without a token; GET /auth/v1/settings`);
  if (print) return 0;

  const changes = authChanges(await api('GET', '/config/auth'));
  if (changes) {
    await api('PATCH', '/config/auth', changes);
    say(`auth settings changed: ${JSON.stringify(changes)}`);
  } else {
    say('auth settings already match');
  }

  const key = await sitePublicKey(api);
  let failures = [];
  for (let attempt = 1; attempt <= SMOKE_TRIES; attempt++) {
    failures = await smokeFailures(url, key, fetchFn);
    if (failures.length === 0) {
      say(`smoke check passed (try ${attempt})`);
      return 0;
    }
    say(`smoke check try ${attempt}/${SMOKE_TRIES} failed:\n  ${failures.join('\n  ')}`);
    if (attempt < SMOKE_TRIES) await sleep(SMOKE_DELAY_MS);
  }
  say(`backend deploy: smoke check failed after ${SMOKE_TRIES} tries`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (error) => {
      console.error(mask(`backend: ${error instanceof Error ? error.message : String(error)}`, process.env));
      process.exit(1);
    },
  );
}
