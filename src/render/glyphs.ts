// Sharper glyphs on walls seen at a grazing angle.
const MAX_ANISOTROPY = 8;

// One row per ramp, one cell per character, white shapes on black.
function drawGlyphs(ramps: string[], cellWidth: number, cellHeight: number): HTMLCanvasElement {
  const rampLength = [...ramps[0]].length;
  if (ramps.some((ramp) => [...ramp].length !== rampLength)) {
    throw new Error('All glyph ramps must have the same length');
  }

  const canvas = document.createElement('canvas');
  canvas.width = rampLength * cellWidth;
  canvas.height = ramps.length * cellHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D not supported');

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.font = `${Math.floor(cellHeight * 0.8)}px Menlo, Monaco, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ramps.forEach((ramp, row) => {
    [...ramp].forEach((char, column) => {
      ctx.fillText(char, (column + 0.5) * cellWidth, (row + 0.5) * cellHeight);
    });
  });
  return canvas;
}

export function createGlyphAtlas(
  gl: WebGL2RenderingContext,
  ramps: string[],
  cellWidth: number,
  cellHeight: number,
): WebGLTexture {
  const canvas = drawGlyphs(ramps, cellWidth, cellHeight);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const FAR = 1e20;

// Squared distance along one line to the nearest zero in f (Felzenszwalb & Huttenlocher): the lower envelope of
// one parabola per sample.
function distanceLine(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < n; q++) {
    let s: number;
    do {
      const r = v[k];
      s = (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r);
    } while (s <= z[k] && --k >= 0);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) ** 2 + f[v[k]];
  }
}

// Distance from every pixel to the nearest pixel where target is set, in pixels.
function distances(target: Uint8Array, width: number, height: number): Float64Array {
  const grid = new Float64Array(width * height);
  for (let i = 0; i < grid.length; i++) grid[i] = target[i] ? 0 : FAR;
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    distanceLine(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    distanceLine(f, width, d, v, z);
    for (let x = 0; x < width; x++) grid[y * width + x] = Math.sqrt(d[x]);
  }
  return grid;
}

// World glyphs: red holds a signed distance field (0.5 on the outline, higher inside, reaching 0 or 1 `spread`
// texels away), so outlines stay sharp at any size; green holds the plain ink, for glyphs too small for that.
// Mipmapped. Each cell is transformed on its own, so glyphs never reach into their neighbours.
export function createDistanceGlyphAtlas(
  gl: WebGL2RenderingContext,
  ramps: string[],
  cellWidth: number,
  cellHeight: number,
  spread: number,
): WebGLTexture {
  const canvas = drawGlyphs(ramps, cellWidth, cellHeight);
  const ink = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  const inside = new Uint8Array(cellWidth * cellHeight);
  const outside = new Uint8Array(cellWidth * cellHeight);
  for (let cellY = 0; cellY < canvas.height; cellY += cellHeight) {
    for (let cellX = 0; cellX < canvas.width; cellX += cellWidth) {
      const at = (x: number, y: number) => ((cellY + y) * canvas.width + cellX + x) * 4;
      for (let y = 0; y < cellHeight; y++) {
        for (let x = 0; x < cellWidth; x++) {
          inside[y * cellWidth + x] = ink[at(x, y)] > 127 ? 1 : 0;
          outside[y * cellWidth + x] = 1 - inside[y * cellWidth + x];
        }
      }
      const toInk = distances(inside, cellWidth, cellHeight);
      const toBlank = distances(outside, cellWidth, cellHeight);
      for (let y = 0; y < cellHeight; y++) {
        for (let x = 0; x < cellWidth; x++) {
          const i = y * cellWidth + x;
          // Pixel centres are half a pixel from the outline between an inked and a blank pixel.
          const signed = inside[i] ? toBlank[i] - 0.5 : 0.5 - toInk[i];
          const p = at(x, y);
          pixels[p] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + signed / (2 * spread))));
          pixels[p + 1] = ink[p];
          pixels[p + 3] = 255;
        }
      }
    }
  }

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const anisotropic = gl.getExtension('EXT_texture_filter_anisotropic');
  if (anisotropic) {
    const max = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
    gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(MAX_ANISOTROPY, max));
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
