import type { Light, SignalState } from '../game/signals.ts';

// The current traffic signals as a texture the scene shader can read: one texel per junction, red channel
// for the column road, green channel for the row road. Integer texels, so the shader gets exact numbers.
const LIGHT_CODES: Record<Light, number> = { red: 0, yellow: 1, green: 2 };

export interface SignalTexture {
  texture: WebGLTexture;
  data: Uint8Array;
}

export function createSignalTexture(gl: WebGL2RenderingContext, junctionCount: number): SignalTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Integer textures can't be filtered.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG8UI, junctionCount, 1);
  return { texture, data: new Uint8Array(junctionCount * 2) };
}

// Sends this frame's signals to the GPU. A few hundred bytes, so it's fine every frame.
export function updateSignalTexture(gl: WebGL2RenderingContext, signals: SignalTexture, states: SignalState[]): void {
  states.forEach(({ column, row }, junction) => {
    signals.data[junction * 2] = LIGHT_CODES[column];
    signals.data[junction * 2 + 1] = LIGHT_CODES[row];
  });
  gl.bindTexture(gl.TEXTURE_2D, signals.texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, 1, gl.RG_INTEGER, gl.UNSIGNED_BYTE, signals.data);
}
