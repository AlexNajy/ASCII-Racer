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

## 2026-11-24: step 13, city tests over 200 seeds

- `cityRules.test.ts`, seeds 1 to 200 with default settings, about 5 s: nothing solid on a road, every junction reachable down a car-wide corridor, a 0.5 m flood fill can't get past the outer wall, no prop in a building or in another prop (only a planter's own tree and fence against fence allowed), the start is on a clear road.
- To make 200 cities affordable: `withoutVertices` in `render/shapes.ts` makes every shape return nothing, so `generateCityData(settings, false)` gives the same colliders and random calls in about 4 ms instead of 380 ms. `Collider` got an optional `building` tag.
- Bugs the tests found, fixed in generation: the car started at the origin, which is inside a block on seeds 38, 70 and 182 (it now starts on the middle junction, see `SPEC.md` decisions); yard trees in fences and porches; park trees in the kiosk and in each other; two dumpsters where alleys cross. Roads, reachability and the wall held on every seed before any fix.
- Reference hashes updated by hand for the moved start and props (seed 1: 858219843, seed 42: 3437657928).
- Review: first verdict `fix` (any prop wholly inside another passed; `startJunction` was only the middle for even block counts). Fixed and checked by the lead; removing the kiosk clearance now fails 10 seeds instead of 5.
- For the owner's eyes: slightly fewer trees (yard trees per houses block 3.76 to 3.49, park trees per park 13.0 to 12.6). Not compared in glyph mode yet; the screenshots sub-step makes that easy.

## 2026-11-24: step 13, screenshots

- `npm run shots` (`scripts/shots.mjs`, `playwright-core` driving the installed Chrome): builds, serves `dist/`, saves 10 pictures of seed 1 to the git-ignored `shots/` in about 9 s; names after it take only those shots, `--seed N` changes the city. Fails at once on a page error.
- URL parameters (`src/dev/urlParams.ts`, tested): `seed`, `mode`, `camera=x,y,z,yaw,pitch` in degrees, `tick` (world stepped there with no input and held, at most an hour of ticks). Nothing changes without them.
- Checked: two runs byte-identical (builder, reviewer); the lead looked at the pictures. Review's first verdict was `fix` (five shots mostly fog or road, no parser test, a 120 s wait on a bad parameter); all fixed.
- What the pictures show about the game, not fixed here: car parks and the flex alley gate are dim and hard to read in glyph mode; houses and yards read well.
- For step 20: the URL parameters also work in the shipped build (a stray `?tick=` holds the world still). `index.html` has an empty favicon so the 404 doesn't count as a page error.
- Shots hold the car at the start junction; chase shots elsewhere need a car position parameter, to add when a sub-step needs it.
- Next: "CI".
