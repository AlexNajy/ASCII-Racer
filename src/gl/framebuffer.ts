export interface RenderTarget {
  framebuffer: WebGLFramebuffer;
  colorTexture: WebGLTexture;
  normalTexture: WebGLTexture; // normals remapped from -1..1 to 0..1
  depthBuffer: WebGLRenderbuffer;
  width: number;
  height: number;
}

// Nearest filtering, so each pixel is read back exactly as written, never blended with its neighbours.
function createTargetTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export function createRenderTarget(gl: WebGL2RenderingContext): RenderTarget {
  return {
    framebuffer: gl.createFramebuffer(),
    colorTexture: createTargetTexture(gl),
    normalTexture: createTargetTexture(gl),
    depthBuffer: gl.createRenderbuffer(),
    width: 0,
    height: 0,
  };
}

export function resizeRenderTarget(
  gl: WebGL2RenderingContext,
  target: RenderTarget,
  width: number,
  height: number,
): void {
  target.width = width;
  target.height = height;

  for (const texture of [target.colorTexture, target.normalTexture]) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  gl.bindRenderbuffer(gl.RENDERBUFFER, target.depthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.colorTexture, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, target.normalTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, target.depthBuffer);
  // Fragment shader output 0 goes to the colour texture, output 1 to the normal texture.
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Framebuffer incomplete: ${status}`);
}
