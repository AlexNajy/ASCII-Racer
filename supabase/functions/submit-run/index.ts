import { SUBMIT_BODY_MAX, submitRun } from '../_shared/handlers.ts';
import { authServerUser, endpoint, serviceEnv } from '../_shared/http.ts';
import { restStore } from '../_shared/store.ts';

const { url, serviceKey } = serviceEnv();
const store = restStore(url, serviceKey);

Deno.serve(
  endpoint({
    maxBody: SUBMIT_BODY_MAX,
    verifyUser: authServerUser(url, serviceKey),
    handle: (body, userId, nowMs) => submitRun(body, userId, nowMs, store),
  }),
);
