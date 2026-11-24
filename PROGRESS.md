# Progress

The lead's journal: one entry per finished sub-step, newest last. What was built, how it was checked, decisions, anything the owner should look at. The README checkboxes say what is done; this says how it went.

## 2026-11-24: setup

- Step 12 merged. `SPEC.md`, the roadmap as task queue (steps 13 to 20), CI on pull requests, `/go` and `/stop` skills, `builder` and `reviewer` subagents, keep-going and after-summary hooks added.
- GitHub Pages is enabled with GitHub Actions as its source; nothing is deployed until step 13's deploy sub-step.
- Supabase project exists; `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` (expires about 2027-02-22 if the 90 days were kept) and `SUPABASE_DB_PASSWORD` are GitHub Actions secrets. Anonymous sign-ins are on.

## 2026-11-24: step 13, test runner

- Vitest 5.1 (Node environment, `src/**/*.test.ts`). `npm test` runs once; `npm run check` is `tsc && npm test && vite build`. First tests: seeded random (sequence, range, `blockSeed`, `shuffle`) and `advanceClock`.
- Checked: reviewer passed it, including `npm ci` plus `npm run check` in a clean copy and a `.glsl?raw` import from a test; a failing test makes the check exit 1; test code is not in `dist/`.
- The 0.1 s frame cap lives in `main.ts`, not `clock.ts`, so it is untested until the headless world sub-step moves the step out.
- For the owner: `npm audit` flags the locked Vite 8.3.x (dev server advisory, dev only). Not bumped here.

## 2026-11-24: step 13, headless world

- `game/world.ts`: `generateCityData` (city, layout, fences, street furniture, models, colliders, same call order as before), `createWorld`, `stepWorld(world, input)` for exactly one tick (returns the `Impact`), `regenerateCity`. `main.ts` only reads the keyboard, calls `stepWorld` inside `advanceClock`, and draws. The frame cap moved to `clock.ts` as `capFrameSeconds`.
- Checked: reviewer passed it (compared tick order, generation order and regeneration with the old `main.ts`); 15 tests; headless Chrome screenshot shows the city and car with no JS errors, and differs from the old build in one animated neon cell.
- Left as is: the world keeps the model vertices (colliders come from the same `cityModels` call), so a server builds vertices it doesn't need. `clock.tick` and `world.tick` both exist and always match; everything reads `world.tick`.
- Not checked by hand: driving and dev menu regeneration in a real browser.

## 2026-11-24: step 13, determinism tests

- `game/referenceRun.ts`: 10 000 ticks of seeded scripted input (throttle, steer, drift, brake, reverse, walls), an FNV-1a hash over the exact float bytes of the car state, every impact and a digest of the city (colliders, buildings, junctions, signal offsets). `determinism.test.ts`: two separately built worlds agree, other seeds or inputs change the hash, frame-time patterns through `advanceClock` (60 Hz, 144 Hz, irregular with capped frames) give the same state at the same tick, the run is a real drive, and stored hashes for seeds 1 and 42 with a message saying what a change means.
- Two leaks fixed: `Math.hypot` deciding which park trees exist (`openLots.ts`), `Math.tan` in the house roof height (`houses.ts`, drawing only as it turned out). No city changed for the seeds compared.
- Review: first verdict `fix` (the stored hash missed the car's start; the tick-grouping test could not fail). Both fixed by a second builder and checked by the lead: `START_X = 1` now fails the stored hashes. The reviewer's mutation tests (car, fence and tree constants) all failed the hash as they should.
- Open: the hashes were computed on this Mac's Node. If CI's Node disagrees, that is a real cross-engine leak to chase.
- Generating one city takes about 1.1 s in Node, which matters for the 200-seed city tests next.
- Next: "City tests over 200 seeds".
