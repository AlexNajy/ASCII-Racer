import { describe, expect, it } from 'vitest';
import { encodeLogText } from '../game/inputLog.ts';
import { SIMULATION_VERSION } from '../game/version.ts';
import {
  attemptDone,
  backendConfig,
  createDailyBackend,
  DailyBackend,
  ResultsBoard,
  RESULTS_REFRESH_MS,
  RETRY_DELAYS_MS,
  runNickname,
  submitOutcome,
  withDeadline,
  type DailyBackendDeps,
  type FunctionName,
  type Reply,
} from './dailyBackend.ts';
import { didNotFinishRecord, finishedRecord, mergeForStore, startedRecord, type DailyRecord } from './dailyRecord.ts';

const DAY = 330;
const LOG = encodeLogText(new Uint8Array([4, 4, 4, 5, 5, 1]));
const FINISHED = finishedRecord(DAY, 6, LOG);
const ENV = { VITE_SUPABASE_URL: 'https://example.supabase.co/', VITE_SUPABASE_KEY: 'sb_publishable_x' };

const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body });
const refused = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });
const STORED = ok({ status: 'stored', ticks: 6 });
const STARTED = ok({ status: 'started' });

type Answer = Reply | 'offline';

// A backend with fakes: answers per function in order (the last one repeats), a timer that runs only when told,
// a record kept as storage would keep it.
function harness(
  options: {
    record?: DailyRecord | null;
    answers?: Partial<Record<FunctionName, Answer[]>>;
    tokens?: (string | null)[];
    token?: (call: number) => Promise<string | null>;
    nickname?: string;
  } = {},
) {
  let stored: DailyRecord | null = options.record === undefined ? FINISHED : options.record;
  const calls: { name: FunctionName; body: Record<string, unknown>; token: string }[] = [];
  const answers = { 'start-attempt': [STARTED], 'submit-run': [STORED], ...options.answers };
  const timers: { callback: () => void; ms: number; cancelled: boolean }[] = [];
  const tokens = options.tokens ?? ['token-1'];
  let signIns = 0;
  let refreshes = 0;
  const logs: string[] = [];
  const deps: DailyBackendDeps = {
    transport: {
      async post(name, body, token) {
        calls.push({ name, body, token });
        const queue = answers[name]!;
        const answer = queue.length > 1 ? queue.shift()! : queue[0];
        if (answer === 'offline') throw new TypeError('Failed to fetch');
        return answer;
      },
    },
    auth: {
      async token() {
        const call = signIns++;
        return options.token ? options.token(call) : tokens[Math.min(call, tokens.length - 1)];
      },
      async refresh() {
        refreshes++;
        return `fresh-${refreshes}`;
      },
    },
    timer: {
      set(callback, ms) {
        const timer = { callback, ms, cancelled: false };
        timers.push(timer);
        return () => (timer.cancelled = true);
      },
    },
    record: () => stored,
    write: (record) => (stored = mergeForStore(stored, record, DAY)),
    nickname: () => options.nickname ?? 'racer one',
    log: (message) => logs.push(message),
  };
  const backend = new DailyBackend(deps);
  return {
    backend,
    calls,
    timers,
    logs,
    record: () => stored,
    setRecord: (record: DailyRecord | null) => (stored = record),
    signIns: () => signIns,
    refreshes: () => refreshes,
    names: () => calls.map(({ name }) => name),
    // Runs the next pending timer, if any, and lets everything it started finish.
    async tick() {
      const next = timers.find(({ cancelled }) => !cancelled);
      if (!next) return null;
      next.cancelled = true;
      next.callback();
      await settle();
      return next.ms;
    },
  };
}

