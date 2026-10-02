import './style.css';
import { createRenderTarget, resizeRenderTarget } from './gl/framebuffer.ts';
import { createProgram } from './gl/shader.ts';
import { lookAt, multiply, perspective, rotationY, translation, type Mat4, type Vec3 } from './math/mat4.ts';
import { box, FLOATS_PER_VERTEX } from './render/shapes.ts';
import vertexSource from './shaders/triangle.vert.glsl?raw';
import fragmentSource from './shaders/triangle.frag.glsl?raw';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) throw new Error('WebGL2 not supported');

const program = createProgram(gl, vertexSource, fragmentSource);
const matrixLocation = gl.getUniformLocation(program, 'u_matrix');
const colorLocation = gl.getUniformLocation(program, 'u_color');
const fogColorLocation = gl.getUniformLocation(program, 'u_fogColor');
const fogDistanceLocation = gl.getUniformLocation(program, 'u_fogDistance');
const positionLocation = gl.getAttribLocation(program, 'a_position');
const shadeLocation = gl.getAttribLocation(program, 'a_shade');

interface Mesh {
  vao: WebGLVertexArrayObject;
  vertexCount: number;
}

function uploadMesh(vertices: number[]): Mesh {
  const vao = gl!.createVertexArray();
  gl!.bindVertexArray(vao);

  const buffer = gl!.createBuffer();
  gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
  gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(vertices), gl!.STATIC_DRAW);

  const stride = FLOATS_PER_VERTEX * 4;
  gl!.enableVertexAttribArray(positionLocation);
  gl!.vertexAttribPointer(positionLocation, 3, gl!.FLOAT, false, stride, 0);
  gl!.enableVertexAttribArray(shadeLocation);
  gl!.vertexAttribPointer(shadeLocation, 1, gl!.FLOAT, false, stride, 3 * 4);

  gl!.bindVertexArray(null);
  return { vao, vertexCount: vertices.length / FLOATS_PER_VERTEX };
}

const triangle = uploadMesh([
   0.0,  0.5, 0.0, 1.0,
  -0.5, -0.5, 0.0, 1.0,
   0.5, -0.5, 0.0, 1.0,
]);

const GRID_HALF_SIZE = 50;
const gridVertices: number[] = [];
for (let i = -GRID_HALF_SIZE; i <= GRID_HALF_SIZE; i++) {
  gridVertices.push(i, 0, -GRID_HALF_SIZE, 1, i, 0, GRID_HALF_SIZE, 1);
  gridVertices.push(-GRID_HALF_SIZE, 0, i, 1, GRID_HALF_SIZE, 0, i, 1);
}
const grid = uploadMesh(gridVertices);

const cube = uploadMesh(box([-0.5, 0, -0.5], [0.5, 1, 0.5]));

const lampPost = uploadMesh([
  ...box([-0.05, 0, -0.05], [0.05, 2.2, 0.05]),
  ...box([-0.6, 2.1, -0.04], [0.05, 2.2, 0.04]),
]);
const lampHead = uploadMesh(box([-0.7, 1.95, -0.12], [-0.4, 2.1, 0.12]));

gl.enable(gl.DEPTH_TEST);

const SCENE_PIXEL_SIZE = 8;
const VIEW_DISTANCE = 15;
const scene = createRenderTarget(gl);

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  resizeRenderTarget(
    gl!,
    scene,
    Math.ceil(canvas.width / SCENE_PIXEL_SIZE),
    Math.ceil(canvas.height / SCENE_PIXEL_SIZE),
  );
}
window.addEventListener('resize', resize);
resize();

function draw(mesh: Mesh, mode: GLenum, matrix: Mat4, color: Vec3) {
  gl!.uniformMatrix4fv(matrixLocation, false, matrix);
  gl!.uniform3fv(colorLocation, color);
  gl!.bindVertexArray(mesh.vao);
  gl!.drawArrays(mode, 0, mesh.vertexCount);
}

function frame(timeMs: number) {
  const t = timeMs / 1000;
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, scene.framebuffer);
  gl!.viewport(0, 0, scene.width, scene.height);
  const background: Vec3 = [0.1, 0.1 + 0.1 * Math.sin(t), 0.2];
  gl!.clearColor(background[0], background[1], background[2], 1);
  gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

  gl!.useProgram(program);
  gl!.uniform3fv(fogColorLocation, background);
  gl!.uniform1f(fogDistanceLocation, VIEW_DISTANCE);
  const aspect = scene.width / scene.height;
  const projection = perspective(Math.PI / 3, aspect, 0.1, VIEW_DISTANCE);
  const view = lookAt([0, 1.5, 4], [0, 0.4, -1], [0, 1, 0]);
  const camera = multiply(projection, view);

  draw(grid, gl!.LINES, multiply(camera, translation(0, -0.5, 0)), [0.4, 0.45, 0.55]);
  draw(triangle, gl!.TRIANGLES, multiply(camera, rotationY(t)), [1.0, 0.5, 0.0]);
  draw(cube, gl!.TRIANGLES, multiply(camera, translation(-2.5, -0.5, -2.5)), [0.3, 0.7, 1.0]);

  const lamp = multiply(camera, translation(2.5, -0.5, -2.5));
  draw(lampPost, gl!.TRIANGLES, lamp, [0.6, 0.6, 0.65]);
  draw(lampHead, gl!.TRIANGLES, lamp, [1.0, 0.9, 0.4]);

  // Temporary: copy the hidden image to the screen until the full-screen pass exists.
  gl!.bindFramebuffer(gl!.READ_FRAMEBUFFER, scene.framebuffer);
  gl!.bindFramebuffer(gl!.DRAW_FRAMEBUFFER, null);
  gl!.blitFramebuffer(
    0, 0, scene.width, scene.height,
    0, 0, canvas.width, canvas.height,
    gl!.COLOR_BUFFER_BIT, gl!.NEAREST,
  );

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
