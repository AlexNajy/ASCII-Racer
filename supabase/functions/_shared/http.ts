import type { Reply } from './handlers.ts';

// HTTP around a handler: CORS, method, capped body, the caller's identity from its access token, JSON answers.

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*', // no cookies: the identity travels in the Authorization header
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

const MAX_TOKEN_LENGTH = 8192;

export function json(code: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: code,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// The body as text, or null when it is longer than maxBytes; never reads more than maxBytes + one chunk.
export async function readCappedBody(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxBytes) return null;
  if (!request.body) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function bearerToken(request: Request): string | null {
  const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(request.headers.get('authorization') ?? '');
  return match && match[1].length <= MAX_TOKEN_LENGTH ? match[1] : null;
}

export class AuthUnavailable extends Error {}

// The user id of a valid access token, or null. Throws AuthUnavailable when the auth server can't say.
export type VerifyUser = (token: string) => Promise<string | null>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_REFUSED = [400, 401, 403, 404];

// Asks the project's auth server (GET /auth/v1/user), which checks the signature with the project's own keys
// (legacy secret or asymmetric signing keys alike), the expiry and that the user still exists.
export function authServerUser(supabaseUrl: string, apiKey: string): VerifyUser {
  return async (token) => {
    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      throw new AuthUnavailable(String(error));
    }
    if (TOKEN_REFUSED.includes(response.status)) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) throw new AuthUnavailable(`auth server answered ${response.status}`);
    const user: unknown = await response.json();
    const id = typeof user === 'object' && user !== null ? (user as { id?: unknown }).id : undefined;
    return typeof id === 'string' && UUID.test(id) ? id : null;
  };
}

export interface Endpoint {
  maxBody: number;
  verifyUser: VerifyUser;
  handle: (body: unknown, userId: string, nowMs: number) => Promise<Reply>;
  now?: () => number;
}

// Order: preflight, method, body size, JSON, identity, then the handler.
export function endpoint({ maxBody, verifyUser, handle, now = Date.now }: Endpoint): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'POST') return json(405, { error: 'methodNotAllowed' });
    const text = await readCappedBody(request, maxBody);
    if (text === null) return json(413, { error: 'bodyTooLarge' });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { error: 'malformed' });
    }
    const token = bearerToken(request);
    if (!token) return json(401, { error: 'unauthorized' });
    try {
      const userId = await verifyUser(token);
      if (!userId) return json(401, { error: 'unauthorized' });
      const reply = await handle(body, userId, now());
      return json(reply.code, reply.body);
    } catch (error) {
      if (error instanceof AuthUnavailable) return json(503, { error: 'authUnavailable' });
      console.error(error);
      return json(500, { error: 'internal' });
    }
  };
}

// The service key from the environment the Edge Runtime sets: the new secret key when the project has one,
// else the legacy service role key.
export function serviceEnv(): { url: string; serviceKey: string } {
  const url = Deno.env.get('SUPABASE_URL');
  let serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) {
    const parsed: unknown = JSON.parse(secretKeys);
    const key = typeof parsed === 'object' && parsed !== null ? (parsed as { default?: unknown }).default : undefined;
    if (typeof key === 'string') serviceKey = key;
  }
  if (!url || !serviceKey) throw new Error('SUPABASE_URL and a service key must be set');
  return { url, serviceKey };
}
