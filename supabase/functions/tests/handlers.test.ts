import { assertEquals } from '@std/assert';
import {
  DAY_GRACE_MS,
  startAttempt,
  submitRun,
  type Reply,
  type Store,
  type StoredRun,
} from '../_shared/handlers.ts';
import { DAILY_EPOCH, drivenDailyLog, encodeLogText, MS_PER_DAY, SIMULATION_VERSION } from './dailyLog.ts';

const DAY = 330;
const USER = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';
const MS_SECOND = 1000;

function at(day: number, ms = 0): number {
  return DAILY_EPOCH + day * MS_PER_DAY + ms;
}
const NOON = 12 * 3600 * MS_SECOND;
const LAST_MS = MS_PER_DAY - 1; // 23:59:59.999

class FakeStore implements Store {
  attempts = new Set<string>();
  runs = new Map<string, StoredRun>();
  // A run that turns up between the check and the write, as from a racing submit.
  racedTicks: number | null = null;

  startAttempt(userId: string, day: number) {
    const key = `${userId}/${day}`;
    const isNew = !this.attempts.has(key);
    this.attempts.add(key);
    return Promise.resolve(isNew);
  }
  hasAttempt(userId: string, day: number) {
    return Promise.resolve(this.attempts.has(`${userId}/${day}`));
  }
  runTicks(userId: string, day: number) {
    return Promise.resolve(this.runs.get(`${userId}/${day}`)?.ticks ?? null);
  }
  storeRun(run: StoredRun) {
    const key = `${run.userId}/${run.day}`;
    const ticks = this.racedTicks ?? this.runs.get(key)?.ticks;
    if (ticks !== undefined) return Promise.resolve({ stored: false, ticks });
    this.runs.set(key, run);
    return Promise.resolve({ stored: true, ticks: run.ticks });
  }
}

function withAttempt(day = DAY, userId = USER): FakeStore {
  const store = new FakeStore();
  store.attempts.add(`${userId}/${day}`);
  return store;
}

function refused(code: number, error: string, extra: Record<string, unknown> = {}): Reply {
  return { code, body: { error, ...extra } };
}

const driven = drivenDailyLog(DAY);

function submission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  // ticks is a claimed time: never read
  return { day: DAY, log: driven.text, nickname: 'anon', version: SIMULATION_VERSION, ticks: 1, ...overrides };
}

Deno.test('start-attempt: malformed bodies', async () => {
  for (const body of [null, 'x', [], {}, { day: '330' }, { day: 330.5 }, { day: Number.MAX_SAFE_INTEGER + 1 }]) {
    const store = new FakeStore();
    assertEquals(await startAttempt(body, USER, at(DAY, NOON), store), refused(400, 'malformed'));
    assertEquals(store.attempts.size, 0);
  }
});

Deno.test('start-attempt: a new attempt, then the same one again', async () => {
  const store = new FakeStore();
  assertEquals(await startAttempt({ day: DAY }, USER, at(DAY, NOON), store), { code: 200, body: { status: 'started' } });
  assertEquals(await startAttempt({ day: DAY }, USER, at(DAY, NOON), store), {
    code: 200,
    body: { status: 'alreadyStarted' },
  });
  assertEquals(await startAttempt({ day: DAY }, OTHER, at(DAY, NOON), store), { code: 200, body: { status: 'started' } });
  assertEquals(store.attempts.size, 2);
});

Deno.test('start-attempt: the day by the server clock', async () => {
  const cases: [number, number, string | null][] = [
    [DAY, at(DAY, 0), null],
    [DAY, at(DAY, LAST_MS), null],
    [DAY + 1, at(DAY, LAST_MS), 'dayNotOpen'],
    [DAY, at(DAY + 1, 0), null],
    [DAY + 1, at(DAY + 1, 0), null],
    [DAY, at(DAY + 1, DAY_GRACE_MS - 1), null],
    [DAY, at(DAY + 1, DAY_GRACE_MS), 'dayOver'],
    [DAY - 1, at(DAY + 1, 0), 'dayOver'],
    [DAY - 1, at(DAY, NOON), 'dayOver'],
    [DAY + 2, at(DAY, NOON), 'dayNotOpen'],
  ];
  for (const [day, now, error] of cases) {
    const store = new FakeStore();
    const reply = await startAttempt({ day }, USER, now, store);
    assertEquals(reply, error ? refused(409, error) : { code: 200, body: { status: 'started' } }, `day ${day} at ${now}`);
    assertEquals(store.attempts.size, error ? 0 : 1);
  }
});

Deno.test('submit-run: malformed bodies', async () => {
  const bodies: unknown[] = [
    null,
    [],
    {},
    submission({ day: undefined }),
    submission({ day: '330' }),
    submission({ day: 330.5 }),
    submission({ log: undefined }),
    submission({ log: 5 }),
    submission({ nickname: undefined }),
    submission({ nickname: ['anon'] }),
    submission({ version: undefined }),
    submission({ version: '1' }),
    submission({ version: 1.5 }),
  ];
  for (const body of bodies) {
    const store = withAttempt();
    assertEquals(await submitRun(body, USER, at(DAY, NOON), store), refused(400, 'malformed'), JSON.stringify(body));
    assertEquals(store.runs.size, 0);
  }
});

Deno.test('submit-run: another simulation version', async () => {
  for (const version of [SIMULATION_VERSION - 1, SIMULATION_VERSION + 1]) {
    const store = withAttempt();
    assertEquals(
      await submitRun(submission({ version }), USER, at(DAY, NOON), store),
      refused(409, 'versionMismatch', { version: SIMULATION_VERSION }),
    );
    assertEquals(store.runs.size, 0);
  }
});

