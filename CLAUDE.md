# ASCII Racer

A real 3D multiplayer driving game set in a city at night. It runs in the browser and is rendered entirely in ASCII characters. The scene is rendered in 3D on the GPU, then a shader pass converts it into a grid of text glyphs.

The night setting is the core of the look: darkness becomes empty cells, light becomes dense glyphs. Headlights, street lamps, lit windows and neon are what draw the city.

## Stack

- TypeScript (game logic, input, physics, game loop)
- WebGL2 + GLSL (all rendering, including the ASCII conversion)
- Vite (dev server and build)
- No 3D libraries. The renderer is written from scratch.

## Commands

- `npm run dev` — start the dev server (http://localhost:5173)
- `npm run build` — production build into `dist/`
- `npm run preview` — serve the production build locally

## Architecture

Rendering happens in two GPU passes every frame:

1. **Scene pass**: draw the 3D world (streets, buildings, cars, lights) into a small offscreen framebuffer. Outputs color, brightness and, later, normals and material IDs.
2. **ASCII pass**: a full-screen fragment shader. Each screen pixel finds its character cell, samples the scene buffer at the cell center, picks a glyph from a ramp, and looks up that glyph's shape in a font atlas texture.

The ASCII conversion must stay on the GPU. Never read pixels back to JavaScript for per-frame work.

Planned layout (create folders as they are needed, not ahead of time):

```
src/
  main.ts          entry point, game loop
  gl/              WebGL2 helpers (shader compile, buffers, framebuffers)
  render/          scene pass, ASCII pass, camera
  shaders/         .glsl files
  game/            car physics, city layout, input
  math/            vec3, mat4 and other math helpers
  dev/             developer tools (dev menu)
```

### How it works today

- `main.ts` holds setup and the frame loop: pass 1 draws into the `scene` render target, pass 2 draws the full-screen triangle with `ascii.frag.glsl`.
- The scene shaders are still named `triangle.vert.glsl` / `triangle.frag.glsl`. Each vertex is `x, y, z, r, g, b` (`render/shapes.ts`, `box()`): `box()` bakes a fixed per-face shade (fake lighting until step 8) into the colour. Matrices and fog are uniforms.
- The scene pass clears with alpha 0 and objects write alpha 1, so the ASCII pass can tell empty cells (drawn as solid background, no glyph) from objects. Material IDs for per-material glyph sets will use this channel later.
- Fog uses the true distance to the camera (length of the view-space position, per pixel), so it is a circle around the camera. It is clear up to `fogStart`, then fades linearly to the background colour at the view distance, which is also the far plane (the fog circle always fits inside it). The background is black for now. The vertex shader takes `u_modelView` and `u_projection` separately so view space is available.
- Cells are `settings.cellWidth` CSS px wide and 1.75× as tall, times `devicePixelRatio`. The scene render target has one pixel per cell, and the glyph atlas cells are exactly the cell size, so changing the cell size rebuilds the atlas.
- `GLYPH_RAMPS` is a list: one atlas row per ramp, all the same length, so more character sets can be added later.
- The camera is a position plus yaw and pitch (`render/camera.ts`). `game/input.ts` tracks held keys (by `event.code`) and pointer-locked mouse movement; `game/flyCamera.ts` moves the camera each frame using the frame time `dt`. The fly camera is a dev tool, not simulation, so it does not use the fixed timestep.
- Runtime settings (FOV, cell width, view distance, fog start, render mode) live in a `DevSettings` object edited by the dev menu (`dev/menu.ts`, backtick key). The dev menu is plain HTML on top of the canvas; that is fine because it is developer UI, not the game picture.

### City generation (`game/city.ts`)

The city is plain data (rectangles and zones) with no WebGL in it. The renderer, collisions and a future server all read the same data. Units are metres.

- **Grid**: 8×8 blocks of 60 m, 12 m roads, a road around the outside too. Centred on the origin, which is an intersection.
- **Ground**: roads are black so they draw no glyphs; only the white dashed centre lines show. Lines are 0.4 m wide (real paint is ~0.12 m) so they cover a cell at a distance, and dashes stop short of junctions. Pavements are raised 0.15 m so kerbs give each block an outline.
- **Zoning**, in this order:
  1. Downtown gradient: a seeded centre near the middle (`DOWNTOWN_OFFSET`); each block's mid density chance slides from 0.9 at the centre to 0.1 at `DOWNTOWN_RADIUS`. Distances are in blocks, not metres.
  2. Neighbour rules (N/E/S/W only, edge blocks have fewer): mid density with 3+ mid density neighbours becomes high-rise; then low density with 3+ low density neighbours becomes houses, unless it shares a side with a high-rise (diagonals across a crossing are fine); those stay shops as a buffer. These read a copy of the original zones so the order blocks are checked in doesn't matter.
  3. Plaza: at most one, a random high-rise whose 4 neighbours are all high-rises. Breaks up walls of towers.
  4. Specials: 1 park and the supermarket replace random low density blocks, the parking lot a random mid density block. Skipped if no candidate exists.
- **What zones mean**: low density = shops and low-rise, mid density = mid-rise, high-rise = towers, houses = 4 per block, set in towards the block centre with their yards facing the street, later separated by one cross-shaped fence along the block's centre lines (darkest area at night). Park, plaza and parking lot are open ground.
- **Outer wall**: a continuous ring of buildings one block deep around the outer road, so every street dead-ends at a building and the city seems to carry on. It is the boundary; `bounds` is the drivable area inside it.
  - Set back 3 m (`WALL_SETBACK`) behind a pavement ring (`wallPavement`), like the blocks. Corners are the remaining squares (57×57 m).
  - Each side (594 m by default) is made of fixed-width pieces so prefab designs fit: 21, 28 and 35 m (3, 4 and 5 units of `WALL_UNIT` = 7 m), plus one flex piece that takes the remainder.
  - Counts: units = floor(side / 7), minus one if the remainder is under `FLEX_MIN_WIDTH` (7 m), so the flex piece is always 7–13 m. Equal sets of the three widths (12 units each), then `WALL_EXTRAS` fills the leftover units (1 and 2 borrow a set). Works for any side of at least 84 m. Default: 7×21, 8×28, 6×35 and a 13 m flex.
  - Every side uses the same pieces in its own shuffled order (`shuffle`, Fisher-Yates, seeded with `blockSeed(seed, blocks + side)`), so the wall doesn't mirror the street grid. The flex piece is shuffled in like the others.
  - The flex piece stays open as an alley. Planned: a gate across its mouth (a real collision box, not an invisible barrier) with prefabs inside, such as dumpsters or a parked car.
- **Buildings** (`game/buildings.ts`, roadmap step 7): `generateBuildings(city, settings)` turns each block into a list of `Building`s (footprint `rect` + `height`), using a per-block generator (`blockSeed`). A `Record<Zone, BlockBuilder>` table picks the builder, so a new zone won't compile without one. Blocks are inset 3 m from the kerb (`inset`), and `split` cuts them into lots, touching or with 4 m alleys (`ALLEY_WIDTH`) between columns and rows. Probabilities live in `CitySettings` so the dev menu can change them. Heights are seeded random within a per-zone `Range` (the constants are the ranges):
  - Low density: up to 8 touching shops (3×3 lots, centre lot empty as a back yard), 6.5–15 m. Each lot is left empty with `lowDensityEmptyChance` (1 in 8), for a small car park later. Then a side's middle shop can merge with each of its corners (`lowDensityMergeChance`, 0.2) into one building with the middle shop's height, if both lots have a shop; each corner joins at most one side (sides checked in a fixed order), so merged shops stay rectangles. A block is a strip mall with `lowDensityStripMallChance` (0.1): a random corner and its two neighbouring lots (0-1-3, 1-2-5, 5-7-8 or 3-6-7) become its car park, and the other shops are never left empty.
  - Mid density: 2×2 mid-rises, 16–42 m. Alleys north-south and east-west are rolled separately (`midDensityAlleyChance`, 0.5), so a block gets none, one direction or both.
  - High-rise: one tower, 50–70% of the block's width and depth each, at a random spot, 50–120 m.
  - Houses: 4, one per quarter, in the corner nearest the block centre with a 2 m gap to the centre lines for the future fence, 14–18 m square-ish, 7–10 m tall.
  - Supermarket: one 10 m box on the half of the block away from a random street; the other half is its car park.
  - Park, plaza, parking lot: none.
  - Wall pieces: one building filling the whole piece, so neighbours touch, 10–37 m (`WALL_HEIGHT`, narrow pieces `NARROW_WALL_HEIGHT` 8–35 m). Own constants, separate from the zones, so game modes can change them. Flex pieces get none.
- Batching: all buildings are one mesh built once at startup with corners already in world position (`slab` per building), drawn in a single call. Pavements and wall slabs are one mesh each too. Buildings are all one colour for now.
- Building notes: Judge proportions (height, width, spacing), not looks; detail comes in roadmap step 10 (building models) by changing the per-zone shape functions. The boxes double as collision shapes. Later designs are either parametric (a function of footprint and height, e.g. several high-rise styles) or fixed-size prefabs (houses, kiosks) placed and rotated by the seed. The seed also picks a colour per building from a hand-picked palette per style; keep brightness similar within a palette so the glyphs stay the same. Colour is in the vertex data, so per-building and per-face colours only need a different colour passed to `box()`.
- Zone tints on the pavements and wall piece tints (by kind) in `main.ts` are temporary, for seeing the zoning and the wall order.

### Known limits

- Anything thinner than a cell (lines, thin poles) can vanish or flicker. Prefer filled surfaces over `gl.LINES`, and make thin real-world things chunky (hedges instead of wire fences, thick poles, big sign faces).
- Headless Chrome (SwiftShader) drops lines that cross behind the camera; real GPUs draw them. Only matters for headless screenshots.

## Roadmap

1. Full-screen WebGL2 canvas with a game loop (done when the screen clears every frame)
2. Draw a triangle (first vertex and fragment shaders)
3. 3D camera and a simple ground plane with perspective
4. Render to an offscreen framebuffer, then the ASCII pass with a glyph atlas
5. Fly camera: move freely through the scene with the keyboard and look around with the mouse
6. A city: street grid, zoning and an outer wall, as plain seeded data
7. Buildings: placeholder boxes on every block, batched into one mesh, collisions with buildings
8. Night lighting: dark by default, headlights, street lamps, lit windows and neon
9. A drivable car: keyboard input, acceleration, steering, grip, drift, weight transfer
10. Building models: parametric styles and fixed prefabs in place of the boxes, with seeded spawning rules per zone, lot and neighbourhood
11. Visual identity: per-material glyph sets, temporally stable glyphs (no flicker at speed), speed streaks
12. Menu + game modes
13. Multiplayer: a small server to connect players, other players' cars, rollback netcode

## Conventions

- Strict TypeScript. No `any` unless unavoidable and commented.
- Keep the simulation deterministic: fixed timestep for physics, separate from the render frame rate. Game state must be reproducible from inputs alone (needed for ghosts and rollback).
- Simulation code must give identical results in every browser. `Math.sin`, `Math.cos` etc. can differ between browsers, so the simulation will need its own deterministic versions before multiplayer. Rendering can use `Math` freely.
- The game client stays a static site (any static host works). Only multiplayer needs a server.
- Generation is seeded (`math/random.ts`, Mulberry32), never `Math.random()`. A seed is the city's ID: same seed, same city for every player. Results depend on the order of `random()` calls, so from roadmap step 7 on each block gets its own generator from the city seed and the block index (zoning uses one city-wide generator); adding a random call in one place then doesn't reshuffle the rest of the city.
- Open numbers (thresholds, sizes, counts) are named constants with a sensible default, tuned as we go; later exposed as dev menu sliders. Don't block on choosing them.
- Judge the look in glyph mode (and grey levels for whether shapes read), from driving height (~1.2 m). Full resolution mode is only for debugging geometry. Glyph choice follows brightness only; hue just tints the glyph, so brightness separates shapes.
- Detail smaller than ~1 m disappears beyond ~40 m (about 8 cells per metre at 20 m, 2 at 80 m). Buildings read by silhouette and height.
- Shaders live in `.glsl` files and are imported with Vite's `?raw` suffix.
- Only use comments neccesarily and professionally
- Commit after each small working step.
- One branch per roadmap step, merged into `main` with a pull request. Tick sub-steps in `README.md` as they are done.

## Working with me

This is a learning project, i want to understand how it works.

- Work in small steps. One concept at a time, never a whole feature in one go.
- Explain consisely and simply each new addition and the why
- Tell me where code goes (which file, which part of the file).
- You can write the code yourself; explain what it does and why. Ask before committing or changing things outside the current step.
- I'm on macOS, using VS Code and Chrome for development.
- I commit the code not you