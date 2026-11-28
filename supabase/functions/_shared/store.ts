import type { Store, StoredRun } from './handlers.ts';

// The Store on the project's database through PostgREST, as the service role.

export function restStore(supabaseUrl: string, serviceKey: string): Store {
  const rest = `${supabaseUrl}/rest/v1`;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${rest}/${path}`, { ...init, headers: { ...headers, ...init.headers } });
    const text = await response.text();
    if (!response.ok) throw new Error(`database: ${path.split('?')[0]} answered ${response.status} ${text}`);
    return JSON.parse(text);
  }

  function rows(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) throw new Error('database: expected rows');
    return value;
  }

  const key = (userId: string, day: number) => `user_id=eq.${encodeURIComponent(userId)}&day=eq.${day}`;

  return {
    async startAttempt(userId, day) {
      const inserted = await call('attempts?on_conflict=user_id,day&select=day', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ user_id: userId, day }),
      });
      return rows(inserted).length === 1;
    },
    async hasAttempt(userId, day) {
      return rows(await call(`attempts?select=day&${key(userId, day)}`)).length === 1;
    },
    async runTicks(userId, day) {
      const [run] = rows(await call(`runs?select=ticks&${key(userId, day)}`));
      return run ? Number(run.ticks) : null;
    },
    async storeRun(run: StoredRun) {
      const [result] = rows(
        await call('rpc/store_run', {
          method: 'POST',
          body: JSON.stringify({
            player: run.userId,
            run_day: run.day,
            run_ticks: run.ticks,
            run_nickname: run.nickname,
            run_version: run.version,
            run_log: run.log,
          }),
        }),
      );
      if (!result || typeof result.stored !== 'boolean') throw new Error('database: store_run gave no result');
      return { stored: result.stored, ticks: Number(result.ticks) };
    },
  };
}
