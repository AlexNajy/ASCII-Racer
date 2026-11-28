import { assertEquals } from '@std/assert';
import type { Reply } from '../_shared/handlers.ts';
import { AuthUnavailable, bearerToken, endpoint, readCappedBody, type VerifyUser } from '../_shared/http.ts';

const ENDPOINT = 'http://functions.test/f';
const USER = '00000000-0000-0000-0000-00000000000a';
const TOKEN = 'header.payload.signature';
const MAX_BODY = 100;

interface Calls {
  verified: string[];
  handled: unknown[];
}

function setup(verifyUser: VerifyUser = (token) => Promise.resolve(token === TOKEN ? USER : null), reply?: () => Promise<Reply>) {
  const calls: Calls = { verified: [], handled: [] };
  const handler = endpoint({
    maxBody: MAX_BODY,
    verifyUser: (token) => {
      calls.verified.push(token);
      return verifyUser(token);
    },
    handle: (body, userId, nowMs) => {
      calls.handled.push({ body, userId, nowMs });
      return reply ? reply() : Promise.resolve({ code: 200, body: { status: 'ok' } });
    },
    now: () => 1234,
  });
  return { calls, handler };
}

function post(body: BodyInit | null, headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }): Request {
  return new Request(ENDPOINT, { method: 'POST', body, headers });
}

async function answer(response: Response): Promise<[number, unknown]> {
  return [response.status, await response.json()];
}

Deno.test('preflight: CORS headers, no identity needed', async () => {
  const { calls, handler } = setup();
  const response = await handler(new Request(ENDPOINT, { method: 'OPTIONS' }));
  assertEquals(response.status, 204);
  assertEquals(response.headers.get('access-control-allow-origin'), '*');
  assertEquals(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assertEquals(response.headers.get('access-control-allow-headers'), 'authorization, x-client-info, apikey, content-type');
  assertEquals(calls, { verified: [], handled: [] });
});

Deno.test('only POST', async () => {
  const { calls, handler } = setup();
  for (const method of ['GET', 'PUT', 'DELETE']) {
    assertEquals(await answer(await handler(new Request(ENDPOINT, { method }))), [405, { error: 'methodNotAllowed' }]);
  }
  assertEquals(calls, { verified: [], handled: [] });
});

Deno.test('a body over the cap is refused before anything else', async () => {
  const { calls, handler } = setup();
  assertEquals(await answer(await handler(post('x'.repeat(MAX_BODY + 1)))), [413, { error: 'bodyTooLarge' }]);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 10; i++) controller.enqueue(new Uint8Array(20).fill(32));
      controller.close();
    },
  });
  assertEquals(await answer(await handler(post(stream))), [413, { error: 'bodyTooLarge' }]);
  assertEquals(calls, { verified: [], handled: [] });
});

Deno.test('readCappedBody: up to the cap, declared or streamed', async () => {
  assertEquals(await readCappedBody(post('x'.repeat(MAX_BODY)), MAX_BODY), 'x'.repeat(MAX_BODY));
  assertEquals(await readCappedBody(post(null), MAX_BODY), '');
  const lying = new Request(ENDPOINT, { method: 'POST', body: 'x'.repeat(10), headers: { 'content-length': '1000' } });
  assertEquals(await readCappedBody(lying, MAX_BODY), null);
});

Deno.test('a body that is not JSON', async () => {
  const { calls, handler } = setup();
  assertEquals(await answer(await handler(post('{day: 1'))), [400, { error: 'malformed' }]);
  assertEquals(await answer(await handler(post(''))), [400, { error: 'malformed' }]);
  assertEquals(calls.handled, []);
});

Deno.test('no identity: no or a malformed Authorization header, or a token the auth server refuses', async () => {
  const { calls, handler } = setup();
  const headers: Record<string, string>[] = [
    {},
    { apikey: 'sb_publishable_x' },
    { Authorization: TOKEN },
    { Authorization: 'Bearer' },
    { Authorization: 'Bearer ' },
    { Authorization: `Basic ${TOKEN}` },
    { Authorization: `Bearer ${TOKEN} extra` },
    { Authorization: `Bearer ${'a'.repeat(9000)}` },
  ];
  for (const header of headers) {
    assertEquals(await answer(await handler(post('{}', header))), [401, { error: 'unauthorized' }], JSON.stringify(header));
  }
  assertEquals(calls.verified, []);
  assertEquals(await answer(await handler(post('{}', { Authorization: 'Bearer forged.token.here' }))), [
    401,
    { error: 'unauthorized' },
  ]);
  assertEquals(calls.verified, ['forged.token.here']);
  assertEquals(calls.handled, []);
});

Deno.test('the handler gets the body, the verified user and the clock', async () => {
  const { calls, handler } = setup(undefined, () => Promise.resolve({ code: 409, body: { error: 'noAttempt' } }));
  const response = await handler(post('{"day":330}'));
  assertEquals(await answer(response), [409, { error: 'noAttempt' }]);
  assertEquals(response.headers.get('content-type'), 'application/json');
  assertEquals(response.headers.get('access-control-allow-origin'), '*');
  assertEquals(calls.handled, [{ body: { day: 330 }, userId: USER, nowMs: 1234 }]);
});

Deno.test('the auth server unreachable, the store failing', async () => {
  const down = setup(() => Promise.reject(new AuthUnavailable('down')));
  assertEquals(await answer(await down.handler(post('{}'))), [503, { error: 'authUnavailable' }]);
  assertEquals(down.calls.handled, []);
  const broken = setup(undefined, () => Promise.reject(new Error('database down')));
  const quiet = console.error;
  console.error = () => {};
  try {
    assertEquals(await answer(await broken.handler(post('{}'))), [500, { error: 'internal' }]);
  } finally {
    console.error = quiet;
  }
});

Deno.test('bearerToken', () => {
  assertEquals(bearerToken(post(null, { Authorization: `Bearer ${TOKEN}` })), TOKEN);
  assertEquals(bearerToken(post(null, { Authorization: `bearer ${TOKEN}` })), null);
  assertEquals(bearerToken(post(null, {})), null);
});
