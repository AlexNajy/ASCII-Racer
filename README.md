# driftle

The repository's working name is ASCII Racer.

A daily 3D racing game set in a city at night, running in the browser and drawn entirely in ASCII characters. The scene is rendered in 3D on the GPU with WebGL2, then a shader pass turns every frame into a grid of text glyphs. Darkness is empty space; headlights, street lamps and neon light up the city in characters.

Built from scratch with TypeScript, WebGL2 and GLSL. No 3D libraries.

Play it: https://alexnajy.github.io/ASCII-Racer/

## Running it

```
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve the production build locally
npm test          # run the tests once
npm run check     # type check, tests and build
npm run shots     # pictures from fixed camera spots into shots/ (needs Google Chrome)
```

## Controls

- Menu and finish screen: `Up` / `Down` or `W` / `S` to choose (wraps round), `Enter` to pick; or point at an entry and click
- Settings: `Up` / `Down` or `W` / `S` to choose, `Left` / `Right` or `A` / `D` to change volume and glyph size, `Enter` to switch mute and fullscreen or to type a nickname (`Enter` saves, `Esc` cancels); clicks work too (on the volume bar, on the glyph size's `<` `>`); saved in the browser. Its key list is `src/app/keys.ts`, the same as this list
- Garage: `Up` / `Down` or `W` / `S` to choose shape or colour, `Left` / `Right` or `A` / `D` to change it (wraps round), or click its `<` `>`; the car turns on a lit spot and shows each change at once; saved in the browser and used in every race
- Unlimited: a new random city and route each time; after the finish, `again` (same route), `next` (new city and route) or `menu`
- `Esc`: back to the menu (and releases the mouse)
- `W` / `S` or arrow keys: throttle / brake, `A` / `D`: steer, `Space`: drift
- Click (outside the menu and the finish screen): capture the mouse to look around
- `H`: headlights on and off
- `F`: toggle fullscreen
- Fly camera (switched on in the dev menu, View page, Movement):
  - `W` / `S`: fly forward / back along the view direction
  - `A` / `D`: fly left / right
  - `Space` / `Shift`: fly up / down
  - `Q` (hold): fly 5× faster
  - `E` (hold): fly 10× faster
- `` ` `` (backtick): toggle the dev menu, which frees the mouse while open (camera position, FOV, cell size, view distance, fog start, samples per cell, render mode, movement; city and building sliders on their own pages)

## Roadmap

- [x] **1. Game window**: full-screen WebGL2 canvas with a game loop that clears the screen every frame
- [x] **2. First triangle**: vertex and fragment shaders, vertex data, first draw call
  - [x] Write the vertex and fragment shaders
  - [x] Compile and link the shaders from TypeScript
  - [x] Upload the triangle's vertices to the GPU
  - [x] Draw it every frame
- [x] **3. 3D camera**: perspective projection and a ground plane
  - [x] Matrix maths: a small `mat4` helper (multiply, perspective, look-at)
  - [x] Uniforms: send a matrix from TypeScript to the vertex shader
  - [x] 3D positions: corners get a z coordinate
  - [x] Perspective: far things get smaller, and the stretching on resize goes away
  - [x] Camera: a view matrix that sets where we look from and where we look at
  - [x] Ground plane: a large grid of lines stretching to the horizon
- [x] **4. ASCII pass**: render to an offscreen framebuffer, then convert it to glyphs with a font atlas
  - [x] Framebuffer: draw the scene into a small hidden image instead of the screen
  - [x] Full-screen pass: a second program that shows that image on screen (blocky at first)
  - [x] Character cells: one scene pixel per cell, sized to fit the screen in characters
  - [x] Brightness: turn each cell's colour into a brightness value and a position on the glyph ramp
  - [x] Font atlas: draw the ramp's characters into a texture once at startup
  - [x] Glyphs: each cell copies its character's shape from the atlas, coloured by the scene
- [x] **5. Fly camera**: move freely through the scene with the keyboard and look around with the mouse
  - [x] Dev menu: a panel toggled with the backtick key to change FOV, cell size, view distance and render mode (glyphs, grey levels, blocky scene, full resolution)
  - [x] Keyboard input: keep track of which keys are held down
  - [x] Camera state: a position plus yaw (left/right) and pitch (up/down) angles, replacing the fixed look-at
  - [x] Movement: WASD moves along the view direction, Space/Shift up and down, at the same speed at any frame rate
  - [x] Mouse look: lock the pointer on click, mouse movement turns the camera, pitch limited so it can't flip over
  - [x] Speed boost and camera info: a key to fly faster, and the camera's position shown in the dev menu
- [x] **6. City**: street grid, zoning and an outer wall, as plain seeded data
  - [x] Seeded random: a small number generator that gives the same "random" numbers for the same seed
  - [x] City layout: block and road rectangles as plain data, separate from rendering
  - [x] Ground: black roads with dashed centre lines, raised pavement blocks
  - [x] Zoning: each block is randomly high or low density, shown as a pavement tint
  - [x] Neighbour rules: mid density blocks with enough mid density neighbours become high-rise, low density blocks surrounded by low density become houses
  - [x] Special blocks: a park and a supermarket replace low density blocks, a parking lot replaces a mid density block
  - [x] Outer wall: a continuous ring of blocks around the city that streets dead-end into
- [x] **7. Buildings**: placeholder boxes on every block, batched into one mesh, with collisions
  - [x] Per-block random: each block gets its own generator from the city seed and its index
  - [x] Buildings per zone: a simple box shape for each zone type, heights from the seed, one draw call each
  - [x] Outer wall pieces: each side cut into fixed 21, 28 and 35 m pieces plus one 7–13 m flex alley, in a seeded shuffled order, set back behind a pavement, one mid-rise height building per piece
  - [x] Vertex colour: colour stored per vertex instead of per draw call
  - [x] Batching: all buildings merged into one mesh
  - [x] City sliders: seed, block size, road width, density, building heights and lot chances on City and Buildings pages of the dev menu, regenerated live
  - [x] View distance and cleanup: remove the test shapes, set the far plane and fog for city scale
  - [x] Collisions: circle-vs-rectangle push-out for the fly camera, with a noclip toggle
- [x] **8. Lighting**: a dim moonlight base that shapes buildings, and things that glow (emission) instead of real lights
  - [x] Normals: per-vertex normals in `box()` (x, y, z, r, g, b, nx, ny, nz) and a second scene render target holding them, for lighting and later for orientation glyph sets (vertical ramp on walls, horizontal on ground and roofs)
  - [x] Street lights on low density, mid density and high-rise pavements, placed per road segment by spacing, staggered when both sides are lit
  - [x] Emission: a per-vertex emission value, so bulbs, windows and neon glow at full brightness without lighting anything; glyphs drawn in the cell's true colour
  - [x] Road widths: a width per road line, with seeded 4-lane avenues weighted towards downtown, lane markings per road type and a street light pattern per road type
  - [x] Intersections: traffic lights on avenues, all-way or two-way stop signs on streets depending on how many corner blocks are busy, and crosswalks
  - [x] Signal phases: a fixed 60 Hz world tick, a deterministic phase cycle (green, yellow, all red, walk and flashing hand), seeded offsets with green waves along avenues, switched on the GPU from a per-frame signal texture
  - [x] Pole collisions: street lights, traffic lights and stop signs collide like buildings
- [x] **9. Drivable car**: keyboard input, arcade acceleration, steering and drift, headlights (the only real lights: a few cones that light what they hit)
  - [x] Car state: position, heading and velocity as plain data, stepped once per 60 Hz tick
  - [x] Car model: the collision box drawn from the car state (a real model later)
  - [x] Chase camera: in Car movement mode the camera follows behind the car at driving height
  - [x] Driving input: throttle, brake, steering and drift read once per tick into an input record, so every tick gets exactly one input at any frame rate
  - [x] Acceleration and braking: acceleration fading towards top speed, coasting, the opposite pedal brakes then reverses
  - [x] Steering: arcade style, A/D turn the nose and the velocity catches up with it
  - [x] Drift: holding Space turns harder while the velocity lags behind (Mario Kart style), sliding scrubs speed, traction blends back once the slide dies down
  - [x] Dynamic chase camera: lags behind the car's turns, follows the slide while drifting, pulls back and widens the FOV with speed, tunable on a Camera page in the dev menu
  - [x] Camera out of walls: a ray from the car to the camera pulls it in front of anything in the way, snapping in and easing back out
  - [x] Car collisions: the car (a row of circles) is pushed out of buildings and poles, loses its speed into the wall and bounces back a little
  - [x] Smoothing between ticks: the car and camera are drawn between the last two ticks, so they don't jerk on screens faster than 60 Hz
  - [x] Deterministic maths: own sin and cos for the simulation, so every browser drives the same
  - [x] Car page in the dev menu: sliders for acceleration, steering and drift
  - [x] Headlights: a cone that lights what it hits in the scene shader
- [x] **10. Per-material glyph sets**: each material gets its own characters, settled before building models are tuned against them
  - [x] Material IDs: a material float in each vertex (separate from `id`), the scene pass writes it into the colour target's alpha (0 = empty, 1–255 = material), and the ASCII pass reads it per cell
  - [x] Glyph sets per material: one atlas row per set (building, road, curb); a set can repeat characters to force them. Buildings get `[` / `]` edge glyphs on the left and right of each face, skipped behind objects in front
  - [x] Animated sets: glyph picked from time and cell position as well as brightness, so things like fire flicker between `(` and `)` on their own. First case: a test pond in the park with a shimmering water set, with splashes on its shore
  - [x] Scatter sets: glyph picked by a random value from the surface's world position instead of brightness (grass, concrete), each set with its own pattern and settings
  - [x] Screen direction glyphs: strokes follow a surface's slope as seen on screen, derived from the normal in the ASCII pass (no tangents in the vertex data): a stroke set per direction (`|`, `\`, `-`, `/`) that materials opt into, sloped roofs `\` → `|` → `/` as you move around them; flat surfaces keep their ramp. First case: test gable roofs on the houses
- [x] **11. Building models**: real shapes in place of the boxes, with seeded spawning rules for which model goes where
  - [x] Floors: height = base + floors × floor height, from a few discrete options per zone
  - [x] House shapes: square or wide houses, square garages, neighbours joining into big houses
  - [x] Fences: a cross between house lots and along the sidewalk, open on each lot's entrance side
  - [x] Driveways: from the garage or front door to the entrance street
  - [x] Lot context: each lot knows which of its sides face a street (corner, middle, inner), so models can choose how much of it to fill
  - [x] Lot fillers: zone builders split into reusable building types (tower, mid-rise, shop, mall, open space), open lots kept as data
  - [x] High-rise layouts: weighted block layouts (one big building, a tower plus fillers, two towers with an alley)
  - [x] Merges: mid-rises joining neighbours, merged buildings getting more floors
  - [x] Model interface: a model gives geometry plus its own colliders from a lot; the first one is a box that fills it
  - [x] Parametric styles: several shape functions per zone (setbacks, roofs, shopfronts), each a function of footprint and height
  - [x] Prefabs: fixed-size models (houses, kiosks, dumpsters) placed and rotated by the seed
  - [x] Spawn rules: which styles and prefabs each zone, lot and neighbourhood can get, and how often
  - [x] Colour palettes: a hand-picked palette per style, one colour per building from the seed
  - [x] Lit windows and neon: emissive faces in the models, seeded per building
- [x] **12. Visual identity**: flicker-free glyphs at speed, particles
  - [x] Particles: GL points of size 1 in the one-pixel-per-cell scene target, so each particle is exactly one glyph (crash debris as flying `#`); visual only, so they don't need to be deterministic
  - [x] Flicker-free glyphs: glyphs stay stable while driving instead of flickering cell to cell
  - [x] Car model: body, cabin with glass, wheels, glowing headlights and tail lights that brighten while braking, on the same collision box
  - [x] Drift particles: bursts from the bottom of the rear tyres while sliding, like crash debris
- [x] **13. Checks**: what the loop uses to know a change works, see `SPEC.md` for the finished game
  - [x] Test runner: Vitest as a dev dependency, `npm test`, and `npm run check` running type check, tests and build
  - [x] Headless world: setup and the per-tick step moved out of `main.ts` into `game/world.ts` (no WebGL, no DOM), so Node can build a city and drive a car in it
  - [x] Determinism tests: the same seed and inputs give the same car state after thousands of ticks, and a stored hash of a reference run that only changes on purpose
  - [x] City tests over 200 seeds: nothing solid on a road, every junction reachable, no way out of the city, no props inside buildings
  - [x] Screenshots: `npm run shots` builds the game and saves glyph mode pictures from fixed camera spots with headless Chrome (URL parameters for seed, camera and mode), for looking at changes
  - [x] CI: a GitHub Action running `npm run check` on every pull request
  - [x] Deploy: a GitHub Action publishing `dist/` to GitHub Pages on every merge to `main`
- [x] **14. HUD**: drawn in the glyph grid, not as HTML
  - [x] Text layer: a full printable-character row in the atlas and a per-cell HUD texture (character + colour) written from TypeScript like a terminal, uploaded when it changes and drawn over the scene by the ASCII pass
  - [x] Speedometer
  - [x] Minimap: roads and the car, in a corner
- [x] **15. Routes**: a race from a seed
  - [x] Road graph: junctions and the segments between them as plain data from the city
  - [x] Route generator: start, ordered checkpoints and finish from a seed, by target length, no segment twice, with turns
  - [x] Route tests over 1000 seeds: every route valid, connected and inside the length range
  - [x] Race state in the simulation: countdown, running, finished, checkpoints crossed in order and direction, time in ticks
  - [x] Gates: glowing checkpoint and finish gates across the road, only the next one lit
  - [x] Race HUD: timer, checkpoint count, the route on the minimap, arrow to the next gate
  - [x] Test driver: a simple waypoint follower that finishes any route headless, used by the tests to prove routes can be driven and to tune `ROUTE_LENGTH`
  - [x] Pinned car: a fast sideways slide onto the pavement can leave a street-light pole inside the car's outline against the building, holding it for half a minute or more; the car must never end up wedged
  - [x] Wall seams: where two building rectangles touch along a flat wall, the seam acts like a corner and turns a sideways slide into speed along the wall; a flat wall made of several colliders must behave like one
- [x] **16. Menu and unlimited**
  - [x] Game states: menu, pre-race, race, results, with the dev fly camera kept behind the dev menu
  - [x] Main menu on the text layer over a camera flight through the city
  - [x] Unlimited: random city and route, finish screen with again, next and menu
  - [x] Settings: nickname, volume, glyph size, fullscreen, key list, saved in the browser
  - [x] Garage: body shapes on the same collision box, colour list, turning preview, saved in the browser
  - [x] Loading line while a city builds
- [ ] **17. Daily**: the main mode
  - [x] Day number from the UTC date, city seed and route from the day number
  - [x] Input recording: one input per tick packed into a compact log, and a headless replay that gives the same finish tick
  - [x] Name: the game is called driftle wherever a player sees it (menu title, page title, README heading; one constant for the share text and the release step to use)
  - [x] Simulation version constant, bumped by any change to simulation or generation (a test fails when the reference run changes without it)
  - [ ] Daily flow without a backend: pre-race screen, one try kept in the browser, results with time, countdown to the next day
  - [ ] Supabase project files: migrations for attempts and runs with row level security, anonymous sign-ins, local config
  - [ ] Edge Functions: start an attempt, check a run by replaying its inputs with the game's own simulation, tested with Deno
  - [ ] Deploy action for migrations and functions, skipped when the secrets are missing
  - [ ] Client: sign in, start attempt, send run, handle offline and errors
  - [ ] Results: rank, percentile, top times, bell curve histogram in glyphs with the player marked
  - [ ] Share text copied to the clipboard
- [ ] **18. Sound**: Web Audio API, no libraries, no sound files; reads the simulation state, never feeds back into it
  - [ ] Audio setup: audio context started on the first click or keypress, master volume and mute
  - [ ] Engine: a looped sound with pitch and volume from speed and throttle
  - [ ] Tires and impacts: a screech that fades in with drift, thuds by collision speed
  - [ ] Ambience: a low city hum
  - [ ] Race sounds: countdown, checkpoint, finish
- [ ] **19. Lobbies**
  - [ ] Minimap scale for large cities: a smaller cell count per block when the map would cover more than about a third of the screen height (10×10 cities on laptop screens)
  - [ ] Create lobby screen: settings, generated city, lobby code
  - [ ] Join lobby screen and lobby presence over Supabase Realtime
  - [ ] WebRTC data channels between players, signalled through the lobby
  - [ ] Other players' cars: garage look and nickname, driven from their inputs
  - [ ] Car against car collisions in the simulation
  - [ ] Rollback: late inputs rewind and replay the simulation, tested headless with simulated delay and loss
  - [ ] Lobby races: host starts a route, start grid, results board, back to free driving
  - [ ] Positional sound for other cars (`PannerNode`)
- [ ] **20. Release**
  - [ ] Page title, description, social preview image, favicon
  - [ ] Performance pass: 60 fps at default settings, first load size and time
  - [ ] Play through every mode from the built site and fix what breaks
  - [ ] README: what the game is, how to play, the link
