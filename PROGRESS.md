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

## 2026-11-24: step 15, test driver (built, not reviewed, not ticked)

- Built: `game/driver.ts` (`driverInput`, `driveRace`: follows the route's centre line, brakes to 10 m/s for turns, recovers from stalls and missed gates), `driver.test.ts` (16 full races, two recovery races, a replay of the recorded inputs in a separately built world, a stored `DRIVEN_RACE_HASH`), and `npm run drive -- first last [--length ...] [--blocks N]` for sweeps.
- Route tuning in the same change: lengths 1250 / 1800 / 2500 m; start and finish margins 20 m with a search that only stops when both fit strictly inside their stretches; `REPEAT_TURN_WEIGHT` against two same-side turns at neighbouring junctions; `finishRange` guarded. Route digests updated by hand on purpose; the free-driving reference hashes are untouched. Gate and race shots re-aimed to the new seed-1 route.
- Builder's numbers, not confirmed by a reviewer: 600 medium routes all finished in 70.5 / 80.5 / 93.8 s (min / mean / max) with no impacts, 1200 routes over all lengths and sizes with no failure; hairpins per route 2.05 to 0.63 (45% of medium routes still have one); gates per medium route about 10 (7 to 15); no start or finish at its margin any more.
- State: committed on `routes` because the owner said stop while the review was starting. The lead ran `npm run check` (215 tests, passes) and nothing else. The sub-step stays unticked: the next `/go` starts by sending this commit to the reviewer (the brief is the last reviewer brief of this session: sweep on other seeds, driver honesty, the strict-fit search, hairpin count, the length choice, shots).
- Possible real bug, not looked into: in the builder's stress test (car knocked sideways onto the pavement) about 2% of races got stuck with the car pinned between a lamp pole and a building, unable to move forward or back. In the daily that would end a player's one try. To reproduce and, if real, add as a sub-step.
- `npm run check` took 37 s of test time on the lead's last run, against the builder's 10.4 s; the stopped reviewer's sweep was probably still using the CPU. To time again on a quiet machine.

## 2026-11-24: session stopped by the owner

- Done this session: step 13 (PR #16) and step 14 (PR #17) merged to `main` and deployed to https://alexnajy.github.io/ASCII-Racer/. Step 15 on branch `routes`: road graph, route generator and its tests, race state, gates, race HUD ticked; test driver committed but unreviewed.
- Open for the owner: whether Pages should keep publishing the unfinished game on every merge (asked, not answered; left as the spec says); speedometer digit size; slightly fewer trees after the city-rule fixes; the locked Vite 8.3.x has a dev-server advisory.
- Never tried by hand in a real browser: anything. Every check so far is tests plus headless Chrome screenshots.
- Next: review the test driver commit, tick it, tick step 15, open "Step 15: Routes", merge, then step 16 "Game states".

## 2026-11-24: step 15, test driver reviewed

- Reviewer passed commit `1ae1552` as it stands. Its own sweeps on other seeds: medium 251/251 finished in 71.5 / 80.3 / 89.4 s, long 201/201 in 101.7 / 110.8 / 130.1 s, short in a 6×6 city 201/201 in 51.4 / 58.5 / 66.0 s, medium in a 10×10 city 151/151 in 68.7 / 79.8 / 89.8 s, no impacts or back-outs. 2700 generated routes, none threw. `npm run check` takes 12.6 s on a quiet machine (the 37 s was load).
- Correction to the entry above: in 6×6 cities about 1% of medium routes still fall back to start and finish at the ends of their ranges; 8×8 never.
- Small and left: `npm run drive -- --blocks x` isn't validated; "a drifting player is 10–20% faster" is an estimate.
- The pinned car is real: the gap between a street-light pole and the building line is exactly the car's width (1.8 m), the car collides as 3 circles of 0.9 m, and a sideways slide at 30 m/s about 0.1 rad off parallel moves 0.5 m in a tick, so a 0.4 m pole can end up between two circles with the wall on the other side. Straight throttle or reverse never frees it; steering combinations take 28 s to never. Seed 1: car at (-252.5, -287), heading pi/2 - 0.1, velocity z +30, drifting, ends at (-248.424, -283.966) with the pole at (-249, -285) inside it. Added as a sub-step of step 15.

## 2026-11-24: step 15, pinned car

- `game/car.ts`: the car's collision shape is a capsule (a 0.9 m circle swept along the centre line) instead of 3 circles, so nothing can hook into a notch in its side; each tick's move is resolved in steps of at most 0.1 m with up to 4 passes, against nearby colliders only. A move that touches nothing ends bit-exactly where it did before.
- Simulation changed on purpose: `REFERENCE_HASHES` replaced by hand (seed 1: 3477829500, seed 42: 932636931). `DRIVEN_RACE_HASH` unchanged (the driven race touches nothing).
- New `carCollision.test.ts`: the seed-1 case and a sweep of slides into poles; both fail on the old code. 217 tests, 6.8 s.
- Builder's sweeps: 14 traps in 516k slides before, 0 in 5.8 million after (seeds 1 to 4). Reviewer passed it with its own sweep on seeds 7 and 11: nothing overlaps the car at rest any more (17 cases before), worst penetration 0.07 m (0.8 m before), no tunnelling. `stepWorld` is 7 to 9 times faster (about 200 000 ticks/s) thanks to the nearby filter. Driver sweeps identical to before.
- Left as is: in the seed-1 case straight reverse pushes into the pole behind the tail; throttle frees the car at once. A corner hit now reports 2 or 3 impacts (the extra ones under 1 m/s, far below the debris threshold; sound will have to ignore small ones). `nearestOnSegment` is only exact while the centre line is outside a collider, which driving can't break.
- Open for the owner, not a collision bug: a sideways slide can park the car lengthwise in a slot barely longer than itself (planter and building, two parked cars). Nothing overlaps it, but steering needs speed, so getting out is a multi-point shuffle of 8 s or more, about 0.1% of deliberately nasty slides. Making that quicker would be a new driving rule (turning at standstill, or a push out), so it is not built.
- Found on the way, added as a sub-step: the seam between two touching building rectangles acts like a corner and turns a sideways slide into speed along the wall.

## 2026-11-24: step 15, wall seams; step 15 done

- The bug was still there after the capsule change: each rectangle was resolved on its own, so at a joint in a flat wall the car was pushed diagonally off one piece's corner. `game/car.ts` (`faceOf`, `covers`, `SEAM_GAP`): when the car meets a rectangle past a corner and a neighbour carries the face on, the rectangle counts as reaching over the neighbour. Real outside corners, steps in a wall and alley mouths are unchanged.
- `wallSeam.test.ts`: walls cut in two and in five, an L cut two ways and a block cut in four behave like the uncut shape (bit-identical for flat walls); three of the five tests fail on the old code. No stored hash changed. 222 tests, 7.3 s.
- Reviewer passed it: 32 000 random cut walls bit-identical to one rectangle (the old code differed in 5444, by up to 42 m); about 80 000 slides into the real joints of seeds 7 and 42 each identical to the merged box; no phantom walls across alleys or at set-back steps; no traps. About 10% slower in constant wall contact (135 000 ticks/s).
- Known and left: a wedged car can rest 1 mm to 5 cm inside a collider (the 4-pass limit), same before this change; the many-pieces test doesn't assert that its slides hit.
- Step 15 is complete: `npm run shots` gives 23 pictures, the lead looked at the race ones.

## 2026-11-25: step 15 merged, step 16 game states

- Step 15 merged as PR #18 and deployed. Branch `menu` for step 16.
- Game states: `src/app/gameState.ts` (menu, preRace, race, results as plain data with pure transitions; a `RaceMode` with only `cityRoute` so far), `src/app/flow.ts` (what entering a state does to the world), `src/hud/screens.ts` (placeholder screens on the text layer). The game opens on the menu; Enter goes menu, pre-race, race; results come 5 s after the finish; Esc goes to the menu. Nothing in the simulation knows about it.
- Keys gone: `C` (the fly camera is only the dev menu's Movement dropdown) and `R` (restart returns with unlimited's "again").
- URL parameter `state=menu|prerace|race|results`; `scripts/shots.mjs` passes `state=race`, the 23 old shots are byte-identical, new shots `state-menu`, `state-prerace`, `state-results`. 242 tests.
- Reviewer passed it and walked it in headless Chrome with the real clock: menu, pre-race, countdown, driving, Esc, a second clean race, a real finish, the results coming up by themselves, back to the menu; no console errors.
- To check by hand in a real browser (headless can't): with the mouse captured, Chrome probably uses the first Esc to free the pointer without sending the key to the page, so leaving a race may take two presses.
- For the real menu: the placeholder text has no background and is faint over a bright scene; Enter does nothing on a city without a route and the menu should say why; Enter and Esc also act while the dev menu is open.

## 2026-11-25: step 16, main menu and camera flight

- `src/app/mainMenu.ts` (the six entries in one table; only `unlimited` works and opens the placeholder race flow, the rest are dimmed until built), `src/hud/menuScreen.ts` (title `ASCII RACER` in the block font, the list in a solid panel, `>` `<` in yellow round the selection), `src/app/pointer.ts` (mouse position to grid cell), `src/render/menuFlight.ts` (a closed loop of roads two junctions out from the middle, 12 m up, 8 m/s, a pure function of the tick). Arrows or W/S move the selection and wrap, Enter or a click opens, hover selects; the pointer is never captured in the menu. The car and its headlights are hidden there.
- URL parameter `entry=0..5`; shots `state-menu` (new picture), `menu-flight-2`, `menu-flight-3`, `menu-garage`; the other 25 byte-identical. 273 tests.
- Reviewer passed it (walk-through at pixel ratio 1 and 2, flight geometry checked against poles and kerbs) with four low findings, all fixed by a second builder and checked by the lead: a selection change no longer re-enters the state (it wrote the car and cleared the text layer on every hover); one click handler decides between menu and pointer lock; flow keys are ignored while the dev menu is open; the selection markers stay yellow on a dimmed entry.
- Look, left as is: the flight is mostly one composition (a street between window walls); weakest at corners facing dim mid-rises (seed 1 ticks 2200, 8750), best past the park and open junctions (6700, 4480). A higher or panning camera would add variety. The list is normal cell size, small next to the title.
- Until step 17 the menu flies through the current city seed, not the day's.

## 2026-11-25: step 16, unlimited (built, not reviewed, not ticked)

- Built: `RaceMode` is `unlimited`. Choosing it in the menu picks a random seed (1 to 1 000 000, `Math.random` only in `randomCitySeed` in `src/app/flow.ts`), skips seeds whose route throws `RouteError` (10 tries), loads that city (`loadCity()` in `main.ts`, the one function the loading line can wrap) and goes straight to the countdown, no pre-race screen. `src/hud/finishScreen.ts`: the time in big block digits and `again` (same route), `next` (new city and route), `menu`, with keys and mouse as in the main menu; `menuScreen.ts` generalised to a list screen for both.
- Builder's numbers, not confirmed: only `state-results` changed among the shots, the other 28 byte-identical; nothing random under the shot URL parameters; a new city freezes the page for about 0.5 s in headless Chrome; its walk-through covered unlimited twice (different seeds), a finish, `again`, and `next` from a fresh load, without console errors, but never a second finish after `again`.
- State: committed on `menu` because the owner said stop; the review had died (the Mac went to sleep mid-review, in spite of `caffeinate -i`, probably the lid). The lead ran `npm run check` (291 tests, passes) and looked at `state-results`: the time reads well, the options panel sits over the car. The sub-step stays unticked: the next `/go` starts by sending this commit to the reviewer (stale state after a new city, GL buffers freed on repeated `next`, the pre-check city being the city loaded, keys held across transitions, mouse at pixel ratio 2, shots against a `HEAD~1` baseline).

## 2026-11-25: session stopped by the owner

- Done this session: step 15 finished and merged (PR #18, deployed): test driver reviewed, the car's collision shape made a capsule resolved in short steps (pinned car), flat walls of several colliders behave like one (wall seams). Step 16 on branch `menu`: game states and the main menu with its camera flight reviewed and ticked; unlimited committed but unreviewed.
- Open for the owner: whether Pages should keep publishing on every merge (still unanswered; the live site has step 15 and still starts straight in a race); a slide can park the car in a slot barely longer than itself, getting out is a multi-point shuffle of 8 s or more (a quicker way out would be a new driving rule, not built); the menu flight is mostly one composition; the menu list is normal cell size; the finish screen's options sit over the car.
- To try by hand in a real browser, since nothing has been: Esc with the mouse captured (probably two presses to leave a race), and everything else.
- Next: review the unlimited commit, tick it, then "Settings", "Garage", "Loading line", and step 16's pull request.

## 2026-11-26: step 16, unlimited reviewed

- Reviewer passed commit `14f25a0` as it stands, with a real-clock walk-through: unlimited into new cities (a dozen different seeds, the new city's route on the gates and minimap), a real finish, the results by themselves, `again` back at the start with the gates reset while W was held, `next` into another city, Esc in the countdown, the mouse at pixel ratio 1 and 2; no console errors. The route checked before loading is exactly the route raced. Memory flat over 10 more cities (85.2 to 85.8 MB), every GL object of the old city deleted. `Math.random` only in `randomCitySeed`. Only `state-results` differs from the shots before. A new city blocks for about 0.5 s.
- Left: sparks or debris thrown just before `again` or `next` fly on for under a second; the finish screen's options sit on the car (moving the list up under the time would group it, the owner's call).
- The Mac sleeping: `caffeinate` now runs with `-ims`.

## 2026-11-26: step 16, settings

- `src/app/settings.ts` (nickname, volume 0 to 10, mute, cell width; parsed field by field with fallbacks, one `localStorage` key `ascii-racer-settings`, safe when storage throws; a new field is a row in `FIELDS`), `src/app/settingsMenu.ts` (what keys and clicks do), `src/app/keys.ts` (the one key table), `src/hud/settingsScreen.ts`. A `settings` game state opened from the menu (menu entries can now open a screen as well as a race mode), Esc back. The nickname is typed in place; volume and mute are only stored until sound exists; glyph size applies live and is one value with the dev menu's slider; fullscreen is not stored.
- URL parameters `state=settings`, `edit=TEXT`; shots `settings`, `settings-edit`. Shots neither read nor write stored settings. The four menu shots changed only where the `settings` label went from dimmed to enabled. 330 tests at review, more after the fixes.
- Reviewer passed it (hostile stored data, awkward typing, every row by keys and mouse at pixel ratio 1 and 2, after glyph size changes and a window resize, reload, no console errors) with three low findings, fixed by a second builder and checked by the lead: a stored glyph size of 16 in a small window drew no menu at all (now a compact last style for the menu, finish and settings screens: they draw down to 352×352, 240×268 and 560×352 px at size 16); the key list lacked the mouse; Alt combinations leaked while typing a nickname.
- To check by hand in a real browser: Esc in fullscreen (the browser probably takes the first press), dead keys and IME input in the nickname field.

## 2026-11-26: step 16, garage

- `render/models/car.ts`: five shapes (`coupe`, today's car vertex for vertex; `hatchback`, `pickup`, `van`, `wedge`), all inside the collision box on the same wheel spots; `palettes.ts`: twelve named colours (`ember`, the old red, first). Stored as string ids `carShape` and `carColor` in the settings. A `garage` game state from the menu: rows shape and colour, Left/Right or the `<` `>` arrows cycle, saved at once. The preview is its own dark scene (`render/garage.ts`): the car turns once per 16 s on a glowing floor, own light, headlights off; `world.car` is never touched. Drawing only: nothing under `src/game/` changed.
- URL parameters `state=garage`, `shape=`, `color=`; shots `garage`, `garage-hatchback`, `garage-pickup`, `garage-van`, `garage-wedge`, `race-pickup`, `race-hatchback`. Old shots unchanged except the four menu ones (the `garage` label enabled). 365 tests.
- Review: `fix`. From behind in the city the hatchback was a low box with a roof floating above it (a full-width hatch of unlit glass renders as empty cells in moonlight; fine in the garage's light, so only chase pictures showed it). Everything else passed (every vertex in the box, normals right, the menu pixel-identical after a visit to the garage, mouse at pixel ratio 2).
- Second builder, checked by the lead in the pictures: cabins of hatchback, pickup and wedge are painted with windows set in; the pickup's bed rails were higher than the cab's body, now lower, so the bed shows from behind; the wedge's wing posts are painted; the lit spot is a bright disc fading through a ring in its own `garageFloor` glyph set (it was faint dots); eight colours moved apart (sky/cobalt, jade/teal, magenta/rose, gold/tangerine).
- Still weak: the coupe's glass cabin shows a dark gap from the shaded side (kept byte-identical to the old car); magenta and violet are now the closest pair; gold is a bit olive at night; the floor reads as a patterned disc more than a soft glow; tail lights vanish on the red car from behind, as before.

## 2026-11-26: step 16, loading line; step 16 done

- A `loading` game state (`loading(mode)`, `loaded(state, route)`), `hud/loadingScreen.ts` (`building city...` on a solid block). The menu's unlimited and the finish screen's `next` go through it: one frame with the line on an empty scene, then the city and route build in a task, then the countdown. At startup the renderer, atlas and text grid come first, the line is presented, then the world is built (`main.ts` now has a top-level `await`). Enter and Esc are ignored while loading. The frame timer restarts after a build, so the countdown is a full 3 s (the first frame after a build used to run 6 ticks at once).
- URL parameter `state=loading`, shot `loading`; the 38 older shots byte-identical. 371 tests. Nothing under `src/game/` changed.
- Reviewer passed it on the built site: the line is painted before the build blocks (screencast at 4x CPU throttle), menu after 0.56 s on first load (1.8 s throttled), 59.9 ticks/s in menu and race, a 1 s stall mid-race runs 13 ticks in 1.1 s, the countdown after a load takes 2.993 s. Top-level `await` survives the production build.
- Lead's own small fix from the review: a build that throws goes back to the menu instead of being retried every frame.
- Left: a click on the loading line captures the mouse (the race does anyway); an Esc pressed during the blocking build arrives afterwards and leaves the countdown for the menu; a startup error leaves the loading line up (it used to leave a black screen), the error is in the console.
- Step 16 is complete; `npm run shots` gives 39 pictures.

## 2026-11-27: step 16 merged, step 17 day number

- Step 16 merged as PR #19 and deployed: the live site opens on the menu. Branch `daily` for step 17.
- `src/game/daily.ts` (pure, loads without DOM or rendering code, for the server later): `dayNumber(ms)` (whole days since 2026-01-01 UTC, negative before), `millisecondsToNextDay`, `dailySeed(day, attempt)` (1 to 1 000 000, mixed with `blockSeed`), `dailyCitySettings`, `dailyRace(day)` (the first attempt whose city holds a medium route; route seed = city seed). Reference seeds and two route digests stored in the test. With no `seed=` the game starts in today's city; `day=N` pins another day. The clock is read once, in `main.ts`.
- Reviewer passed it: its own calendar count agrees on every date tried and under two other time zones; days 0 to 2999 all have an 1800 m route with 7 to 17 gates and none needs a fallback (1 ms per day); the route `dailyRace` gives is the route a full world races; dev menu edits and unlimited can't leak into the daily's settings; over ten years 4 pairs of days share a city (chance alone gives about 7). All 39 shots byte-identical, 387 tests.
- Left: the fallback loop has no test of its own (no day needs it); `dailySeed(NaN)` gives day 0's seed; a page left open over midnight stays on the old day until reload (the daily flow will have to read the clock again).

## 2026-11-27: step 17, input log and replay; the game is called driftle

- The owner: the public name is driftle, not ASCII Racer. Written into `SPEC.md` (a name paragraph, the menu block); a sub-step "Name" added to step 17 and built next. Left alone unless the owner says: the repository name and Pages address (the share link will point there), the package name, the storage key.
- `src/game/inputLog.ts`: a tick is one of the keyboard's 24 input combinations (5 bits); a log runs from the go tick to the finishing tick; packed as a version byte, the tick count and run-length runs with exactly one encoding per log, base64url text for transport; `MAX_RUN_TICKS` 35 999. Decoders return typed faults and check sizes before allocating. `src/game/replay.ts`: `replayInWorld`, `replayRun`, `replayDaily(day, log)`; a run counts only if the finish is crossed on the log's last tick (`logEnded`, `inputsAfterFinish` otherwise). The browser records the input each tick reads; with `replay=1` or in dev builds it replays at the finish and logs live against replay.
- Analogue inputs are refused, not rounded. The test driver steers analogue, so it got a `keys` option that taps the steering; its default path and `DRIVEN_RACE_HASH` are unchanged. No simulation change was needed: the same log gives the same finish and a bit-identical car whatever the world tick at the start, with or without vertices, after an abandoned race or `again`.
- Sizes: a race is 1.3 to 2.5 kB packed (the tapping driver; a human's about 300 characters per 30 s), the worst case 36 kB. Replay: about 30 ms for a medium race plus 20 ms to build the world; a full-length log that never finishes about 190 ms (slowest of 3000 random logs 289 ms).
- Reviewer passed it as a parser and determinism review: 250 000 fuzzed inputs and 33.6 million exhaustive short byte strings, no exception, no log with two encodings, worst decode 0.55 ms; car numbers finite in 3000 random replays; on the built site live and replay agree for held-W, random keys, a 32 s messy drive with wall hits, and under 6x CPU throttle. 423 tests, 39 shots byte-identical.
- For the daily flow: read `recorder.overflowed` (a race past 9:59.983 can't be sent); force the default car settings in a daily (the dev menu can edit them); the Edge Function must wrap its input in `new Uint8Array(...)`.
- Lead's own small fix: removed the fault name `zeroRun`, which nothing could produce.

## 2026-11-27: step 17, name

- `src/app/gameName.ts`: `GAME_NAME = 'driftle'`. The menu title draws `DRIFTLE` (block letters `D` and `L` added), the one-line fallback `driftle`, the page title is `driftle`, the README's heading is `# driftle` with the working name under it. Not changed: repository and Pages address, package name, the storage key.
- A small change, checked by the lead instead of a reviewer: the diff read line by line, 423 tests, only the four menu shots differ, the title reads at a glance in `state-menu`.

## 2026-11-27: step 17, simulation version

- `src/game/version.ts`: `SIMULATION_VERSION = 1`. `src/game/referenceValues.ts` now holds every stored reference value (moved out of the tests unchanged: the lead compared all twelve numbers). `version.test.ts` hashes them with `INPUT_LOG_VERSION` into one fingerprint and checks it against a table of version to fingerprint: replacing a stored value without bumping the version fails with the exact line to add; a bump without a new fingerprint fails; a fingerprint can't be reused, so a bump with no change is refused. 427 tests.
- A small change, checked by the lead instead of a reviewer; the builder tried the guard by changing a hash and by bumping the version, and undid both.
- Limit, as before: a change no stored reference exercises trips nothing.

## 2026-11-27: step 17, daily flow (built, review said fix, fixes half done, not ticked)

- Built: race mode `daily` and the menu entry; `src/app/dailyRecord.ts` (the stored try: day, status, ticks, packed log text, simulation version, own key `ascii-racer-daily`), `src/app/dailyFlow.ts`, `src/hud/dailyScreens.ts` (pre-race screen with `DAILY n`, `ONE TRY`, the route's flyover on the minimap; results with the time or `DID NOT FINISH`, `leaderboard unavailable`, the countdown to the next daily); the try is written as `started` before the first countdown tick, `finished` at the finishing tick; Esc in a daily race asks before giving up while the race runs on; a daily always uses the default car and city settings. Shots `daily-prerace`, `daily-prerace-2`, `daily-finished`, `daily-dnf`, `daily-ready`, `daily-giveup`; `state-prerace` and its placeholder are gone.
- Review: `fix`. (1) Two tabs: a pre-race screen never rechecked the stored try, and writes never compared with storage, so tab B could race after tab A finished and its give-up replaced A's finished run. (2) The dev URL states `daily`, `dailyrace`, `dailyresults` read and wrote the real record on a normal load (practise today's route, keep the first good run). (3) In a small window the give-up question was not drawn, so Enter gave up unseen. (4) A stored record from a far-future day locked the daily until that date. Sound: three honest complete dailies stored logs that `replayDaily` replays to the stored ticks; the daily ignores dev car settings; unlimited unchanged.
- The owner said stop about five minutes into the fix builder's work. It had already edited eleven files (record merge rules, the recheck before racing, the give-up fallback, the URL rule, tests) and could not be separated from the first builder's work, so the whole tree is committed as it stands instead of discarded: `npm run check` passes (493 tests), nothing else is verified. Not done or not known to be done: the URL-state tests were being rewritten when it stopped; no shots compared; none of the reviewer's walks rerun (two tabs, URL states, 640×400 give-up, far-future record); `CLAUDE.md` and the SPEC decision lines not updated for the fixes.
- Next `/go` starts here: give a builder the four findings again (the brief is the last builder brief of this session; the reviewer's scripts are in the scratchpad `review-dailyflow/` if it still exists) with the task of finishing and proving them on this commit, then a full review, then tick.
- Carried forward for the client and server sub-steps: the server must replay every log and never trust stored ticks; anyone can practise a day's route (the seed derivation is open code), so the one try is enforced for the stored result here and per identity by the server.

## 2026-11-27: session stopped by the owner

- Done this session: step 16 finished and merged (PR #19, deployed): unlimited reviewed, settings, garage, loading line. Step 17 on branch `daily`: day number and the day's city and route, input log and replay, the name driftle, the simulation version, all ticked; the daily flow committed with a `fix` verdict and half-done fixes.
- Open for the owner: the repository and Pages address still say ASCII-Racer (the share link will point there); whether Pages should keep publishing on every merge; Esc in a daily asks before giving up (the lead's call, say if it should give up at once); a slide can park the car in a slot barely longer than itself; look items (menu flight mostly one composition, finish screen options over the car, garage floor more a patterned disc than a glow, magenta and violet close).
- To try by hand in a real browser, since only headless Chrome has: Esc with the mouse captured and in fullscreen, dead keys in the nickname field, everything else.
- The Mac: `caffeinate -ims` held through this session.

## 2026-11-27: step 17, daily flow finished and ticked

- A builder finished the four review fixes on top of the half-done commit. Two tabs and the far-future record were already complete in it and only needed proving; new code: `dailyStorageAllowed` in `dev/urlParams.ts` (a load with a daily `state` or any of `gate`, `car`, `tick`, `shot`, `drive`, `dnf`, `giveup`, `next` keeps the try in memory only) and the give-up question (drawn on every grid of 8 columns or more, clipped on the top row as a last resort; `drawHud` returns whether it is on the grid and Enter gives up only after a frame showed it; not asked outside the glyph modes).
- Reviewer: `pass`, on the built site with its own scenarios: two tabs (Enter on a stale pre-race screen shows the other tab's result, a stored finish is never replaced), no URL combination stores a result that wasn't driven on the real clock, the question can't be confirmed unseen (resize, render mode, fly camera, dev menu tried), records 2 and 400 days ahead are ignored and 1 day ahead kept. An honest daily with the dev menu's top speed changed stored 4921 ticks and `replayDaily` gives 4921: the daily uses the default car. Reload mid-race is did not finish; with `localStorage` throwing the daily still plays. 496 tests, all 44 shots byte-identical.
- Noted, not fixed: a hidden tab stops the frame loop and so the race and its clock (written into `SPEC.md` as accepted; the server replay can't see it either); on grids 8 to 17 columns wide only `give up?` may fit; a tab that loses to another tab's stored finish shows its own time in the banner and the stored one on the results (needs storage cleared mid-race to happen).
- Next: Supabase project files.

## 2026-11-27: step 17, Supabase project files (built, not reviewed, not ticked)

- Built: `supabase/config.jsonc` (CLI 3.4.0 writes jsonc, not toml; project id `driftle`, local ports 544xx because another local Supabase project of the owner's uses 543xx; anonymous sign-ins on, email, sms, studio, realtime, storage off), one migration with `attempts`, `runs` and `run_logs` (keys `(user_id, day)`, cascades from `auth.users`, checks for ticks, nickname, version and the log text; row level security on all three; the browser only selects its own attempts and the runs of days it has an attempt for; only the service role writes; logs unreadable), pgTAP tests (79 in `supabase/tests/`), `npm run db:start | db:test | db:stop`, a `database` job in `ci.yml` (never run on GitHub yet), paragraphs in `CLAUDE.md` and the README. The hosted project was not touched.
- The owner said stop about a minute into the review, so the reviewer was stopped without a verdict. The lead's own check: `npm run check` (496 tests), `db:test` 79 of 79 on a local stack, `supabase db lint` clean. Committed as it stands, sub-step not ticked.
- Next `/go` starts here: a full review of commit "Daily: Supabase project files" as a security boundary (the brief is the last reviewer brief of this session: attack the local stack over HTTP with the anon key and an anonymous sign-in, check the tests aren't vacuous, compare the constraints with `validNickname`, `MAX_RUN_TICKS`, `MAX_LOG_TEXT`), then tick. Docker has to be running (`orbctl start`).
- To paste into `SPEC.md` once reviewed: the local stack uses ports 544xx; sign-ups stay enabled because anonymous sign-ins count as sign-ups; a stored log must be base64url without padding; grants to the service role are written out in the migration.
- For later sub-steps: the constants 35999, 48004 and the nickname pattern are copied by hand into the migration (a test comparing them with the code is worth adding); `runs` exposes other players' `user_id`s to anyone with an attempt that day; `config.jsonc` is not applied to the hosted project, so anonymous sign-ins must be switched on there (dashboard or the deploy action), and the hosted Postgres should be 17; the repository already has the secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF`.

## 2026-11-27: session stopped by the owner

- Done this session: the daily flow's four review fixes finished, reviewed `pass`, ticked. Supabase project files built and committed unreviewed.
- Open for the owner, as before: the repository and Pages address still say ASCII-Racer; Esc in a daily asks before giving up; a hidden tab pauses a daily race (accepted in `SPEC.md`, say if it shouldn't be).
- The Mac: `caffeinate -i` stopped; OrbStack was started for the local database and stopped again.

## 2026-11-27: step 17, Supabase project files reviewed and ticked

- Reviewer on the unreviewed commit: `fix`, but only for the tests. The boundary itself held under attack on the local stack (anonymous sign-up, PostgREST and GraphQL with and without a token): no write by any route, no logs, no runs of a day without an own attempt, nothing through counts, embeds or errors; keys hold for the service role; the checks agree exactly with `validNickname`, `MAX_RUN_TICKS` and `MAX_LOG_TEXT`; the migration gives the same privileges under hosted-style defaults. The gap: a granted-back TRUNCATE or INSERT passed the suite (row level security doesn't stop TRUNCATE, and the local defaults would give it to `anon` on every new table).
- Second builder: `access.test.sql` pins the exact table privileges of `anon`, `public` and `authenticated` (and that the service role has its four), `schema.test.sql` has the newline, tab and non-ASCII cases, `supabase/.gitignore` covers `.env` files, `src/game/backendRules.test.ts` fails when the migration's numbers or nickname pattern drift from the code. 99 database tests, 500 Vitest tests. Checked by the lead: both suites, and a granted-back TRUNCATE now fails the suite.
- The `database` CI job has still never run on GitHub; the step's pull request will show it.
- For the next sub-steps (from the review): every new migration must revoke from `public`, `anon`, `authenticated` explicitly, functions too (`security definer` ones with `set search_path = ''`); the Edge Functions take `user_id` only from the verified JWT and `day` from the server clock, insert the attempt with `on conflict do nothing`, and write run and log in one transaction (one SQL function for the service role only); `max_rows` is 1000, so the histogram needs an aggregate function; decide what to do with runs of another `simulation_version`; `runs` shows other players' `user_id`; purging anonymous users would delete their past runs; anonymous sign-ins must be switched on in the hosted project and email off.

## 2026-11-28: step 17, Edge Functions

- `supabase/functions/start-attempt` and `submit-run`, with the logic as pure handlers in `_shared/handlers.ts` (store and clock passed in), HTTP in `_shared/http.ts`, PostgREST with the service key in `_shared/store.ts` (plain `fetch`, no supabase-js). They import the game's modules straight from `src/` (`_shared/game.ts`): the local edge runtime and its bundler take files outside `supabase/functions/`. `submit-run` checks cheapest first (body cap, shapes, version, nickname, day, attempt, an existing run answers without replaying, decode, `replayDaily`) and stores run and log in one transaction through the SQL function `store_run` (second migration, service role only). Tokens are checked with the auth server; `verify_jwt` is off for both. The nickname rule moved to `src/app/nickname.ts` (re-exported, unchanged).
- Commands: `npm run backend:test` (stack up, reset, 123 pgTAP tests, lint, 23 Deno unit tests, a 12-step end-to-end test over HTTP with a really driven log of today's daily), `backend:start`, `backend:stop`; the old `db:*` scripts are gone; CI job `backend`. Deno comes through npm.
- Measured locally: a real run 55 to 80 ms end to end (replay 32 ms warm); the worst case, 35 999 ticks that never finish, about 0.36 s; a 1 MB body refused in under 10 ms. The hosted limit is about 2 s of CPU.
- Reviewer: `pass`. It could not get a time stored that the server hadn't replayed: extra body fields, odd values, other days' logs, forged, expired, `alg: none`, service and deleted users' tokens, `rpc/store_run` from the browser, 12 parallel submits of one log and 9 of four different finishing logs (always exactly one run with its log). Node and Deno give the same ticks and log text for days 331, 330, 0 and -5.
- Lead's own small fix from the review: the tests now send a claimed `ticks: 1` in every submission, so trusting it would fail them.
- Noted, not fixed: one identity can send full-length non-finishing logs for ever (about 0.4 s of CPU each, nothing stored); the end-to-end test can fail if it runs across 00:00 UTC; a run is not tied to its attempt in time (written into `SPEC.md` as accepted).
- For the deploy action: push both migrations before the functions; keep `verify_jwt` off (from `config.jsonc` or `--no-verify-jwt`); make sure the deploy bundles the files outside `supabase/functions/` (a `--use-api` upload may not; Docker bundling does); the `SUPABASE_SECRET_KEYS` path in `serviceEnv` has never run (the local runtime only sets `SUPABASE_SERVICE_ROLE_KEY`), so check a real submit after the first deploy; anonymous sign-ins on, email off on the hosted project. The CI `backend` job has never run on GitHub (3 to 6 minutes cold, by the reviewer's guess).
- For the client: bearer token of the anonymous session; only the headers `authorization`, `x-client-info`, `apikey`, `content-type` pass the preflight; `start-attempt` before the countdown; treat `stored` and `alreadyStored` as success and show the server's ticks; `versionMismatch` means reload; a killed function may answer without CORS headers, which looks like being offline.

## 2026-11-28: step 17, deploy action

- `scripts/deploy-backend.mjs` (plain Node, 20 Vitest tests with the CLI and `fetch` stubbed; `--print` shows the steps with secrets masked): `deploy` links the project, pushes the migrations (`db push --remote --yes`, password from the environment), deploys both functions (the CLI's Docker bundler, which takes the `src/` imports; `verify_jwt: false` from `config.jsonc`), patches the hosted auth settings through the Management API only where they differ, and smoke-checks (OPTIONS and a preflight on both functions, a tokenless POST must answer 401 `unauthorized`, `/auth/v1/settings`), retrying for up to 4 minutes; `check` is a read-only `db push --remote --dry-run` for pull requests; `env` writes `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` for the site build. `deploy.yml`: job `backend` before `build`, all jobs only on `main`; `ci.yml`: job `hosted`, `permissions: contents: read`.
- Nothing could be run against the hosted project (the secrets live only in GitHub). The builder ran the real CLI against a local mock of the Management API and the smoke check against the local stack. Reviewer: `fix` for one thing, a manual run on a branch would have pushed unmerged migrations to production; plus the smoke wait (60 s, now 4 min), missing timeouts, CI permissions, three tests. A second builder applied them; the lead checked (520 tests, actionlint clean, the print modes).
- First real run: the pull request's `hosted` job (link and dry run), then the merge. Most likely trouble, from the review: the auth settings not yet visible to the smoke check after the first patch (rerun the job); `db push` not reaching the database; the bundler (the CLI pins an older edge runtime than the one tested locally); the hosted gateway answering the preflight differently (loosen that one assertion).
- For the owner: the access token in the repository secrets reaches every Supabase project of the account, and a pull request from a branch of this repository can use it; CAPTCHA for anonymous sign-ins is not set (it would need a token in the client).

## 2026-11-28: step 17, client

- The draft pull request #20 was opened early so the new CI jobs ran on GitHub: `check`, `backend` (56 s) and `hosted` all pass; `hosted` linked the hosted project and its dry run lists both migrations as still to push, so the token, ref and password work.
- `src/app/dailyBackend.ts` (pure: the contract's answers mapped to outcomes, the retry rules, one run sent at a time, transport, sign-in and timer passed in) and `dailyBackendBrowser.ts` (supabase-js loaded with `import()` when the daily is first opened, anonymous sign-in, the functions called with plain `fetch` and exactly `authorization`, `apikey`, `content-type`, every request with a timeout). `DailyRecord` has a new field `sent` (stored with the server's ticks, refused with the reason, or not yet). The results screen's line is a status. `@supabase/supabase-js` 2.119.0 is the one runtime dependency: its own chunk of 216 kB (56 kB gzip), the main chunk 206 kB (was 198).
- First review: `fix`. A sign-in request that never answered blocked everything until a reload (the library's requests had no timeout); `dayNotOpen` on the attempt counted as done, so a clock two minutes fast near midnight lost the run; a stale tab of an older version marked a newer run refused for good; a send in flight hid the next run. Second builder fixed all four; the same reviewer reran its scenarios on a fresh build against the local stack: `pass`. Black hole: `sending run...` for about 165 s, then unavailable, and after release one sign-up, one attempt, one run under the same user. Honest daily and two tabs: one attempt and one run each. The default build requests nothing but its own files. 556 tests, 44 shots byte-identical.
- Left: if the sign-in's first request starts more than about 5 s late (the chunk on a very slow line), the 20 s deadline can let a second sign-up overlap the first and the attempt and run could end up under two identities; the worst-case wait on `sending run...` is long; the hosted gateway (preflight, rate limit of 30 anonymous sign-ups per hour per address, CAPTCHA if ever switched on) is untested until the merge.
- For the results sub-step: `main.ts` must keep a handle to `browserBackend(...)`'s `client()` and `userId()`; read only once `sent.status === 'stored'`; rank against the server's ticks (`recordTicks`); `max_rows` is 1000, so the histogram needs an aggregate SQL function (with explicit revokes); the status line has a fixed width.

## 2026-11-28: step 17, results data

- The roadmap's results sub-step is split into its data and its screen.
- Third migration: `daily_results(run_day)` (security invoker, so it can never show more than the caller could select; execute for `authenticated` only) answers null without an own attempt for the day, else `count`, `own` (ticks, rank, slower; null without a run), `top` (ten rows of rank, nickname, ticks, own) and `histogram` (from, to, 48 counts; null with no runs). `src/app/dailyResults.ts`: the type, `parseDailyResults` (everything validated, never throws), `percentFaster`, `bucketOf`, `ownBucket`; the three constants are tied to the SQL by a test. 171 pgTAP tests, 15 end-to-end steps, 618 Vitest tests.
- Reviewer: `pass`. 88 answers over 19 generated days (0 to 20 000 runs, ties at rank 10 and at the cap, all-equal times, an outlier at 35 999) equal an independently written model as whole JSON; all pass the parser; 200 000 mutated answers never make it throw; one snapshot per call, so an answer can't contradict itself; 54 ms for a day of 100 000 runs. One stale sentence in `CLAUDE.md`, fixed by the lead.
- For the screen: `client.rpc('daily_results', { run_day })` then `parseDailyResults`; null means no attempt on the server (show unavailable); `own` is null without a stored run (board without a marker); the own row has no nickname from the server (use the settings' when it is outside the top ten); several rows can share rank 10; `count` can be 0; the last bucket can be the tallest; refetch every 30 to 60 s at most.

## 2026-11-28: step 17, results screen

- `src/hud/resultsBoard.ts` (histogram and top-times panels), `dailyScreens.ts` (the board layout in a dozen styles down to today's plain screen), `ResultsBoard` in `dailyBackend.ts` (fetch on opening, when stored, every 60 s; late, stale and other days' answers dropped), `src/dev/sampleBoard.ts` and the URL parameter `board=N` (dev/shot loads only) for pictures. Six new shots (`daily-board`, `-dnf`, `-first`, `-tiny`, `-empty`, `-glyph16`), 50 in all; the 44 older ones byte-identical. 648 tests.
- Against the local stack with 300 seeded runs, builder and reviewer each: an honest daily shows the rank, percentile, marked bar, count and top rows the database gives (`#194 of 426 faster than 54%`), updates on the refresh after more runs are inserted, makes no request from the menu, the pre-race screen, the race or unlimited, and stops after leaving; give up shows the board without a marker.
- Reviewer: `pass`. Lead looked at the shots: reads at a glance at 1280 x 720 and at glyph size 16.
- Look items left (the reviewer's and the builder's, none done): the last bucket holds the slow tail and stands as a wall at the right edge, a second peak on big days (dim it or set it apart); city glyphs show through the gaps between the panels; on 2 or 3 runs the bars are full-height slabs; the rank and percentile line is small under the big time; very large grids use only the middle third. Also: `shotBoard` in `main.ts` is cached by ticks only (dev loads).

## 2026-11-28: step 17, share text; step 17 done

- `src/app/share.ts` (`shareText`, `histogramLine`, the label rule), `src/app/clipboard.ts` (`navigator.clipboard.writeText`, else `execCommand('copy')`), `GAME_URL` beside `GAME_NAME`. The `dailyResults` state has a selected entry; `share` and `menu` / `play` for a finished try. Two new shots (`daily-board-menu`, `daily-ready-finished`), five finished-daily shots changed by the new entry, the other 45 byte-identical; 52 shots. 667 tests.
- Lead's change before review: the histogram line is always 24 bars (the brief had allowed 48 on big days, 50 characters).
- Reviewer: `fix` for one thing: `*` and `_` in the histogram line are formatting in Discord, Slack, WhatsApp and Telegram and vanish when pasted. Everything else held in the browser (the text equals the board on screen for seven sample days, Enter and click, the fallback without `navigator.clipboard`, the label's timing, both entries hit by the mouse at four sizes, did not finish unchanged). Lead's own small fix, as the reviewer suggested: `.` for empty and `:-=+#` for bars, with a test that no share text holds `*`, `_`, `~` or a backtick.
- Left: in a proportional font the line reads as dots rising to hashes, not as a chart (the bracketed bar still stands out); `entry=1` with `dnf=1` is silently ignored.
- Step 17 is complete. Next: the pull request out of draft, CI, merge. The merge is the first real deploy of the backend (migrations, functions, auth settings, smoke check) and the first site built with the backend's address.

## 2026-11-28: step 17 merged and deployed; step 18 started

- Step 17 merged as PR #20 (CI `check`, `backend`, `hosted` green on the last commit). The deploy ran clean the first time: `backend` 40 s (three migrations applied to the hosted project, both functions deployed at 139 kB each, auth settings: only email sign-in had to be switched off, anonymous sign-ins were already on; the smoke check passed on its second try, once the auth server had picked up the change), then the site build with the backend's address, then Pages.
- Checked from outside with only what the live site ships (nothing created): the live bundle holds the backend's address and publishable key and no secret key; both functions answer the browser's preflight themselves with 204 and exactly the allowed headers (the one guess left from the reviews holds); a call without a token, or with the publishable key as the token, gets 401 `unauthorized`; `attempts`, `runs`, `run_logs` and `daily_results` are refused to the publishable key (42501); `store_run` is not reachable; anonymous sign-ins on, email off. Live main chunk 220 kB (80 kB gzip).
- Not checked: a real daily on the live site (sign-in, `start-attempt`, `submit-run` with a replay under the hosted CPU limit, `daily_results`). The lead wanted to have one scripted daily played there under the nickname `test run`; the session's permission check refused it as a write to the production database, so it was not done and not worked around. For the owner: play today's daily on https://alexnajy.github.io/ASCII-Racer/ once; the results should say `run recorded` and then show the board with you first. If it says `leaderboard unavailable`, the browser's network tab shows which call failed.
- Branch `sound` for step 18; the first sub-step (audio setup) is with a builder.

## 2026-11-28: step 18, audio setup

- `src/audio/`: `audio.ts` (one `AudioContext` made on the first `keydown`, `pointerup` or `click`, capture phase; buses `world` and `interface` into a master gain, a limiter, the destination; an analyser for the dev page; `whenReady`, `bus`, `counted`, `context()`), `gain.ts` (`masterGain`: `(volume / 10) ^ 1.5`, 0 when muted), `tuning.ts`. The settings' volume and mute now work, with a 60 ms blip on a change. Dev menu page `Sound` (state, master gain, node count, level in dB, sliders); URL parameter `audio=debug`. No context under `shot` or `tick`. 691 tests, 52 shots byte-identical.
- Reviewer: `pass`, in headless Chrome with the gesture rule enforced: one context ever, gains right at every step and from stored settings, silence at 0 and mute, nothing queued while suspended, the page fine without Web Audio, typing a nickname and Esc untouched.
- For the next sub-steps (from the review): build sources in `whenReady` and connect them to `audio.bus('world')`; per-frame updates skip when `context()` is null; nothing handles a hidden tab yet, so the first looped sound must suspend the context or ramp the world bus down on `visibilitychange` or it drones on while the frame loop stands still; blips have no cap (30 in a few ms add up to -1 dBFS; a player can't do that).

## 2026-11-28: step 18, engine

- `src/audio/engine.ts`: a sawtooth and a square at the note, a sine an octave below, band-passed noise, through a resonant low-pass, a level gain and a 40 Hz high-pass into the `world` bus; an LFO wobbles the idle. `engineSound` (pure) gives note, level, cutoff, noise and wobble from speed, top speed and pedals: five virtual gears with hysteresis, one reverse gear. Driven every frame with `setTargetAtTime`; heard exactly when the car is drawn. The audio base fades the master on `visibilitychange`. Sliders for every number on the dev menu's Sound page. 714 tests, 52 shots byte-identical.
- Review: `fix`. Flat out into a wall, the bounce put the engine in the reverse gear where the throttle counted as braking: the roar fell under idle for 0.4 s, like a stall on every crash; braking dipped under idle; and most of the sound was below what small speakers play (60% of the idle's power at 18 Hz, the idle 16 dB under the settings blip through a 200 Hz high-pass). Sound elsewhere: silent and heard in the right states, no gear hunting, one graph ever, no clicks.
- Second builder, measured before and after: in reverse either pedal loads the engine; the brake cut applies only above idle; idle 50 Hz, less sub-octave, the high-pass, brighter coasting, more resonance, a calmer reverse, idle raised against full throttle. Idle through the small-speaker filter went from 13.6 dB to 7.4 dB under full throttle; peak into the limiter at volume 10 is -10 dB. Checked by the lead: the rule read, 714 tests.
- Nobody has heard it. Renders of a scripted drive, before and after the retune: `/private/tmp/claude-501/-Users-alexandernajy-Desktop-code-Racer-ASCII-Racer/4c0cd2df-855f-4c5d-9517-a15e2682f0c3/scratchpad/engine-fix/before.wav` and `engine.wav` (the scratchpad doesn't survive a reboot). If it sounds wrong, the sliders are on the dev menu's Sound page; the defaults are `src/audio/tuning.ts`.
- Not verified: a really hidden tab (headless Chrome never reports one; the event path is unit tested and was run with `document.hidden` stubbed).