async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('backend configuration', () => {
  it('needs an address and a key, and a load that may store the try', () => {
    expect(backendConfig(ENV, true)).toEqual({ url: 'https://example.supabase.co', key: 'sb_publishable_x' });
    expect(backendConfig({}, true)).toBeNull();
    expect(backendConfig({ VITE_SUPABASE_URL: ENV.VITE_SUPABASE_URL }, true)).toBeNull();
    expect(backendConfig({ VITE_SUPABASE_KEY: ENV.VITE_SUPABASE_KEY }, true)).toBeNull();
    expect(backendConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_KEY: '' }, true)).toBeNull();
    expect(backendConfig({ ...ENV, VITE_SUPABASE_URL: 'example.supabase.co' }, true)).toBeNull();
    expect(backendConfig(ENV, false)).toBeNull();
  });

  it('makes nothing at all without one, so nothing can be sent', () => {
    let made = 0;
    const make = () => {
      made++;
      return harness().backend['deps'];
    };
    expect(createDailyBackend(backendConfig({}, true), make)).toBeNull();
    expect(createDailyBackend(backendConfig(ENV, false), make)).toBeNull();
    expect(made).toBe(0);
    expect(createDailyBackend(backendConfig(ENV, true), make)).toBeInstanceOf(DailyBackend);
    expect(made).toBe(1);
  });
});

describe("the server's answers", () => {
  it('maps every answer of submit-run', () => {
    const stored = (ticks: number) => ({ final: { status: 'stored', ticks } });
    const final = (reason: string) => ({ final: { status: 'refused', reason } });
    const cases: [Reply, unknown][] = [
      [ok({ status: 'stored', ticks: 6 }), stored(6)],
      [ok({ status: 'alreadyStored', ticks: 9 }), stored(9)],
      [refused(409, 'versionMismatch', { version: 2 }), final('versionMismatch')],
      [refused(409, 'tooLate'), final('tooLate')],
      [refused(409, 'noAttempt'), final('noAttempt')],
      [refused(409, 'dayNotOpen'), { retry: 'dayNotOpen' }],
      [refused(422, 'invalidNickname'), final('invalidNickname')],
      [refused(422, 'badLog', { fault: 'truncated' }), final('badLog')],
      [refused(422, 'logEnded'), final('logEnded')],
      [refused(422, 'inputsAfterFinish'), final('inputsAfterFinish')],
      [refused(400, 'malformed'), final('malformed')],
      [refused(413, 'bodyTooLarge'), final('bodyTooLarge')],
      [refused(401, 'unauthorized'), { retry: 'unauthorized' }],
      [refused(500, 'internal'), { retry: 'internal' }],
      [refused(503, 'authUnavailable'), { retry: 'authUnavailable' }],
      [{ status: 502, body: null }, { retry: 'status 502' }],
      [ok({ status: 'stored' }), { retry: 'bad answer' }],
      [ok({ status: 'stored', ticks: -1 }), { retry: 'bad answer' }],
      [ok({}), { retry: 'status 200' }],
      [refused(500, 'tooLate'), { retry: 'tooLate' }],
    ];
    for (const [reply, outcome] of cases) expect(submitOutcome(reply), JSON.stringify(reply)).toEqual(outcome);
  });

  it('counts start-attempt as done unless no answer it can act on came back', () => {
    expect(attemptDone(ok({ status: 'started' }))).toBe(true);
    expect(attemptDone(ok({ status: 'alreadyStarted' }))).toBe(true);
    expect(attemptDone(refused(409, 'dayOver'))).toBe(true);
    expect(attemptDone(refused(409, 'dayNotOpen'))).toBe(false); // this clock ahead of the server's: not yet
    expect(attemptDone(refused(400, 'malformed'))).toBe(true);
    expect(attemptDone(refused(401, 'unauthorized'))).toBe(false);
    expect(attemptDone(refused(500, 'internal'))).toBe(false);
    expect(attemptDone(refused(503, 'authUnavailable'))).toBe(false);
  });

  it('sends the nickname of the settings, or the default when it is not a valid one', () => {
    expect(runNickname('racer one')).toBe('racer one');
    for (const name of ['', 'ab', ' racer', 'a  b c', 'x'.repeat(13), 'räcer']) expect(runNickname(name)).toBe('anon');
  });
});

describe('deadlines', () => {
  it('gives the fallback when the promise never settles, or rejects, and the value when it comes in time', async () => {
    const h = harness();
    const never = withDeadline(new Promise<string | null>(() => {}), 1000, null, h.backend['deps'].timer);
    expect(h.timers).toHaveLength(1);
    expect(await h.tick()).toBe(1000);
    expect(await never).toBeNull();
    expect(await withDeadline(Promise.reject(new Error('late')), 1000, null, h.backend['deps'].timer)).toBeNull();
    expect(await withDeadline(Promise.resolve('token'), 1000, null, h.backend['deps'].timer)).toBe('token');
    expect(h.timers.every(({ cancelled }) => cancelled)).toBe(true);
  });
});

