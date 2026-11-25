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

## 2026-11-24: step 13, CI and deploy

- CI: `ci.yml` runs `npm run check` on every pull request (now pull requests only). Its first run on PR #16 failed on Vitest's 5 s default timeout, the runner being 2 to 3 times slower than the Mac; `testTimeout` is now 60 s and the run is green. The stored reference hashes matched on Linux, so the simulation agrees across the two machines.
- Deploy: `deploy.yml` on every push to `main`: `npm ci`, `npm run check`, then `dist/` to Pages (a red check doesn't deploy). `vite.config.ts` has `base: './'`, so the site works under `/ASCII-Racer/`; builder and reviewer both loaded it from a sub-path in headless Chrome with no 404s.
- Reviewer passed it. The deploy itself only runs after the merge; checked then (see the next entry).

## 2026-11-24: step 13 merged and live

- PR #16 merged. The first deploy failed at the last step ("No artifacts named github-pages were found", asked 0.4 s after the upload in the same job); a re-run of the same commit passed. https://alexnajy.github.io/ASCII-Racer/ answers 200 with its script and stylesheet.
- Fix on the `hud` branch: `deploy.yml` split into a build job and a deploy job, the usual shape, so the artifact is listed before it is asked for. Proven only at the next merge.
- Not checked: the live site in a real browser with a real GPU.

## 2026-11-24: step 14, text layer

- `src/hud/`: `TextGrid` (plain, tested: `put`, `write` with colour, background and alignment, `fill`, `box`, `clear`, `resize`; negative coordinates count from the right and bottom; clips; dirty flag) and `hudTexture.ts` (one RGBA8UI texel per cell: character plus a solid-background bit, then the colour; uploaded only when dirty). The atlas has the 95 printable characters as 8 extra rows after the material rows. The ASCII pass draws HUD cells over the scene in glyph mode.
- New URL parameters `hud=test` (test card) and `cell=N` (cell width); new shot `hud-test`.
- Checked: reviewer passed it and made its own baseline from HEAD: the 10 older shots are byte-identical. It looked at the card at 5x zoom and at other cell sizes, window sizes and pixel ratios. The lead looked at `hud-test.png`.
- For step 16 (menus, results): a strip under one cell tall at the top and a few pixels on the right are outside the grid and always show the scene, so a full-screen opaque screen needs the shader to blank them. Backgrounds are black only; a highlighted menu row has to use text colour or markers unless the texel format grows.

## 2026-11-24: step 14, speedometer

- `src/hud/hud.ts`: `drawHud(grid, { speed, topSpeed })` draws a fixed 15×9 panel in the bottom right: three block digits (3×5 cells each, made of `#`), `km/h`, and a bar against the car's top speed setting. Each cell is written once per call, so an unchanged speed uploads nothing; not drawn when the grid is too small. Hidden in the fly camera.
- New URL parameter `drive=1` (full throttle during the held-tick startup) and shot `hud-driving` (91 km/h at tick 300, matching the simulation's 25.3 m/s).
- Review: first verdict `fix` (the texture uploaded every frame, the panel broke apart on tiny grids, the number was one glyph row). Fixed and checked by the lead: 64 tests, only `chase-junction` and `hud-driving` differ from the baseline shots.
- Decisions (in `SPEC.md`): the number is the car's whole speed, slides and reversing included.
- For the owner's eyes: the digits are 5 cells tall, about 50 px on a 900 px screen. Readable, still small; doubling the digit size is a small change if wanted.
- Not tried in a real browser: switching to the fly camera and back, a live resize (read in code only).

## 2026-11-24: step 14, minimap

- `src/hud/minimap.ts`: the whole city, north up, bottom left. Laid out from the road lines: every road line is exactly one cell, every block 5×2 cells, so the grid is always regular (49×25 cells for the default city, 55×29 with its frame). Streets dim `- | +`, avenues bright `= H #`, the car a red `A < V >` by heading. `minimapPosition` / `minimapCell` map world to map cells for routes, gates and other cars later.
- Checked: reviewer passed it. Against the city data the map is not mirrored and the car is on the right cell in both chase shots; the mapping is monotonic on five cities; fly camera and back, resizes and city regeneration leave no stale cells (driven in headless Chrome). 77 tests; only the two chase shots changed.
- Left open: the car glyph test restates the code's own table instead of driving a car and checking the direction (the reviewer checked the sign by hand against `car.ts`).
- New sub-step in step 19: the map is 43% of the screen height for a 10×10 city at 1600×900 and 54% at 1280×720, so large lobby cities need a smaller scale.

## 2026-11-24: step 14 merged and live

- PR #17 merged. The split deploy workflow worked first time; the live site serves the new bundle (same file name as the local build of `main`).

## 2026-11-24: step 15, road graph

- `game/roadGraph.ts`: nodes (one per junction), segments (ends west/north to east/south, axis, length, width, avenue flag, the stretch clear of both junction squares), `links` per node in north, east, south, west order, and helpers `otherEnd`, `directionFrom`, `pointAlong`, `turnBetween`. Built once into `CityData.roadGraph`; not in the city digest, so the reference hashes are unchanged.
- Checked: reviewer passed it and scripted 283 cities (36 352 segments): widths, centre lines, clear stretches and colliders all agree with the real city; left and right agree with the car's own right vector. 128 tests.
- Carried into the next brief: the helpers answer silently when given a node that isn't on the segment (they should throw); compare `avenue`, never widths.

## 2026-11-24: step 15, route generator and route tests

- `game/route.ts`: `generateRoute(graph, seed, { length })`: a depth-first walk with weighted choices (straight 8, turn 1, ring 0.3, at most 3 ring segments in a row), never a segment twice, backtracking when stuck; start and finish mid-segment with the positions rolled to hit the target length; a gate on every leg turned into and at most 300 m apart; a car pose one car length behind the start line with a quarter-turn heading; `RouteError` when the city is too small. Lengths: short 1400, medium 2000 (default), long 2800 m. Own seed index, so the city is unchanged.
- Tests: 1000 routes (250 cities × 4 route seeds) checked for validity, clear corridors and gate spans, plus other sizes, determinism and three stored route digests. 144 tests, about 9 s.
- Checked: reviewer passed it with its own validation of 25 389 routes (three city sizes, three lengths, extreme seeds), a real car driven from the pose, and three mutations all caught. Slowest route 51 ms.
- Numbers for a medium route in the default city: 2000 to 2016 m, 12 gates on average (8 to 19), a third of junctions are turns, 21% of the length on the ring, longest straight 616 m.
- Quality notes carried into the test driver sub-step, where routes are tuned anyway: 92% of routes loop round a single block at least once (hairpins); 17% put the start 10 m before a junction or the finish 10 m after one; `finishRange` has no guard for an empty range.

## 2026-11-24: step 15, race state

- Roadmap order changed: "Race state" before "Gates", because the gates draw the next checkpoint the race decides.
- `game/race.ts` and `world.ts`: a world holds a race or none (`startRace`, `clearRace`, `createRaceWorld`). Countdown of 180 ticks with the car held bit-identical whatever the input, then running, then finished with the time frozen in whole ticks (`formatRaceTime` gives m:ss.mmm, milliseconds rounded down). Only the next gate counts, crossed in its direction within the road plus 3 m of pavement each side; backwards and out-of-order crossings do nothing. `stepWorld` reports one race event per tick (go, gate, finish). Race state is hashed only when a race is present, so the stored hashes are unchanged.
- Browser, until the menu exists: the game starts in a race on the city's own route, `R` restarts it, regenerating the city starts that city's route. URL parameter `race=0` is free driving; all 12 older shots carry it and are byte-identical. New shot `race-start`.
- Checked: reviewer passed it; eight mutations of the rules were caught by the tests, one survived (the span test only has a case whose end point is inside the span; carried into the gates brief). 160 tests.
- Worth knowing: a car that cuts a corner through a park or car park crosses a gate's line outside its span, so the gate doesn't count and the driver has to go back. Kept as is (road plus pavement is the course); the gate models have to make the span obvious.

## 2026-11-24: step 15, gates

- `render/models/gate.ts`: an arch per gate (lit posts 0.8 m from the kerb, a header 8.5 to 13.5 m up with its panel lit on the approach side), lime checkpoints, a white chequered finish, not solid. One mesh per route; `u_nextGate` hides passed gates, leaves the next one at full glow and dims the ones to come. The next gate also has a beam of light 6 m wide up to 50 m (pink-white for the finish), faded close up, and breathes between 70% and 100% over 2 s (`u_gatePulse` from the tick). Own steady glyph sets `gate` and `gateBeam`.
- URL parameter `gate=N` sets the next gate for screenshots. Shots: `gate-near`, `gate-finish`, `gate-far` (250 m), `gate-neon` (200 m beside a green neon shop), `gate-finish-far`.
- Review: correct on the first pass, but the gate was only obvious up to 100 m (9 × 1.3 cells at 250 m) and its posts went through awnings at 30% of gates. The look round added the beam, pulse, glyph sets and moved the posts; the lead checked it: 166 tests, non-gate shots byte-identical, the beam is 4 columns × 11 rows at 250 m and the first thing the eye lands on.
- Known and accepted: a mall canopy can poke 0.2 m into a post; a street light can stand inside a finish post; about 1.5% of posts stand in a car park entrance gap; a passed gate vanishes in one frame as the car goes under it.
- From the review's numbers: the first gate is never on the start leg and 77% of hops between gates need a turn first, so the HUD arrow and the route on the minimap (next) carry "which way".

## 2026-11-24: step 15, race HUD

- `src/hud/`: `blockFont.ts` (3×5 block characters, shared with the speedometer), `raceHud.ts` (timer top centre in block digits with `GATE n/N` in its frame; guidance beside it; a banner under it for 3, 2, 1, GO and, for 5 s, FINISH with the time), `guidance.ts`, and the route on the minimap (cyan line, driven part dim, `S`, `o` gates to come, `@` next gate, `F` finish).
- Guidance follows the route like a navigator: the next real turn with the distance along the route to its junction, or `GATE` with its distance when no turn is left (then only a one-row readout, so the beam stays in view); off the route, a bearing arrow to the gate. Never "straight".
- New URL parameters `car=x,z,quarterTurns` and `gate=<count>` (finished); shots `race-go`, `race-running`, `race-arrow`, `race-gate-ahead`, `race-finished`.
- Review: first verdict `fix`: guidance flipped to the bearing arrow or the next leg's instruction within 15 m before a right turn (a leg claimed the car without the car facing along it); `STRAIGHT n m` was noise; the arrow panel covered the beam; the FINISH banner never went away. All fixed; the lead checked: 195 tests including a walk of 240 routes at 1 m steps with lane offsets and heading jitter, non-race shots byte-identical, the race shots read well at 1600×900.
- Next: "Test driver", with route tuning (hairpins, start and finish margins).
