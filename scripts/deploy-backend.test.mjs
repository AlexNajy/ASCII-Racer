import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTH_SETTINGS, FUNCTIONS, main, mask, publicKey, smokeFailures } from './deploy-backend.mjs';

const SECRETS = {
  SUPABASE_ACCESS_TOKEN: 'test-access-token-not-a-real-one',
  SUPABASE_DB_PASSWORD: 'hunter2-database-password',
  SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
};
const URL = 'https://abcdefghijklmnopqrst.supabase.co';
const API = 'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst';
const PUBLISHABLE = 'sb_publishable_TESTKEY';
const KEYS = [
  { name: 'anon', type: 'legacy', api_key: 'eyJanon' },
  { name: 'service_role', type: 'legacy', api_key: 'eyJservice' },
  { name: 'default', type: 'publishable', api_key: PUBLISHABLE },
  { name: 'default', type: 'secret', api_key: 'sb_secret_abcd···' },
];
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

// A hosted project as the deploy sees it: the Management API and the project's own endpoints.
function project({ auth = { ...AUTH_SETTINGS, site_url: 'x', smtp_pass: 'secret' }, healthy = true, keys = KEYS, healthyFrom = 1 } = {}) {
  let smokeTries = 0;
  const requests = [];
  const fetchFn = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    requests.push({ method, url, body: init.body, headers: init.headers ?? {} });
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS } });
    if (url === `${API}/config/auth` && method === 'GET') return json(200, auth);
    if (url === `${API}/config/auth` && method === 'PATCH') return json(200, { ...auth, ...JSON.parse(init.body) });
    if (url === `${API}/api-keys?reveal=false`) return json(200, keys);
    if (url === `${URL}/auth/v1/settings`) smokeTries++;
    if (url.startsWith(`${URL}/functions/v1/`) && method === 'OPTIONS') {
      return new Response(null, { status: healthy && smokeTries + 1 >= healthyFrom ? 204 : 404, headers: CORS });
    }
    if (url === `${URL}/functions/v1/start-attempt` && method === 'POST') return json(401, { error: 'unauthorized' });
    if (url === `${URL}/auth/v1/settings`) {
      return json(200, { external: { anonymous_users: true, email: false }, disable_signup: false });
    }
    return json(404, {});
  };
  return { requests, fetchFn };
}

