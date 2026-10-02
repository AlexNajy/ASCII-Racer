// One row per ramp, one cell per character, white shapes on black.
export function createGlyphAtlas(
  gl: WebGL2RenderingContext,
  ramps: string[],
  cellWidth: number,
  cellHeight: number,
): WebGLTexture {
  const rampLength = [...ramps[0]].length;
  if (ramps.some((ramp) => [...ramp].length !== rampLength)) {
    throw new Error('All glyph ramps must have the same length');
  }

  const canvas = document.createElement('canvas');
  canvas.width = rampLength * cellWidth;
  canvas.height = ramps.length * cellHeight;
  const ctx = canvas.getContext('2d');
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

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
