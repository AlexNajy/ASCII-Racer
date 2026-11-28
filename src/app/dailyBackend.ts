import { SIMULATION_VERSION } from '../game/version.ts';
import type { DailyRecord, DailySent } from './dailyRecord.ts';
import { parseDailyResults, type DailyResults } from './dailyResults.ts';
import { validNickname } from './nickname.ts';
import { DEFAULT_PLAYER_SETTINGS } from './settings.ts';

// The daily's side of the server: start the attempt when the countdown starts, send the finished run, remember what
// the server made of it in the stored try. Pure: the network, the sign-in and the timers are given, so nothing here
// knows the browser, and nothing waits on it: the game never blocks on the network.

export interface BackendConfig {
  url: string; // the project's address, without a trailing slash
  key: string; // its publishable (or legacy anon) key, public by design
}

export interface BackendEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_KEY?: string;
}

// Null, so nothing is ever sent, when the build has no backend or the page load keeps the daily's try in memory only
// (dev URL states, shots): such a load must never sign in or send a run.
export function backendConfig(env: BackendEnv, dailyStorage: boolean): BackendConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = env.VITE_SUPABASE_KEY?.trim();
  if (!dailyStorage || !url || !key || !/^https?:\/\//.test(url)) return null;
  return { url, key };
}

export type FunctionName = 'start-attempt' | 'submit-run';

export interface Reply {
  status: number;
  body: unknown; // the JSON answer, null when there was none
}

// Rejects when no answer came back: no network, a timeout, a killed function.
export interface Transport {
  post(name: FunctionName, body: Record<string, unknown>, token: string): Promise<Reply>;
}

// Both settle in bounded time (withDeadline), so a sign-in that never answers can't hold the sending up.
export interface Auth {
  token(): Promise<string | null>; // the session's access token, signing in anonymously when there is none; null on failure
  refresh(): Promise<string | null>; // a fresh token after the server said unauthorized; null on failure
}

export interface Timer {
  set(callback: () => void, ms: number): () => void; // returns its cancel
}

// What the results screen's status line says.
export type LeaderboardStatus = 'unavailable' | 'sending' | 'stored' | 'updateNeeded';

// The waits before each new try after a temporary failure, while the results are open; after the last one the run
// waits for the next time the daily is opened.
export const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 40_000];

// Refusals that sending again can never change.
export const FINAL_REFUSALS = [
  'versionMismatch',
  'tooLate',
  'dayOver',
  'noAttempt',
  'badLog',
  'logEnded',
  'inputsAfterFinish',
  'invalidNickname',
  'malformed',
  'bodyTooLarge',
] as const;

const UNAUTHORIZED = 401;

// The promise's value, or `fallback` once `ms` have passed without one.
export function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T, timer: Timer): Promise<T> {
  return new Promise((resolve) => {
    const cancel = timer.set(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        cancel();
        resolve(value);
      },
      () => {
        cancel();
        resolve(fallback);
      },
    );
  });
}

export function runNickname(nickname: string): string {
  return validNickname(nickname) ? nickname : DEFAULT_PLAYER_SETTINGS.nickname;
}

function errorOf(body: unknown): string | null {
  const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof error === 'string' ? error : null;
}

export type Outcome = { final: DailySent } | { retry: string }; // retry: the reason, for the console

// What an answer to submit-run means. A 401 left after the refresh is temporary: the next try signs in again.
export function submitOutcome(reply: Reply): Outcome {
  const { status, body } = reply;
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (status === 200 && (fields.status === 'stored' || fields.status === 'alreadyStored')) {
    const { ticks } = fields;
    if (typeof ticks === 'number' && Number.isInteger(ticks) && ticks > 0) return { final: { status: 'stored', ticks } };
    return { retry: 'bad answer' };
  }
  const error = errorOf(body);
  const final = FINAL_REFUSALS.find((name) => name === error);
  if (final && status >= 400 && status < 500) return { final: { status: 'refused', reason: final } };
  return { retry: error ?? `status ${status}` };
}

// start-attempt: done when the server answered for good (started, already started, or a refusal that the run's own
// answer will make final); a missing answer, an error of the server, a sign-in left unauthorized and a day not open
// yet (this clock ahead of the server's) are tried again.
export function attemptDone(reply: Reply): boolean {
  if (reply.status === 200) return true;
  return reply.status >= 400 && reply.status < 500 && reply.status !== UNAUTHORIZED && errorOf(reply.body) !== 'dayNotOpen';
}