describe('sending the daily run', () => {
  it('starts the attempt at the countdown and sends the finish once, with the stored log', async () => {
    const h = harness({ record: startedRecord(DAY) });
    h.backend.startAttempt(DAY);
    await settle();
    expect(h.calls).toEqual([{ name: 'start-attempt', body: { day: DAY }, token: 'token-1' }]);
    h.setRecord(FINISHED);
    h.backend.finished();
    expect(h.backend.status(FINISHED, DAY)).toBe('sending');
    await settle();
    expect(h.calls[1]).toEqual({ name: 'submit-run', body: { day: DAY, log: LOG, nickname: 'racer one', version: SIMULATION_VERSION }, token: 'token-1' });
    expect(h.calls).toHaveLength(2);
    expect(h.record()?.sent).toEqual({ status: 'stored', ticks: 6 });
    expect(h.backend.status(h.record(), DAY)).toBe('stored');
    h.backend.open();
    await settle();
    expect(h.calls).toHaveLength(2);
  });

  it('starts the attempt again before the run when it did not get through at the countdown', async () => {
    const h = harness({ record: startedRecord(DAY), answers: { 'start-attempt': ['offline', STARTED] } });
    h.backend.startAttempt(DAY);
    await settle();
    h.setRecord(FINISHED);
    h.backend.finished();
    await settle();
    expect(h.names()).toEqual(['start-attempt', 'start-attempt', 'submit-run']);
    expect(h.record()?.sent).toEqual({ status: 'stored', ticks: 6 });
  });

  it('sends a run on the day after when the attempt can no longer start, and the server decides', async () => {
    const h = harness({ answers: { 'start-attempt': [refused(409, 'dayOver')], 'submit-run': [STORED] } });
    h.backend.open();
    await settle();
    expect(h.names()).toEqual(['start-attempt', 'submit-run']);
    expect(h.record()?.sent?.status).toBe('stored');
    const late = harness({ answers: { 'start-attempt': [refused(409, 'dayOver')], 'submit-run': [refused(409, 'noAttempt')] } });
    late.backend.open();
    await settle();
    expect(late.record()?.sent).toEqual({ status: 'refused', reason: 'noAttempt' });
    expect(late.timers).toHaveLength(0);
  });

  it('refreshes the session once when the server says unauthorized', async () => {
    const h = harness({ answers: { 'submit-run': [refused(401, 'unauthorized'), STORED] } });
    h.backend.open();
    await settle();
    expect(h.calls.map(({ name, token }) => `${name} ${token}`)).toEqual(['start-attempt token-1', 'submit-run token-1', 'submit-run fresh-1']);
    expect(h.refreshes()).toBe(1);
    expect(h.record()?.sent?.status).toBe('stored');

    const twice = harness({ answers: { 'submit-run': [refused(401, 'unauthorized')] } });
    twice.backend.open();
    await settle();
    expect(twice.names()).toEqual(['start-attempt', 'submit-run', 'submit-run']);
    expect(twice.refreshes()).toBe(1);
    expect(twice.record()?.sent).toBeNull();
    expect(twice.timers).toHaveLength(1); // temporary: tried again later
  });

  it('tries again with growing waits while the daily is open, then waits for the next open', async () => {
    const h = harness({ answers: { 'start-attempt': ['offline'] } });
    h.backend.open();
    await settle();
    const waits: number[] = [];
    for (let ms = await h.tick(); ms !== null; ms = await h.tick()) {
      waits.push(ms);
      if (waits.length < RETRY_DELAYS_MS.length) expect(h.backend.status(h.record(), DAY)).toBe('sending');
    }
    expect(waits).toEqual(RETRY_DELAYS_MS);
    expect(h.calls).toHaveLength(RETRY_DELAYS_MS.length + 1);
    expect(h.backend.status(h.record(), DAY)).toBe('unavailable');
    expect(h.record()?.sent).toBeNull();
    h.backend.open();
    await settle();
    expect(h.calls).toHaveLength(RETRY_DELAYS_MS.length + 2);
    expect(h.backend.status(h.record(), DAY)).toBe('sending');
  });

  it('keeps one series of retries from the finish through the results opening', async () => {
    const h = harness({ answers: { 'submit-run': ['offline'] } });
    h.backend.finished();
    await settle();
    await h.tick();
    h.backend.open();
    await settle();
    while ((await h.tick()) !== null);
    expect(h.names().filter((name) => name === 'submit-run')).toHaveLength(RETRY_DELAYS_MS.length + 1);
  });

  for (const [what, answer] of [
    ['a server error', refused(500, 'internal')],
    ['auth unavailable', refused(503, 'authUnavailable')],
    ['no answer', 'offline'],
  ] as const) {
    it(`retries after ${what}, and stores once it gets through`, async () => {
      const h = harness({ answers: { 'submit-run': [answer, STORED] } });
      h.backend.open();
      await settle();
      expect(h.record()?.sent).toBeNull();
      expect(await h.tick()).toBe(RETRY_DELAYS_MS[0]);
      expect(h.names()).toEqual(['start-attempt', 'submit-run', 'submit-run']);
      expect(h.record()?.sent?.status).toBe('stored');
    });
  }

  it('retries when signing in failed, without sending anything', async () => {
    const h = harness({ tokens: [null, 'token-2'] });
    h.backend.open();
    await settle();
    expect(h.calls).toHaveLength(0);
    await h.tick();
    expect(h.calls.map(({ token }) => token)).toEqual(['token-2', 'token-2']);
  });

  it('stops trying when the daily is left', async () => {
    const h = harness({ answers: { 'submit-run': ['offline'] } });
    h.backend.open();
    await settle();
    expect(h.timers).toHaveLength(1);
    h.backend.close();
    expect(await h.tick()).toBeNull();
    expect(h.backend.status(h.record(), DAY)).toBe('unavailable');
  });

  it('keeps a refusal for good and never sends again', async () => {
    for (const error of ['versionMismatch', 'tooLate', 'badLog', 'logEnded', 'inputsAfterFinish', 'invalidNickname']) {
      const h = harness({ answers: { 'submit-run': [refused(error === 'versionMismatch' || error === 'tooLate' ? 409 : 422, error)] } });
      h.backend.open();
      await settle();
      expect(h.record()?.sent).toEqual({ status: 'refused', reason: error });
      expect(h.timers).toHaveLength(0);
      expect(h.backend.status(h.record(), DAY)).toBe(error === 'versionMismatch' ? 'updateNeeded' : 'unavailable');
      h.backend.open();
      await settle();
      expect(h.calls).toHaveLength(2);
    }
  });

  it("shows and keeps the server's time when it differs, and says so", async () => {
    const h = harness({ answers: { 'submit-run': [ok({ status: 'stored', ticks: 7 })] } });
    h.backend.open();
    await settle();
    expect(h.record()?.sent).toEqual({ status: 'stored', ticks: 7 });
    expect(h.logs.some((line) => line.includes('7 ticks'))).toBe(true);
    expect(h.logs.join('\n')).not.toContain(LOG);
    expect(h.logs.join('\n')).not.toContain('token');
  });

  it('counts a run already stored (by another tab) as stored', async () => {
    const h = harness({ answers: { 'submit-run': [ok({ status: 'alreadyStored', ticks: 6 })] } });
    h.backend.open();
    await settle();
    expect(h.record()?.sent).toEqual({ status: 'stored', ticks: 6 });
  });

  it('sends nothing when another tab already has the answer in storage', async () => {
    const h = harness({ record: { ...FINISHED, sent: { status: 'stored', ticks: 6 } } });
    h.backend.open();
    await settle();
    expect(h.calls).toHaveLength(0);
    expect(h.signIns()).toBe(1); // opening the daily still signs in
    expect(h.backend.status(h.record(), DAY)).toBe('stored');
  });

  it('only signs in when there is nothing to send', async () => {
    for (const record of [null, startedRecord(DAY), didNotFinishRecord(DAY), { ...FINISHED, log: null }, { ...FINISHED, version: null }]) {
      const h = harness({ record });
      h.backend.open();
      await settle();
      expect(h.calls).toHaveLength(0);
      expect(h.signIns()).toBe(1);
      expect(h.backend.status(h.record(), DAY)).toBe('unavailable');
    }
  });

  it('refuses a run driven with an older simulation version without sending it', async () => {
    const h = harness({ record: { ...FINISHED, version: SIMULATION_VERSION - 1 } });
    h.backend.open();
    await settle();
    expect(h.calls).toHaveLength(0);
    expect(h.record()?.sent).toEqual({ status: 'refused', reason: 'oldVersion' });
  });

  it('leaves a run of a newer simulation version alone, for a newer page to send', async () => {
    const newer = { ...FINISHED, version: SIMULATION_VERSION + 1 };
    const h = harness({ record: newer });
    h.backend.open();
    await settle();
    expect(h.calls).toHaveLength(0);
    expect(h.signIns()).toBe(0);
    expect(h.record()).toBe(newer);
    expect(h.timers).toHaveLength(0);
    expect(h.backend.status(h.record(), DAY)).toBe('unavailable');
  });

  it('starts the attempt again before the run when the day was not open yet at the countdown', async () => {
    const h = harness({ record: startedRecord(DAY), answers: { 'start-attempt': [refused(409, 'dayNotOpen'), STARTED] } });
    h.backend.startAttempt(DAY);
    await settle();
    h.setRecord(FINISHED);
    h.backend.finished();
    await settle();
    expect(h.names()).toEqual(['start-attempt', 'start-attempt', 'submit-run']);
    expect(h.record()?.sent).toEqual({ status: 'stored', ticks: 6 });
  });

  it('tries again when a sign-in gave up late, and sends once it works', async () => {
    let giveUp: (token: string | null) => void = () => {};
    const h = harness({ token: (call) => (call === 0 ? new Promise((resolve) => (giveUp = resolve)) : Promise.resolve('token-2')) });
    h.backend.open();
    await settle();
    expect(h.calls).toHaveLength(0);
    expect(h.backend.status(h.record(), DAY)).toBe('sending'); // the sign-in is still on its way
    giveUp(null); // the deadline of the browser's sign-in
    await settle();
    expect(h.backend.status(h.record(), DAY)).toBe('sending'); // a retry is waiting
    expect(await h.tick()).toBe(RETRY_DELAYS_MS[0]);
    expect(h.calls.map(({ name, token }) => `${name} ${token}`)).toEqual(['start-attempt token-2', 'submit-run token-2']);
    expect(h.record()?.sent?.status).toBe('stored');
  });

  it('stops saying sending once the retries of a failing sign-in are spent', async () => {
    const h = harness({ token: () => Promise.reject(new Error('timed out')) });
    h.backend.open();
    await settle();
    while ((await h.tick()) !== null) expect(h.calls).toHaveLength(0);
    expect(h.signIns()).toBe(RETRY_DELAYS_MS.length + 1);
    expect(h.backend.status(h.record(), DAY)).toBe('unavailable');
    expect(h.record()?.sent).toBeNull();
  });

  it("sends a day's run that finished while the day before's was on its way", async () => {
    const yesterday = finishedRecord(DAY - 1, 9, LOG);
    let answer: (reply: Reply) => void = () => {};
    const h = harness({ record: yesterday });
    h.backend['deps'].transport.post = async (name, body, token) => {
      h.calls.push({ name, body, token });
      if (name === 'start-attempt') return STARTED;
      if (body.day === DAY - 1) return new Promise((resolve) => (answer = resolve));
      return STORED;
    };
    h.backend.open();
    await settle();
    expect(h.backend.status(yesterday, DAY - 1)).toBe('sending');
    h.setRecord(FINISHED);
    h.backend.finished();
    expect(h.backend.status(FINISHED, DAY)).toBe('unavailable'); // the request on its way is yesterday's
    answer(refused(409, 'tooLate'));
    await settle();
    expect(h.calls.filter(({ name }) => name === 'submit-run').map(({ body }) => body.day)).toEqual([DAY - 1, DAY]);
    expect(h.record()?.sent).toEqual({ status: 'stored', ticks: 6 });
  });

  it("sends a new run at once instead of waiting for another run's retry", async () => {
    const yesterday = finishedRecord(DAY - 1, 9, LOG);
    const h = harness({ record: yesterday, answers: { 'submit-run': ['offline', STORED] } });
    h.backend.open();
    await settle();
    expect(h.backend.status(yesterday, DAY - 1)).toBe('sending');
    h.setRecord(FINISHED);
    h.backend.finished();
    expect(h.backend.status(FINISHED, DAY)).toBe('sending');
    await settle();
    expect(h.record()?.sent).toEqual({ status: 'stored', ticks: 6 });
    expect(await h.tick()).toBeNull();
  });

  it('sends the default nickname when the settings hold no valid one', async () => {
    const h = harness({ nickname: 'x' });
    h.backend.open();
    await settle();
    expect(h.calls[1].body.nickname).toBe('anon');
  });

  it('says what the status line shows', () => {
    const { backend } = harness();
    expect(backend.status(null, DAY)).toBe('unavailable');
    expect(backend.status(didNotFinishRecord(DAY), DAY)).toBe('unavailable');
    expect(backend.status({ ...FINISHED, sent: { status: 'stored', ticks: 6 } }, DAY + 1)).toBe('unavailable');
    expect(backend.status({ ...FINISHED, sent: { status: 'stored', ticks: 6 } }, DAY)).toBe('stored');
    expect(backend.status({ ...FINISHED, sent: { status: 'refused', reason: 'versionMismatch' } }, DAY)).toBe('updateNeeded');
    expect(backend.status({ ...FINISHED, sent: { status: 'refused', reason: 'tooLate' } }, DAY)).toBe('unavailable');
    expect(backend.status(FINISHED, DAY)).toBe('unavailable'); // nothing on its way
  });
});