Deno.test('submit-run: the nickname rule, not normalised for the caller', async () => {
  for (const nickname of ['', 'ab', ' anon', 'anon ', 'an  on', 'abcdefghijklm', 'an@n', 'anön']) {
    const store = withAttempt();
    assertEquals(await submitRun(submission({ nickname }), USER, at(DAY, NOON), store), refused(422, 'invalidNickname'));
    assertEquals(store.runs.size, 0);
  }
  for (const nickname of ['abc', 'abcdefghijkl', 'an on', 'Car 42']) {
    const store = withAttempt();
    assertEquals((await submitRun(submission({ nickname }), USER, at(DAY, NOON), store)).body.status, 'stored');
  }
});

Deno.test('submit-run: the day by the server clock', async () => {
  const cases: [number, number, string | null][] = [
    [DAY, at(DAY, 0), null],
    [DAY, at(DAY + 1, 0), null],
    [DAY, at(DAY + 1, LAST_MS), null],
    [DAY, at(DAY + 2, 0), 'tooLate'],
    [DAY, at(DAY + 2, NOON), 'tooLate'],
    [DAY, at(DAY - 1, LAST_MS), 'dayNotOpen'],
  ];
  for (const [day, now, error] of cases) {
    const store = withAttempt(day);
    const reply = await submitRun(submission({ day }), USER, now, store);
    assertEquals(reply, error ? refused(409, error) : { code: 200, body: { status: 'stored', ticks: driven.ticks } });
    assertEquals(store.runs.size, error ? 0 : 1);
  }
});

Deno.test('submit-run: no attempt for the day', async () => {
  const store = withAttempt(DAY, OTHER);
  store.attempts.add(`${USER}/${DAY - 1}`);
  assertEquals(await submitRun(submission(), USER, at(DAY, NOON), store), refused(409, 'noAttempt'));
  assertEquals(store.runs.size, 0);
});

Deno.test('submit-run: a stored run is answered without looking at the log', async () => {
  const store = withAttempt();
  store.runs.set(`${USER}/${DAY}`, { userId: USER, day: DAY, ticks: 4321, nickname: 'first', version: 1, log: 'AQ' });
  assertEquals(await submitRun(submission({ log: 'not a log!' }), USER, at(DAY, NOON), store), {
    code: 200,
    body: { status: 'alreadyStored', ticks: 4321 },
  });
  assertEquals(store.runs.get(`${USER}/${DAY}`)?.nickname, 'first');
});

Deno.test('submit-run: logs that do not decode', async () => {
  const cases: [string, string][] = [
    ['', 'empty'],
    ['not base64!', 'text'],
    ['AA', 'version'],
    [driven.text.slice(0, -3), 'truncated'],
  ];
  for (const [log, fault] of cases) {
    const store = withAttempt();
    assertEquals(await submitRun(submission({ log }), USER, at(DAY, NOON), store), refused(422, 'badLog', { fault }));
    assertEquals(store.runs.size, 0);
  }
});

Deno.test('submit-run: a log that does not end on the finish', async () => {
  const cases: [Uint8Array, string][] = [
    [driven.log.slice(0, driven.log.length - 1), 'logEnded'],
    [driven.log.slice(0, 100), 'logEnded'],
    [new Uint8Array([...driven.log, driven.log[driven.log.length - 1]]), 'inputsAfterFinish'],
  ];
  for (const [log, reason] of cases) {
    const store = withAttempt();
    assertEquals(
      await submitRun(submission({ log: encodeLogText(log) }), USER, at(DAY, NOON), store),
      refused(422, reason),
    );
    assertEquals(store.runs.size, 0);
  }
});

Deno.test('submit-run: a finished run is stored with the ticks of the replay', async () => {
  const store = withAttempt();
  assertEquals(await submitRun(submission({ nickname: 'Racer 1' }), USER, at(DAY, NOON), store), {
    code: 200,
    body: { status: 'stored', ticks: driven.ticks },
  });
  assertEquals(store.runs.get(`${USER}/${DAY}`), {
    userId: USER,
    day: DAY,
    ticks: driven.ticks,
    nickname: 'Racer 1',
    version: SIMULATION_VERSION,
    log: driven.text,
  });
  assertEquals(await submitRun(submission(), USER, at(DAY, NOON), store), {
    code: 200,
    body: { status: 'alreadyStored', ticks: driven.ticks },
  });
});

Deno.test('submit-run: a run stored by a racing submit wins', async () => {
  const store = withAttempt();
  store.racedTicks = 5555;
  assertEquals(await submitRun(submission(), USER, at(DAY, NOON), store), {
    code: 200,
    body: { status: 'alreadyStored', ticks: 5555 },
  });
});

Deno.test('submit-run: the cheaper check answers first', async () => {
  const late = at(DAY + 2, NOON);
  const cases: [Record<string, unknown>, number, FakeStore, string][] = [
    [{ version: 99, nickname: 'x', log: '' }, late, new FakeStore(), 'versionMismatch'],
    [{ nickname: 'x', log: '' }, late, new FakeStore(), 'invalidNickname'],
    [{ log: '' }, late, new FakeStore(), 'tooLate'],
    [{ log: '' }, at(DAY, NOON), new FakeStore(), 'noAttempt'],
    [{ log: '' }, at(DAY, NOON), withAttempt(), 'badLog'],
  ];
  for (const [overrides, now, store, error] of cases) {
    assertEquals((await submitRun(submission(overrides), USER, now, store)).body.error, error);
  }
});
