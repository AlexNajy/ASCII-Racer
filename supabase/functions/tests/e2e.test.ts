import { assert, assertEquals } from '@std/assert';
import {
  dayNumber,
  drivenDailyLog,
  encodeLogText,
  inputCode,
  MAX_RUN_TICKS,
  replayDaily,
  SIMULATION_VERSION,
} from './dailyLog.ts';

// The functions over HTTP on the local stack (npm run backend:test sets the environment): real sign-ins, real logs,
// the database checked with the service key afterwards.

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set; run npm run backend:test`);
  return value;
}

const API = env('SUPABASE_URL');
const PUBLISHABLE_KEY = env('SUPABASE_PUBLISHABLE_KEY');
const ANON_KEY = env('SUPABASE_ANON_KEY');
const SERVICE_KEY = env('SUPABASE_SERVICE_KEY');

interface Player {
  id: string;
  token: string;
}

async function signUp(): Promise<Player> {
  const response = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const session = await response.json();
  assertEquals(response.status, 200, JSON.stringify(session));
  return { id: session.user.id, token: session.access_token };
}

async function call(
  name: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown>; ms: number }> {
  const start = performance.now();
  const response = await fetch(`${API}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json, ms: performance.now() - start };
}

function as(player: Player): Record<string, string> {
  return { Authorization: `Bearer ${player.token}`, apikey: PUBLISHABLE_KEY };
}

async function rest(path: string, key: string, token = key): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${API}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  return { status: response.status, json: await response.json() };
}

async function serviceRows(table: string, userId: string): Promise<Record<string, unknown>[]> {
  const { status, json } = await rest(`${table}?user_id=eq.${userId}`, SERVICE_KEY);
  assertEquals(status, 200);
  return json as Record<string, unknown>[];
}

