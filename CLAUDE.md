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
- The scene shaders are still named `triangle.vert.glsl` / `triangle.frag.glsl`. Each vertex is `x, y, z, shade` (`render/shapes.ts`, `box()`); colour, matrix and fog are uniforms set per draw.
- The scene pass clears with alpha 0 and objects write alpha 1, so the ASCII pass can tell empty cells (drawn as solid background, no glyph) from objects. Material IDs for per-material glyph sets will use this channel later.
- Fog uses `gl_Position.w` (distance in front of the camera) and fades to the background colour, which is black for now.
- Cells are `settings.cellWidth` CSS px wide and 1.75× as tall, times `devicePixelRatio`. The scene render target has one pixel per cell, and the glyph atlas cells are exactly the cell size, so changing the cell size rebuilds the atlas.
- `GLYPH_RAMPS` is a list: one atlas row per ramp, all the same length, so more character sets can be added later.
- The camera is a position plus yaw and pitch (`render/camera.ts`). `game/input.ts` tracks held keys (by `event.code`) and pointer-locked mouse movement; `game/flyCamera.ts` moves the camera each frame using the frame time `dt`. The fly camera is a dev tool, not simulation, so it does not use the fixed timestep.
- Runtime settings (FOV, cell width, view distance, render mode) live in a `DevSettings` object edited by the dev menu (`dev/menu.ts`, backtick key). The dev menu is plain HTML on top of the canvas; that is fine because it is developer UI, not the game picture.

### City generation (`game/city.ts`)

The city is plain data (rectangles and zones) with no WebGL in it. The renderer, collisions and a future server all read the same data. Units are metres.

- **Grid**: 8×8 blocks of 60 m, 12 m roads, a road around the outside too. Centred on the origin, which is an intersection.
- **Ground**: roads are black so they draw no glyphs; only the white dashed centre lines show. Lines are 0.4 m wide (real paint is ~0.12 m) so they cover a cell at a distance, and dashes stop short of junctions. Pavements are raised 0.15 m so kerbs give each block an outline.
- **Zoning**, in this order:
  1. Downtown gradient: a seeded centre near the middle (`DOWNTOWN_OFFSET`); each block's high density chance slides from 0.9 at the centre to 0.1 at `DOWNTOWN_RADIUS`. Distances are in blocks, not metres.
  2. Neighbour rules (N/E/S/W only, edge blocks have fewer): high density with 3+ high density neighbours becomes high-rise; low density with 3+ low density neighbours becomes houses. These read a copy of the original zones so the order blocks are checked in doesn't matter.
  3. Plaza: at most one, a random high-rise whose 4 neighbours are all high-rises. Breaks up walls of towers.
  4. Specials: 1 park and the supermarket replace random low density blocks, the parking lot a random high density block. Skipped if no candidate exists.
- **What zones mean**: low density = shops and low-rise, high density = mid-rise, high-rise = towers, houses = fenced houses (darkest area at night). Park, plaza and parking lot are open ground.
- **Outer wall**: a continuous ring of buildings one block deep around the outer road, so every street dead-ends at a building and the city seems to carry on. It is the boundary; `bounds` is the drivable area inside it. Currently four plain strips. Planned: cut into pieces matching what they face (60 m opposite blocks, 12 m plugs opposite streets, 60 m corners), zoned from the downtown gradient using only the plain density zones.
- **Buildings** (roadmap step 7, not built yet): placeholder boxes per zone, in a new `game/buildings.ts` that turns a block into a list of boxes. Heights are seeded random within a per-zone range (the constants are the ranges). Buildings are set back a few metres from the kerb. Park, plaza and parking lot get none. Judge proportions (height, width, spacing), not looks; detail comes in a later graphics revision by changing the per-zone shape functions. The boxes double as collision shapes. Later designs are either parametric (a function of footprint and height, e.g. several high-rise styles) or fixed-size prefabs (houses, kiosks) placed and rotated by the seed. The seed also picks a colour per building from a hand-picked palette per style; keep brightness similar within a palette so the glyphs stay the same. Per-building colour needs colour in the vertex data (the batching sub-step).
- Zone tints on the pavements in `main.ts` are temporary, for seeing the zoning.

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
10. Visual identity: per-material glyph sets, temporally stable glyphs (no flicker at speed), speed streaks
11. Multiplayer: a small server to connect players, other players' cars, rollback netcode

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