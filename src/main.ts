import './style.css';
import { createProgram } from './gl/shader.ts';
import { lookAt, multiply, perspective, rotationY, translation } from './math/mat4.ts';
import vertexSource from './shaders/triangle.vert.glsl?raw';
import fragmentSource from './shaders/triangle.frag.glsl?raw';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2');
if (!gl) throw new Error('WebGL2 not supported');

const program = createProgram(gl, vertexSource, fragmentSource);
const matrixLocation = gl.getUniformLocation(program, 'u_matrix');
const colorLocation = gl.getUniformLocation(program, 'u_color');
const positionLocation = gl.getAttribLocation(program, 'a_position');

function uploadPositions(positions: Float32Array): WebGLVertexArrayObject {
  const vao = gl!.createVertexArray();
  gl!.bindVertexArray(vao);

  const buffer = gl!.createBuffer();
  gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
  gl!.bufferData(gl!.ARRAY_BUFFER, positions, gl!.STATIC_DRAW);

  gl!.enableVertexAttribArray(positionLocation);
  gl!.vertexAttribPointer(positionLocation, 3, gl!.FLOAT, false, 0, 0);

  gl!.bindVertexArray(null);
  return vao;
}

const triangle = uploadPositions(new Float32Array([
   0.0,  0.5, 0.0,
  -0.5, -0.5, 0.0,
   0.5, -0.5, 0.0,
]));

const GRID_HALF_SIZE = 50;
const gridPoints: number[] = [];
for (let i = -GRID_HALF_SIZE; i <= GRID_HALF_SIZE; i++) {
  gridPoints.push(i, 0, -GRID_HALF_SIZE, i, 0, GRID_HALF_SIZE);
  gridPoints.push(-GRID_HALF_SIZE, 0, i, GRID_HALF_SIZE, 0, i);
}
const grid = uploadPositions(new Float32Array(gridPoints));
const gridVertexCount = gridPoints.length / 3;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  gl!.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

function frame(timeMs: number) {
  const t = timeMs / 1000;
  gl!.clearColor(0.1, 0.1 + 0.1 * Math.sin(t), 0.2, 1);
  gl!.clear(gl!.COLOR_BUFFER_BIT);

  gl!.useProgram(program);
  const aspect = canvas.width / canvas.height;
  const projection = perspective(Math.PI / 3, aspect, 0.1, 100);
  const view = lookAt([0, 1, 2.5], [0, 0, 0], [0, 1, 0]);
  const camera = multiply(projection, view);

  gl!.uniformMatrix4fv(matrixLocation, false, multiply(camera, translation(0, -0.5, 0)));
  gl!.uniform3f(colorLocation, 0.4, 0.45, 0.55);
  gl!.bindVertexArray(grid);
  gl!.drawArrays(gl!.LINES, 0, gridVertexCount);

  gl!.uniformMatrix4fv(matrixLocation, false, multiply(camera, rotationY(t)));
  gl!.uniform3f(colorLocation, 1.0, 0.5, 0.0);
  gl!.bindVertexArray(triangle);
  gl!.drawArrays(gl!.TRIANGLES, 0, 3);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);