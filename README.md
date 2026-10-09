# ASCII Racer

A 3D multiplayer driving game set in a city at night, running in the browser and drawn entirely in ASCII characters. The scene is rendered in 3D on the GPU with WebGL2, then a shader pass turns every frame into a grid of text glyphs. Darkness is empty space; headlights, street lamps and neon light up the city in characters.

Built from scratch with TypeScript, WebGL2 and GLSL. No 3D libraries.

## Running it

```
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve the production build locally
```

## Controls

- Click: capture the mouse to look around (`Esc` releases it)
- `F`: toggle fullscreen
- `W` / `S`: fly forward / back along the view direction
- `A` / `D`: fly left / right
- `Space` / `Shift`: fly up / down
- `Q` (hold): fly 5× faster
- `E` (hold): fly 10× faster
- `` ` `` (backtick): toggle the dev menu, which frees the mouse while open (camera position, FOV, cell size, view distance, fog start, render mode, movement; city and building sliders on their own pages)

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
- [ ] **9. Drivable car**: keyboard input, acceleration, steering, grip, drift, weight transfer, headlights (the only real lights: a few cones that light what they hit)
  - [ ] Car state: position, heading and velocity as plain data, stepped once per 60 Hz tick
  - [ ] Car model: a simple body and wheels drawn from the car state
  - [ ] Chase camera: in Car movement mode the camera follows behind the car at driving height
  - [ ] Driving input: throttle, brake and steering read once per tick into an input record, so every tick gets exactly one input at any frame rate
  - [ ] Acceleration and braking: engine force, drag, rolling resistance, top speed and reverse
  - [ ] Steering: front wheels turn the car (bicycle model), less steering angle at speed
  - [ ] Grip: tyres push against sideways sliding, up to a limit
  - [ ] Drift: past the grip limit the rear slides out, plus a handbrake
  - [ ] Weight transfer: braking moves grip to the front axle, accelerating to the rear
  - [ ] Car collisions: the car's footprint against buildings and poles
  - [ ] Deterministic maths: own sin and cos for the simulation, so every browser drives the same
  - [ ] Car page in the dev menu: sliders for engine, grip and steering
  - [ ] Headlights: two cones that light what they hit in the scene shader
- [ ] **10. Per-material glyph sets**: each material gets its own characters, settled before building models are tuned against them
  - [ ] Material IDs: the vertex `id` slot carries a material, the scene pass writes it into the colour target's alpha (0 = empty, 1–255 = material), and the ASCII pass reads it per cell
  - [ ] Glyph sets per material: one atlas row per set; a set can repeat one or two characters to force them (signal lamps `( ) 0` as the first test, then neon and windows)
  - [ ] Animated sets: glyph picked from time and cell position as well as brightness, so things like fire flicker between `(` and `)` on their own
  - [ ] Orientation sets: separate ramps for walls and for ground and roofs, from the normals target
- [ ] **11. HUD**: drawn in the glyph grid, not as HTML
  - [ ] Text layer: a full printable-character row in the atlas and a per-cell HUD texture (character + colour) written from TypeScript like a terminal, uploaded when it changes and drawn over the scene by the ASCII pass
  - [ ] Speedometer
  - [ ] Timers and a minimap
- [ ] **12. Building models**: real shapes in place of the boxes, with seeded spawning rules for which model goes where
  - [ ] Floors: building heights snapped to whole floors
  - [ ] Parametric styles: several shape functions per zone (setbacks, roofs, shopfronts), each a function of footprint and height
  - [ ] Prefabs: fixed-size models (houses, kiosks, dumpsters) placed and rotated by the seed
  - [ ] Spawn rules: which styles and prefabs each zone, lot and neighbourhood can get, and how often
  - [ ] Colour palettes: a hand-picked palette per style, one colour per building from the seed
  - [ ] Lit windows and neon: emissive faces in the models, seeded per building
- [ ] **13. Visual identity**: flicker-free glyphs at speed, speed streaks, particles
  - [ ] Particles: GL points of size 1 in the one-pixel-per-cell scene target, so each particle is exactly one glyph (crash debris as flying `#`); visual only, so they don't need to be deterministic
  - [ ] Flicker-free glyphs: glyphs stay stable while driving instead of flickering cell to cell
  - [ ] Speed streaks
- [ ] **14. Menu + game modes**
  - [ ] Menus drawn with the HUD's text layer
  - [ ] Game modes
- [ ] **15. Multiplayer**: a small server to connect players, other players' cars, rollback netcode