// A day's board as daily_results answers it: `count` runs, the caller's of `ownTicks` among them when given.
function answer(count: number, ownTicks: number | null = null): Record<string, unknown> {
  const times = Array.from({ length: count }, (_, i) => 4000 + 60 * i);
  if (ownTicks !== null) times[count - 1] = ownTicks;
  times.sort((a, b) => a - b);
  const from = times[0];
  const to = Math.max(times[Math.ceil((95 * count) / 100) - 1], from + 48);
  const counts = new Array<number>(48).fill(0);
  for (const t of times) counts[Math.min(47, Math.floor(((t - from) * 48) / (to - from)))]++;
  const rank = (t: number) => 1 + times.filter((other) => other < t).length;
  let ownShown = false;
  return {
    count,
    own: ownTicks === null ? null : { ticks: ownTicks, rank: rank(ownTicks), slower: times.filter((t) => t > ownTicks).length },
    top: times.slice(0, 10).map((t) => {
      const own = t === ownTicks && !ownShown;
      ownShown ||= own;
      return { rank: rank(t), nickname: own ? 'racer one' : 'someone', ticks: t, own };
    }),
    histogram: count === 0 ? null : { from, to, counts },
  };
}

// A board with fakes: each fetch waits until answered by hand, a timer that runs only when told.
function boardHarness() {
  const requests: { day: number; resolve: (value: unknown) => void; reject: (error: unknown) => void }[] = [];
  const timers: { callback: () => void; ms: number; cancelled: boolean }[] = [];
  let changes = 0;
  const board = new ResultsBoard({
    fetch: (day) => new Promise((resolve, reject) => requests.push({ day, resolve, reject })),
    timer: {
      set(callback, ms) {
        const timer = { callback, ms, cancelled: false };
        timers.push(timer);
        return () => (timer.cancelled = true);
      },
    },
    changed: () => changes++,
  });
  return {
    board,
    requests,
    changes: () => changes,
    pending: () => timers.filter(({ cancelled }) => !cancelled),
    async answer(index: number, value: unknown) {
      requests[index].resolve(value);
      await settle();
    },
    async fail(index: number) {
      requests[index].reject(new TypeError('Failed to fetch'));
      await settle();
    },
    async tick() {
      const next = timers.find(({ cancelled }) => !cancelled)!;
      next.cancelled = true;
      next.callback();
      await settle();
      return next.ms;
    },
  };
}

