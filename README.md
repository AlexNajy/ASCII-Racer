# ASCII Racer

A 3D racing game that runs in the browser and is drawn entirely in ASCII characters. The scene is rendered in 3D on the GPU with WebGL2, then a shader pass turns every frame into a grid of text glyphs.

Built from scratch with TypeScript, WebGL2 and GLSL. No 3D libraries.

## Running it

```
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve the production build locally
```

## Roadmap

- [x] **1. Game window**: full-screen WebGL2 canvas with a game loop that clears the screen every frame
- [x] **2. First triangle**: vertex and fragment shaders, vertex data, first draw call
  - [x] Write the vertex and fragment shaders
  - [x] Compile and link the shaders from TypeScript
  - [x] Upload the triangle's vertices to the GPU
  - [x] Draw it every frame
- [ ] **3. 3D camera**: perspective projection and a ground plane
- [ ] **4. ASCII pass**: render to an offscreen framebuffer, then convert it to glyphs with a font atlas
- [ ] **5. Drivable car**: keyboard input, acceleration, steering
- [ ] **6. Track**: road geometry, boundaries, laps and timing
- [ ] **7. Car physics**: grip, drift, weight transfer
- [ ] **8. Visual identity**: per-material glyph sets, flicker-free glyphs at speed, speed streaks
- [ ] **Later**: multiplayer with rollback netcode