export interface DailyBackendDeps {
  transport: Transport;
  auth: Auth;
  timer: Timer;
  record(): DailyRecord | null; // the latest known try, memory and storage (another tab may have sent it)
  write(record: DailyRecord): void; // stores it by the record's rules (mergeForStore)
  nickname(): string; // the settings' nickname
  log(message: string): void; // reasons and statuses only, never a token or a log
}

// A finished run with a log that the server has not answered for good yet.
type Sendable = DailyRecord & { log: string; ticks: number; version: number };

function sendable(record: DailyRecord | null): record is Sendable {
  return record !== null && record.status === 'finished' && record.log !== null && record.ticks !== null && record.version !== null && record.sent === null;
}

function sameRun(a: DailyRecord, b: DailyRecord): boolean {
  return a.day === b.day && a.ticks === b.ticks && a.log === b.log;
}

export class DailyBackend {
  private readonly deps: DailyBackendDeps;
  private readonly attempts = new Map<number, Promise<boolean>>(); // per day: whether start-attempt got through
  private sending: Promise<void> | null = null;
  private current: DailyRecord | null = null; // the run being sent, or waiting for its retry
  private tries = 0;
  private cancelRetry: (() => void) | null = null;
  private active = false;

  constructor(deps: DailyBackendDeps) {
    this.deps = deps;
  }

  // The daily is opened (pre-race screen or results): sign in in the background, send a run not sent yet, and keep
  // trying while it stays open.
  open(): void {
    this.active = true;
    if (!this.sending && !this.cancelRetry) this.tries = 0; // a series of retries already running carries on
    if (!sendable(this.deps.record())) void this.deps.auth.token().catch(() => null);
    this.send();
  }

  // The daily is left: no more retries until it is opened again. A request already on its way still finishes.
  close(): void {
    this.active = false;
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  // The countdown started: the try is used, tell the server in the background.
  startAttempt(day: number): void {
    void this.attempt(day);
  }

  // The finishing tick stored the run: send it now.
  finished(): void {
    this.open();
  }

  status(record: DailyRecord | null, day: number): LeaderboardStatus {
    if (!record || record.day !== day || record.status !== 'finished') return 'unavailable';
    if (record.sent?.status === 'stored') return 'stored';
    if (record.sent) return record.sent.reason === 'versionMismatch' ? 'updateNeeded' : 'unavailable';
    const pending = (this.sending || this.cancelRetry) && this.current && sameRun(this.current, record);
    return sendable(record) && pending ? 'sending' : 'unavailable';
  }

  private attempt(day: number): Promise<boolean> {
    const known = this.attempts.get(day);
    if (known) return known;
    const trying = this.authorized((token) => this.deps.transport.post('start-attempt', { day }, token))
      .then((reply) => reply !== null && attemptDone(reply))
      .catch(() => false)
      .then((done) => {
        if (!done) this.attempts.delete(day);
        return done;
      });
    this.attempts.set(day, trying);
    return trying;
  }

  // The request with the session's token, once more with a refreshed one if the server says unauthorized; null
  // without a token. Rejects when no answer came back.
  private async authorized(request: (token: string) => Promise<Reply>): Promise<Reply | null> {
    const token = await this.deps.auth.token();
    if (!token) return null;
    const reply = await request(token);
    if (reply.status !== UNAUTHORIZED) return reply;
    const fresh = await this.deps.auth.refresh();
    return fresh ? request(fresh) : reply;
  }

  private send(): void {
    if (this.sending) return;
    const record = this.deps.record();
    if (this.cancelRetry) {
      if (sendable(record) && this.current && sameRun(this.current, record)) return; // its retry is on the way
      this.cancelRetry();
      this.cancelRetry = null;
    }
    if (!sendable(record)) return;
    // Driven with an older simulation version than this page's: the server, never older than the site, can't take it.
    if (record.version < SIMULATION_VERSION) {
      this.deps.log('daily: run of an older simulation version, not sent');
      this.deps.write({ ...record, sent: { status: 'refused', reason: 'oldVersion' } });
      return;
    }
    if (record.version > SIMULATION_VERSION) {
      this.deps.log('daily: run of a newer simulation version, left for a newer page');
      return;
    }
    if (!this.current || !sameRun(this.current, record)) this.tries = 0;
    this.current = record;
    this.sending = this.sendRun(record)
      .catch(() => undefined)
      .then(() => {
        this.sending = null;
        // Another run came in while this one was on its way (a day's finish while the day before's was sent): send it now.
        const next = this.deps.record();
        if (this.active && sendable(next) && !sameRun(next, record)) this.send();
      });
  }

  private async sendRun(record: Sendable): Promise<void> {
    let outcome: Outcome;
    try {
      if (!(await this.attempt(record.day))) {
        outcome = { retry: 'attempt not started' };
      } else {
        const body = { day: record.day, log: record.log, nickname: runNickname(this.deps.nickname()), version: record.version };
        const reply = await this.authorized((token) => this.deps.transport.post('submit-run', body, token));
        outcome = reply ? submitOutcome(reply) : { retry: 'not signed in' };
      }
    } catch {
      outcome = { retry: 'no answer' };
    }
    if ('final' in outcome) {
      const sent = outcome.final;
      if (sent.status === 'stored' && sent.ticks !== record.ticks) {
        this.deps.log(`daily: the server's time is ${sent.ticks} ticks, this browser's ${record.ticks}; the server's counts`);
      }
      this.deps.log(sent.status === 'stored' ? 'daily: run stored' : `daily: run refused (${sent.reason})`);
      this.deps.write({ ...record, sent });
      return;
    }
    this.tries++;
    this.deps.log(`daily: run not sent (${outcome.retry})`);
    if (!this.active || this.tries > RETRY_DELAYS_MS.length) return;
    this.cancelRetry = this.deps.timer.set(() => {
      this.cancelRetry = null;
      if (this.active) this.send();
    }, RETRY_DELAYS_MS[this.tries - 1]);
  }
}

// Nothing of the backend exists without a configuration: no deps are made, nothing is loaded or sent.
export function createDailyBackend(config: BackendConfig | null, deps: (config: BackendConfig) => DailyBackendDeps): DailyBackend | null {
  return config ? new DailyBackend(deps(config)) : null;
}

// The daily results screen's board: fetched when the screen opens for a day, again as soon as the player's run is
// stored, and every RESULTS_REFRESH_MS while it stays open. A failure or an answer that isn't a board leaves what is
// shown and waits for the next refresh; an answer for another day, after leaving, or older than one already taken is
// dropped. Kept in memory only, the last day's, so reopening that day shows it while fetching again.
export const RESULTS_REFRESH_MS = 60_000;

export interface ResultsBoardDeps {
  fetch(day: number): Promise<unknown>; // the answer of daily_results; rejects (or gives null) when there is none
  timer: Timer;
  changed(): void; // the board shown changed
}

export class ResultsBoard {
  private readonly deps: ResultsBoardDeps;
  private shown: number | null = null; // the day whose screen is open
  private day: number | null = null; // the day of `board`
  private board: DailyResults | null = null;
  private boardText = 'null';
  private sent = 0; // requests made
  private taken = 0; // the request whose answer is shown
  private opened = 0; // times the screen was opened
  private cancelRefresh: (() => void) | null = null;