function base64url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hs256(header: object, payload: object, secret: string): Promise<string> {
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${base64url(String.fromCharCode(...signature))}`;
}

function report(label: string, ms: number): void {
  console.log(`  ${label}: ${ms.toFixed(0)} ms`);
}

const day = dayNumber(Date.now());
const driven = drivenDailyLog(day);
const run = (log: string, extra: Record<string, unknown> = {}) => ({
  day,
  log,
  nickname: 'e2e racer',
  version: SIMULATION_VERSION,
  ticks: 1, // a claimed time: never read
  ...extra,
});

Deno.test('daily functions end to end', async (t) => {
  const a = await signUp();
  const b = await signUp();

  await t.step('no identity: refused with 401 and nothing stored', async () => {
    const [, payload] = a.token.split('.');
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const later = { ...claims, exp: claims.exp + 3600 };
    const [header, , signature] = a.token.split('.');
    const tampered = `${header}.${base64url(JSON.stringify(later))}.${signature}`;
    const forged = await hs256({ alg: 'HS256', typ: 'JWT' }, { ...claims }, 'not-the-project-secret-but-32-characters');
    const refusedHeaders: Record<string, string>[] = [
      {},
      { apikey: ANON_KEY },
      { apikey: PUBLISHABLE_KEY },
      { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` },
      { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${forged}` },
      { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${tampered}` },
    ];
    for (const headers of refusedHeaders) {
      for (const [name, body] of [['start-attempt', { day }], ['submit-run', run(driven.text)]] as const) {
        const { status, json } = await call(name, body, headers);
        assertEquals([status, json], [401, { error: 'unauthorized' }], `${name} ${JSON.stringify(headers)}`);
      }
    }
    assertEquals(await serviceRows('attempts', a.id), []);
  });

  await t.step('a 1 MB body is refused before any work', async () => {
    const { status, json, ms } = await call('submit-run', run('A'.repeat(1 << 20)), as(a));
    assertEquals([status, json], [413, { error: 'bodyTooLarge' }]);
    report('1 MB body refused', ms);
  });

  await t.step('submitting without starting', async () => {
    const { status, json } = await call('submit-run', run(driven.text), as(a));
    assertEquals([status, json], [409, { error: 'noAttempt' }]);
    assertEquals(await serviceRows('runs', a.id), []);
  });

  await t.step('start-attempt: started, then already started', async () => {
    assertEquals((await call('start-attempt', { day }, as(a))).json, { status: 'started' });
    assertEquals((await call('start-attempt', { day }, as(a))).json, { status: 'alreadyStarted' });
    assertEquals((await call('start-attempt', { day: day + 1 }, as(a))).json, { error: 'dayNotOpen' });
    assertEquals((await serviceRows('attempts', a.id)).map((row) => row.day), [day]);
  });

  await t.step('a log cut short stores nothing', async () => {
    const cut = encodeLogText(driven.log.slice(0, driven.log.length - 60));
    const { status, json } = await call('submit-run', run(cut), as(a));
    assertEquals([status, json], [422, { error: 'logEnded' }]);
    assertEquals(await serviceRows('runs', a.id), []);
  });

  await t.step('a real log is stored with the ticks the server replayed', async () => {
    const { status, json, ms } = await call('submit-run', run(driven.text), as(a));
    assertEquals([status, json], [200, { status: 'stored', ticks: driven.ticks }]);
    report(`submit-run, real log (${driven.ticks} ticks, ${driven.text.length} characters)`, ms);
    const [stored] = await serviceRows('runs', a.id);
    assertEquals([stored.ticks, stored.nickname, stored.simulation_version], [driven.ticks, 'e2e racer', SIMULATION_VERSION]);
    assertEquals((await serviceRows('run_logs', a.id)).map((row) => row.log), [driven.text]);
  });

  await t.step('the player reads its run but no log', async () => {
    const runs = await rest(`runs?select=day,ticks,nickname&user_id=eq.${a.id}`, PUBLISHABLE_KEY, a.token);
    assertEquals(runs, { status: 200, json: [{ day, ticks: driven.ticks, nickname: 'e2e racer' }] });
    const logs = await rest('run_logs?select=log', PUBLISHABLE_KEY, a.token);
    assert(logs.status === 401 || logs.status === 403, `run_logs answered ${logs.status}`);
    assertEquals((logs.json as { code?: string }).code, '42501');
  });

  await t.step('a second submit gives the stored run without a replay', async () => {
    const { status, json } = await call('submit-run', run('AQ', { nickname: 'other' }), as(a));
    assertEquals([status, json], [200, { status: 'alreadyStored', ticks: driven.ticks }]);
    assertEquals((await serviceRows('runs', a.id))[0].nickname, 'e2e racer');
  });

  await t.step("another player's token can't submit for the first", async () => {
    const { status, json } = await call('submit-run', run(driven.text, { user_id: a.id, userId: a.id }), as(b));
    assertEquals([status, json], [409, { error: 'noAttempt' }]);
    assertEquals(await serviceRows('runs', b.id), []);
    assertEquals((await serviceRows('runs', a.id))[0].ticks, driven.ticks);
  });

  await t.step('the worst case: a full log that never finishes', async () => {
    assertEquals((await call('start-attempt', { day }, as(b))).json, { status: 'started' });
    const throttle = inputCode({ throttle: 1, brake: 0, steer: 0, drift: 0 });
    const full = new Uint8Array(MAX_RUN_TICKS).fill(throttle);
    const expected = replayDaily(day, full);
    assert(!expected.finished);
    const { status, json, ms } = await call('submit-run', run(encodeLogText(full)), as(b));
    assertEquals([status, json], [422, { error: expected.reason }]);
    report(`submit-run, worst case (${MAX_RUN_TICKS} ticks of full throttle)`, ms);
    assertEquals(await serviceRows('runs', b.id), []);
  });

  await t.step('one input changed mid-race: refused, or stored with the server ticks', async () => {
    const changed = driven.log.slice();
    const middle = Math.floor(changed.length / 2);
    changed[middle] = inputCode({ throttle: 0, brake: 1, steer: 1, drift: 1 });
    const text = encodeLogText(changed);
    const expected = replayDaily(day, changed);
    const { status, json } = await call('submit-run', run(text), as(b));
    if (expected.finished) {
      assertEquals([status, json], [200, { status: 'stored', ticks: expected.ticks }]);
      assertEquals((await serviceRows('runs', b.id))[0].ticks, expected.ticks);
    } else {
      assertEquals([status, json], [422, { error: expected.reason }]);
      assertEquals(await serviceRows('runs', b.id), []);
    }
    assertEquals((await serviceRows('runs', a.id))[0].ticks, driven.ticks);
  });

  await t.step('two submits racing each other leave one run with its log', async () => {
    const c = await signUp();
    assertEquals((await call('start-attempt', { day }, as(c))).json, { status: 'started' });
    const replies = await Promise.all([
      call('submit-run', run(driven.text, { nickname: 'first' }), as(c)),
      call('submit-run', run(driven.text, { nickname: 'second' }), as(c)),
    ]);
    assertEquals(replies.map(({ status, json }) => [status, json.ticks]), [[200, driven.ticks], [200, driven.ticks]]);
    assertEquals(replies.map(({ json }) => json.status).sort(), ['alreadyStored', 'stored']);
    const runs = await serviceRows('runs', c.id);
    assertEquals(runs.length, 1);
    assertEquals(runs[0].nickname, replies[0].json.status === 'stored' ? 'first' : 'second');
    assertEquals((await serviceRows('run_logs', c.id)).map((row) => row.log), [driven.text]);
  });
});
