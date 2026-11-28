import type { SupabaseClient } from '@supabase/supabase-js';
import { withDeadline, type Auth, type BackendConfig, type Timer, type Transport } from './dailyBackend.ts';

// The browser's pieces of the daily backend: the functions over plain fetch with exactly these headers (the functions'
// CORS allows authorization, x-client-info, apikey and content-type), and the anonymous sign-in through supabase-js,
// loaded the first time it is needed, never at startup. The library keeps the session in localStorage and refreshes it.

export const REQUEST_TIMEOUT_MS = 15_000; // every request, the functions' and the library's own
export const AUTH_TIMEOUT_MS = 20_000; // a whole sign-in or refresh, however many requests and retries the library makes

// The library's fetch with a timeout, together with any signal the library passes.
function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const given = init?.signal;
  if (!given) return fetch(input, { ...init, signal: timeout });
  if (typeof AbortSignal.any === 'function') return fetch(input, { ...init, signal: AbortSignal.any([given, timeout]) });
  const both = new AbortController();
  const abort = (signal: AbortSignal) => () => both.abort(signal.reason);
  if (given.aborted) both.abort(given.reason);
  given.addEventListener('abort', abort(given), { once: true });
  timeout.addEventListener('abort', abort(timeout), { once: true });
  return fetch(input, { ...init, signal: both.signal });
}

export interface BrowserBackend {
  transport: Transport;
  auth: Auth;
  timer: Timer;
  client(): Promise<SupabaseClient>; // for reading the leaderboard as the signed-in player
  userId(): Promise<string | null>;
  results(day: number): Promise<unknown>; // daily_results as the signed-in player, null when there was no answer in time
}

export function browserBackend(config: BackendConfig): BrowserBackend {
  let loading: Promise<SupabaseClient> | null = null;
  const client = () => {
    loading ??= import('@supabase/supabase-js')
      .then(({ createClient }) =>
        createClient(config.url, config.key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
          global: { fetch: timedFetch },
        }),
      )
      .catch((error: unknown) => {
        loading = null; // offline when first needed: load it again next time
        throw error;
      });
    return loading;
  };

  const timer: Timer = {
    set(callback, ms) {
      const id = setTimeout(callback, ms);
      return () => clearTimeout(id);
    },
  };

  let signingIn: Promise<string | null> | null = null;
  // A session kept by the library, else a new anonymous sign-in; but never a new identity because reading the
  // kept one failed (offline with an expired token), which would lose the day's attempt. Null after AUTH_TIMEOUT_MS,
  // and the next call starts afresh.
  const token = () => {
    const signIn = async () => {
      const auth = (await client()).auth;
      const { data, error } = await auth.getSession();
      if (error) return null;
      if (data.session) return data.session.access_token;
      const signedIn = await auth.signInAnonymously();
      return signedIn.data.session?.access_token ?? null;
    };
    signingIn ??= withDeadline(signIn(), AUTH_TIMEOUT_MS, null, timer).finally(() => {
      signingIn = null;
    });
    return signingIn;
  };

  const refresh = () => {
    const refreshing = async () => (await (await client()).auth.refreshSession()).data.session?.access_token ?? null;
    return withDeadline(refreshing(), AUTH_TIMEOUT_MS, null, timer);
  };

  const transport: Transport = {
    async post(name, body, accessToken) {
      const response = await fetch(`${config.url}/functions/v1/${name}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, apikey: config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      return { status: response.status, body: json };
    },
  };

  return {
    transport,
    auth: { token, refresh },
    timer,
    client,
    // Bounded as a whole: the sign-in, the library's loading and the call itself.
    results(day) {
      const call = async () => {
        if (!(await token())) return null;
        const { data, error } = await (await client()).rpc('daily_results', { run_day: day });
        return error ? null : (data as unknown);
      };
      return withDeadline<unknown>(call(), AUTH_TIMEOUT_MS + REQUEST_TIMEOUT_MS, null, timer);
    },
    async userId() {
      const { data } = await (await client()).auth.getSession();
      return data.session?.user.id ?? null;
    },
  };
}