  constructor(deps: ResultsBoardDeps) {
    this.deps = deps;
  }

  // The results screen is open for `day`; nothing when it already was.
  show(day: number): void {
    if (this.shown === day) return;
    this.hide();
    this.shown = day;
    this.opened++;
    if (this.day !== day) {
      const had = this.board !== null;
      this.day = day;
      this.board = null;
      this.boardText = 'null';
      if (had) this.deps.changed();
    }
    this.request();
  }

  // The screen is left: no more requests, answers still on their way are dropped.
  hide(): void {
    this.shown = null;
    this.cancelRefresh?.();
    this.cancelRefresh = null;
  }

  // The player's run of `day` was stored: its rank is on the board now.
  stored(day: number): void {
    if (this.shown === day) this.request();
  }

  results(day: number): DailyResults | null {
    return this.day === day ? this.board : null;
  }

  private request(): void {
    const day = this.shown;
    if (day === null) return;
    this.cancelRefresh?.();
    this.cancelRefresh = this.deps.timer.set(() => {
      this.cancelRefresh = null;
      this.request();
    }, RESULTS_REFRESH_MS);
    const id = ++this.sent;
    const opened = this.opened;
    this.deps.fetch(day).then(
      (answer) => this.take(day, opened, id, answer),
      () => undefined,
    );
  }

  private take(day: number, opened: number, id: number, answer: unknown): void {
    if (this.shown !== day || this.opened !== opened || id < this.taken) return;
    const board = parseDailyResults(answer);
    if (!board) return;
    this.taken = id;
    const text = JSON.stringify(board);
    if (text === this.boardText) return;
    this.board = board;
    this.boardText = text;
    this.deps.changed();
  }
}
