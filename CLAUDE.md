# ASCII Racer

A real 3D racing game that runs in the browser and is rendered entirely in ASCII characters. The scene is rendered in 3D on the GPU, then a shader pass converts it into a grid of text glyphs.

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

1. **Scene pass**: draw the 3D world (track, cars, environment) into a small offscreen framebuffer. Outputs color, brightness and, later, normals and material IDs.
2. **ASCII pass**: a full-screen fragment shader. Each screen pixel finds its character cell, samples the scene buffer at the cell center, picks a glyph from a ramp, and looks up that glyph's shape in a font atlas texture.

The ASCII conversion must stay on the GPU. Never read pixels back to JavaScript for per-frame work.

Planned layout (create folders as they are needed, not ahead of time):

```
src/
  main.ts          entry point, game loop
  gl/              WebGL2 helpers (shader compile, buffers, framebuffers)
  render/          scene pass, ASCII pass, camera
  shaders/         .glsl files
  game/            car physics, track, laps, input
  math/            vec3, mat4 and other math helpers
```

## Roadmap

1. Full-screen WebGL2 canvas with a game loop (done when the screen clears every frame)
2. Draw a triangle (first vertex and fragment shaders)
3. 3D camera and a simple ground plane with perspective
4. Render to an offscreen framebuffer, then the ASCII pass with a glyph atlas
5. A drivable car: keyboard input, acceleration, steering
6. A track: road geometry, boundaries, laps and timing
7. Car physics: grip, drift, weight transfer
8. Visual identity: per-material glyph sets, temporally stable glyphs (no flicker at speed), speed streaks
10. Later: multiplayer with rollback netcode

## Conventions

- Strict TypeScript. No `any` unless unavoidable and commented.
- Keep the simulation deterministic: fixed timestep for physics, separate from the render frame rate. Game state must be reproducible from inputs alone (needed for ghosts and rollback).
- Shaders live in `.glsl` files and are imported with Vite's `?raw` suffix.
- Commit after each small working step.

## Working with me

This is a learning project, i want to understand how it works.

- Work in small steps. One concept at a time, never a whole feature in one go.
- Explain consisely and simply each new addition and the why
- Tell me where code goes (which file, which part of the file).
- I'm on macOS, using VS Code and Chrome for development.