describe("the results screen's board", () => {
  it('fetches on opening, shows the answer and refreshes every minute while open', async () => {
    const h = boardHarness();
    h.board.show(DAY);
    h.board.show(DAY);
    expect(h.requests.map(({ day }) => day)).toEqual([DAY]);
    expect(h.board.results(DAY)).toBeNull();
    await h.answer(0, answer(30, 4100));
    expect(h.board.results(DAY)?.own?.ticks).toBe(4100);
    expect(h.board.results(DAY - 1)).toBeNull();
    expect(h.changes()).toBe(1);
    expect(await h.tick()).toBe(RESULTS_REFRESH_MS);
    expect(h.requests).toHaveLength(2);
    await h.answer(1, answer(31, 4100));
    expect(h.board.results(DAY)?.count).toBe(31);
    expect(h.changes()).toBe(2);
    expect(h.pending()).toHaveLength(1);
  });

  it('redraws nothing when a refresh brings the same board', async () => {
    const h = boardHarness();
    h.board.show(DAY);
    await h.answer(0, answer(30, 4100));
    await h.tick();
    await h.answer(1, answer(30, 4100));
    expect(h.changes()).toBe(1);
  });

  it('fetches again as soon as the run is stored, so the rank shows', async () => {
    const h = boardHarness();
    h.board.show(DAY);
    await h.answer(0, answer(30));
    expect(h.board.results(DAY)?.own).toBeNull();
    h.board.stored(DAY - 1);
    expect(h.requests).toHaveLength(1);
    h.board.stored(DAY);
    expect(h.requests).toHaveLength(2);
    await h.answer(1, answer(31, 4100));
    expect(h.board.results(DAY)?.own?.rank).toBe(3);
    expect(h.pending()).toHaveLength(1); // the refresh starts over, one at a time
  });

  it('stops on leaving and drops an answer that comes in after', async () => {
    const h = boardHarness();
    h.board.show(DAY);
    h.board.hide();
    expect(h.pending()).toHaveLength(0);
    await h.answer(0, answer(30, 4100));
    expect(h.board.results(DAY)).toBeNull();
    expect(h.changes()).toBe(0);
    h.board.stored(DAY);
    expect(h.requests).toHaveLength(1);
  });

  it('drops an answer to a request made before leaving, even when the same day is open again', async () => {
    const h = boardHarness();
    h.board.show(DAY);
    h.board.hide();
    h.board.show(DAY);
    await h.answer(0, answer(30, 4100));
    expect(h.board.results(DAY)).toBeNull();
    await h.answer(1, answer(31, 4100));
    expect(h.board.results(DAY)?.count).toBe(31);
  });

  it("drops a late answer for another day, and an older answer after a newer one", async () => {
    const h = boardHarness();
    h.board.show(DAY);
    h.board.show(DAY + 1);
    await h.answer(0, answer(30, 4100));
    expect(h.board.results(DAY)).toBeNull();
    expect(h.board.results(DAY + 1)).toBeNull();
    h.board.stored(DAY + 1);
    await h.answer(2, answer(40, 4100));
    await h.answer(1, answer(35));
    expect(h.board.results(DAY + 1)?.count).toBe(40);
  });

  it('keeps the board shown when a refresh fails or answers null or nonsense, and tries again at the next refresh', async () => {
    const h = boardHarness();
    h.board.show(DAY);
    await h.fail(0);
    expect(h.board.results(DAY)).toBeNull();
    expect(h.pending()).toHaveLength(1);
    await h.tick();
    await h.answer(1, answer(30, 4100));
    for (const [index, bad] of [null, { count: 'many' }, undefined].entries()) {
      await h.tick();
      await h.answer(2 + index, bad);
      expect(h.board.results(DAY)?.count).toBe(30);
    }
    await h.tick();
    await h.fail(5);
    expect(h.board.results(DAY)?.count).toBe(30);
    expect(h.changes()).toBe(1);
    expect(h.pending()).toHaveLength(1);
  });

  it("shows the last day's board again on reopening while fetching anew, and forgets it for another day", async () => {
    const h = boardHarness();
    h.board.show(DAY);
    await h.answer(0, answer(30, 4100));
    h.board.hide();
    h.board.show(DAY);
    expect(h.board.results(DAY)?.count).toBe(30);
    expect(h.requests).toHaveLength(2);
    h.board.hide();
    h.board.show(DAY + 1);
    expect(h.board.results(DAY)).toBeNull();
    expect(h.changes()).toBe(2);
  });

  it('fetches nothing without a backend or on a load that keeps the try in memory', () => {
    expect(backendConfig({}, true)).toBeNull();
    expect(backendConfig(ENV, false)).toBeNull();
  });
});
