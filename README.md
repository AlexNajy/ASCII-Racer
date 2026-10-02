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
- `W` / `S`: fly forward / back along the view direction
- `A` / `D`: fly left / right
- `Space` / `Shift`: fly up / down
- `Q` (hold): fly 4× faster
- `` ` `` (backtick): toggle the dev menu (camera position, FOV, cell size, view distance, render mode)

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
  - [x] Dev menu: a panel toggled with the backtick key to change FOV, cell size, view distance and render mode (glyphs, grey levels, blocky scene)
  - [x] Keyboard input: keep track of which keys are held down
  - [x] Camera state: a position plus yaw (left/right) and pitch (up/down) angles, replacing the fixed look-at
  - [x] Movement: WASD moves along the view direction, Space/Shift up and down, at the same speed at any frame rate
  - [x] Mouse look: lock the pointer on click, mouse movement turns the camera, pitch limited so it can't flip over
  - [x] Speed boost and camera info: a key to fly faster, and the camera's position shown in the dev menu
- [ ] **6. City**: street grid, buildings built from boxes, collisions with buildings
- [ ] **7. Night lighting**: dark by default, headlights, street lamps, lit windows and neon
- [ ] **8. Drivable car**: keyboard input, acceleration, steering, grip, drift, weight transfer
- [ ] **9. Visual identity**: per-material glyph sets, flicker-free glyphs at speed, speed streaks
- [ ] **10. Multiplayer**: a small server to connect players, other players' cars, rollback netcode
