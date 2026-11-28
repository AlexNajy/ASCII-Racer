import { START_BODY_MAX, startAttempt } from '../_shared/handlers.ts';
import { authServerUser, endpoint, serviceEnv } from '../_shared/http.ts';
import { restStore } from '../_shared/store.ts';

const { url, serviceKey } = serviceEnv();
const store = restStore(url, serviceKey);

Deno.serve(
  endpoint({
    maxBody: START_BODY_MAX,
    verifyUser: authServerUser(url, serviceKey),
    handle: (body, userId, nowMs) => startAttempt(body, userId, nowMs, store),
  }),
);
