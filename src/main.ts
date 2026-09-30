import './style.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2');
if (!gl) throw new Error('WebGL2 not supported');

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
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);