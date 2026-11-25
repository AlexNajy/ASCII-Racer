import { BYTES_PER_CELL, type TextGrid } from './textGrid.ts';

// The text grid on the GPU: one RGBA8UI texel per cell, texel row 0 = grid row 0 (the top of the screen).
// Integer texels, so the shader gets exact character codes.
export interface HudTexture {
  texture: WebGLTexture;
  columns: number;
  rows: number;
}

const EMPTY = new Uint8Array(BYTES_PER_CELL);

export function createHudTexture(gl: WebGL2RenderingContext): HudTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Integer textures can't be filtered.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, 1, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, EMPTY);
  return { texture, columns: 0, rows: 0 };
}

// Sends the grid to the GPU only if it changed since the last upload. Leaves the texture bound.
export function uploadHud(gl: WebGL2RenderingContext, hud: HudTexture, grid: TextGrid): void {
  gl.bindTexture(gl.TEXTURE_2D, hud.texture);
  if (!grid.dirty) return;
  grid.dirty = false;
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (grid.columns === 0 || grid.rows === 0) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, 1, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, EMPTY);
    hud.columns = 0;
    hud.rows = 0;
    return;
  }
  if (grid.columns !== hud.columns || grid.rows !== hud.rows) {
    hud.columns = grid.columns;
    hud.rows = grid.rows;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, grid.columns, grid.rows, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, grid.data);
    return;
  }
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.columns, grid.rows, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, grid.data);
}