async function deploy(argv, env, fetchFn = project().fetchFn, status = () => 0) {
  const sleeps = [];
  const lines = [];
  const runs = [];
  const appended = [];
  const code = await main(argv, env, {
    run: (args, runEnv) => {
      runs.push({ args, runEnv });
      return status(args);
    },
    fetchFn,
    log: (line) => lines.push(line),
    appendEnv: (file, text) => appended.push({ file, text }),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { code, sleeps, lines, runs, appended, output: lines.join('\n') };
}

function expectNoSecrets(text) {
  expect(text).not.toContain(SECRETS.SUPABASE_ACCESS_TOKEN);
  expect(text).not.toContain(SECRETS.SUPABASE_DB_PASSWORD);
  expect(text).not.toContain(SECRETS.SUPABASE_PROJECT_REF);
}

describe('deploy-backend', () => {
  it('skips with exit 0 when a secret is missing or empty, touching nothing', async () => {
    for (const mode of ['deploy', 'check', 'env']) {
      for (const name of Object.keys(SECRETS)) {
        const env = { ...SECRETS, [name]: '' };
        const { requests, fetchFn } = project();
        const result = await deploy([mode], env, fetchFn);
        expect(result.code).toBe(0);
        expect(result.output).toBe(`backend ${mode}: skipped, ${name} not set (no hosted backend; the site builds without one)`);
        expect(result.runs).toEqual([]);
        expect(result.appended).toEqual([]);
        expect(requests).toEqual([]);
      }
    }
    expect((await deploy(['deploy'], {})).output).toContain(
      'SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_REF not set',
    );
  });

  it('refuses a ref that is not one, without printing it', async () => {
    const result = await deploy(['deploy'], { ...SECRETS, SUPABASE_PROJECT_REF: 'not-a-ref' });
    expect(result.code).toBe(1);
    expect(result.output).not.toContain('not-a-ref');
    expect(result.runs).toEqual([]);
  });

  it('--print lists the steps in order with the secrets masked and runs nothing', async () => {
    const { requests, fetchFn } = project();
    const result = await deploy(['deploy', '--print'], SECRETS, fetchFn);
    expect(result.code).toBe(0);
    expect(result.runs).toEqual([]);
    expect(requests).toEqual([]);
    expect(result.lines).toEqual([
      '\n> supabase link --project-ref ***',
      '\n> supabase db push --remote --yes',
      '\n> supabase functions deploy start-attempt submit-run --yes',
      `\n> auth settings: GET https://api.supabase.com/v1/projects/***/config/auth, PATCH what differs from ${JSON.stringify(AUTH_SETTINGS)}`,
      '\n> smoke check https://***.supabase.co: OPTIONS and a preflight on start-attempt, submit-run; POST start-attempt without a token; GET /auth/v1/settings',
    ]);
    const check = await deploy(['check', '--print'], SECRETS);
    expect(check.lines).toEqual(['\n> supabase link --project-ref ***', '\n> supabase db push --remote --dry-run']);
  });

  it('deploys in order: link, migrations, functions, auth, smoke check', async () => {
    const { requests, fetchFn } = project({ auth: { external_anonymous_users_enabled: false, external_email_enabled: true, disable_signup: false } });
    const result = await deploy(['deploy'], SECRETS, fetchFn);
    expect(result.code).toBe(0);
    expect(result.runs.map((step) => step.args)).toEqual([
      ['link', '--project-ref', SECRETS.SUPABASE_PROJECT_REF],
      ['db', 'push', '--remote', '--yes'],
      ['functions', 'deploy', 'start-attempt', 'submit-run', '--yes'],
    ]);
    expect(result.runs[1].runEnv.SUPABASE_DB_PASSWORD).toBe(SECRETS.SUPABASE_DB_PASSWORD);
    const patch = requests.find((request) => request.method === 'PATCH');
    expect(JSON.parse(patch.body)).toEqual({ external_anonymous_users_enabled: true, external_email_enabled: false });
    expect(patch.headers.Authorization).toBe(`Bearer ${SECRETS.SUPABASE_ACCESS_TOKEN}`);
    expect(requests.find((request) => request.url.endsWith('/auth/v1/settings')).headers.apikey).toBe(PUBLISHABLE);
    expect(result.output).toContain('smoke check passed (try 1)');
    expectNoSecrets(result.output);
  });

  it('changes nothing on the auth server when it already matches', async () => {
    const { requests, fetchFn } = project();
    const result = await deploy(['deploy'], SECRETS, fetchFn);
    expect(result.code).toBe(0);
    expect(requests.some((request) => request.method === 'PATCH')).toBe(false);
    expect(result.output).toContain('auth settings already match');
  });

  it('stops at the first failing command', async () => {
    const { requests, fetchFn } = project();
    const result = await deploy(['deploy'], SECRETS, fetchFn, (args) => (args[0] === 'db' ? 3 : 0));
    expect(result.code).toBe(3);
    expect(result.runs.map((step) => step.args[0])).toEqual(['link', 'db']);
    expect(requests).toEqual([]);
    expectNoSecrets(result.output);
  });

  it('the pull request check only links and dry-runs the migrations', async () => {
    const { requests, fetchFn } = project();
    const result = await deploy(['check'], SECRETS, fetchFn);
    expect(result.code).toBe(0);
    expect(result.runs.map((step) => step.args)).toEqual([
      ['link', '--project-ref', SECRETS.SUPABASE_PROJECT_REF],
      ['db', 'push', '--remote', '--dry-run'],
    ]);
    expect(requests).toEqual([]);
  });

  it('a failed smoke check fails the deploy after every try', async () => {
    const result = await deploy(['deploy'], SECRETS, project({ healthy: false }).fetchFn);
    expect(result.code).toBe(1);
    expect(result.output).toContain('OPTIONS start-attempt: status 404, expected 204');
    expectNoSecrets(result.output);
  });

  it('a smoke check that fails on the first tries and passes later succeeds, waiting between tries', async () => {
    const result = await deploy(['deploy'], SECRETS, project({ healthyFrom: 4 }).fetchFn);
    expect(result.code).toBe(0);
    expect(result.sleeps).toHaveLength(3);
    expect(result.output).toContain('smoke check try 1/');
    expect(result.output).toContain('smoke check try 3/');
    expect(result.output).not.toContain('smoke check try 4/');
    expect(result.output).toContain('smoke check passed (try 4)');
    expectNoSecrets(result.output);
  });

  it('a smoke check that never passes waits for about four minutes', async () => {
    const result = await deploy(['deploy'], SECRETS, project({ healthy: false }).fetchFn);
    expect(result.code).toBe(1);
    const waited = result.sleeps.reduce((sum, ms) => sum + ms, 0);
    expect(waited).toBeGreaterThanOrEqual(230000);
    expect(waited).toBeLessThanOrEqual(250000);
  });

  it('a request that times out counts as a failed try', async () => {
    let calls = 0;
    const inner = project().fetchFn;
    const fetchFn = async (url, init) => {
      if (url.startsWith(`${URL}/auth/v1/settings`) && calls++ === 0) throw new DOMException('timed out', 'TimeoutError');
      return inner(url, init);
    };
    const result = await deploy(['deploy'], SECRETS, fetchFn);
    expect(result.code).toBe(0);
    expect(result.output).toContain('GET auth settings: timed out');
    expect(result.output).toContain('smoke check passed (try 2)');
  });

  it('every request carries a timeout', async () => {
    const signals = [];
    const inner = project().fetchFn;
    await deploy(['deploy'], SECRETS, async (url, init) => {
      signals.push(init.signal);
      return inner(url, init);
    });
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('a Management API error fails the run and the message holds no secret', async () => {
    const fetchFn = async (url) => new Response(`denied for ${SECRETS.SUPABASE_ACCESS_TOKEN} ${SECRETS.SUPABASE_DB_PASSWORD} ${url}`, { status: 403 });
    for (const argv of [['deploy'], ['env']]) {
      const result = await deploy(argv, { ...SECRETS, GITHUB_ENV: '/tmp/github-env' }, fetchFn);
      expect(result.code).toBe(1);
      expect(result.output).toContain('status 403');
      expectNoSecrets(result.output);
      expect(result.appended).toEqual([]);
    }
  });

  it('a Management API request that times out fails the run with a masked message', async () => {
    const fetchFn = async (url) => {
      throw new DOMException(`timed out reaching ${url} with ${SECRETS.SUPABASE_ACCESS_TOKEN}`, 'TimeoutError');
    };
    const result = await deploy(['deploy'], SECRETS, fetchFn);
    expect(result.code).toBe(1);
    expect(result.output).toContain('request failed');
    expectNoSecrets(result.output);
  });

  it('env mode fails clearly when the project has no usable key', async () => {
    const keys = [{ name: 'service_role', type: 'legacy', api_key: 'eyJservice' }, { name: 'default', type: 'secret', api_key: 'sb_secret_x' }];
    const result = await deploy(['env'], { ...SECRETS, GITHUB_ENV: '/tmp/github-env' }, project({ keys }).fetchFn);
    expect(result.code).toBe(1);
    expect(result.output).toContain('neither a publishable key nor a legacy anon key');
    expect(result.appended).toEqual([]);
    expectNoSecrets(result.output);
  });

  it('writes the public connection values for Vite', async () => {
    const result = await deploy(['env'], { ...SECRETS, GITHUB_ENV: '/tmp/github-env' });
    expect(result.code).toBe(0);
    expect(result.appended).toEqual([{ file: '/tmp/github-env', text: `VITE_SUPABASE_URL=${URL}\nVITE_SUPABASE_KEY=${PUBLISHABLE}\n` }]);
    expect(result.runs).toEqual([]);
    expectNoSecrets(result.output);
  });

  it('the site key is the publishable one, else the legacy anon key, never a secret one', () => {
    expect(publicKey(KEYS)).toBe(PUBLISHABLE);
    expect(publicKey(KEYS.filter((key) => key.type !== 'publishable'))).toBe('eyJanon');
    expect(publicKey([{ name: 'service_role', type: 'legacy', api_key: 'eyJservice' }, { name: 'x', type: 'secret', api_key: 'sb_secret_x' }])).toBeNull();
    expect(publicKey([{ name: 'default', type: 'publishable', api_key: 'sb_secret_x' }])).toBeNull();
  });

  it('masks every secret', () => {
    expect(mask(`a ${SECRETS.SUPABASE_DB_PASSWORD} b ${SECRETS.SUPABASE_PROJECT_REF}`, SECRETS)).toBe('a *** b ***');
  });

  it('smoke check names each failure', async () => {
    const fetchFn = async () => new Response('{}', { status: 500 });
    const failures = await smokeFailures(URL, PUBLISHABLE, fetchFn);
    expect(failures).toHaveLength(2 * FUNCTIONS.length + 2);
  });

  it('deploys every function there is, each with JWT verification off in config.jsonc', () => {
    const dirs = readdirSync('supabase/functions').filter((name) => existsSync(`supabase/functions/${name}/index.ts`));
    expect([...FUNCTIONS].sort()).toEqual(dirs.sort());
    const config = readFileSync('supabase/config.jsonc', 'utf8');
    for (const name of FUNCTIONS) expect(config).toContain(`"${name}": { "verify_jwt": false }`);
  });
});
