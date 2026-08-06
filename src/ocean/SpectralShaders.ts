export const FULLSCREEN_VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const EVOLVE_SPECTRUM_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uH0;
uniform float uTime;
uniform float uGravity;
uniform float uPatchSize;
uniform float uResolution;
void main() {
  vec2 h0 = texture2D(uH0, vUv).rg;
  vec2 grid = (vUv - 0.5) * uResolution;
  vec2 k = grid * 6.28318530718 / uPatchSize;
  float omega = sqrt(uGravity * length(k));
  float c = cos(omega * uTime);
  float s = sin(omega * uTime);
  gl_FragColor = vec4(h0.x * c - h0.y * s, h0.x * s + h0.y * c, 0.0, 1.0);
}
`;

export const STOCKHAM_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uInput;
uniform float uStage;
uniform float uSize;
uniform float uHorizontal;
void main() {
  float span = exp2(uStage);
  vec2 axis = mix(vec2(0.0, 1.0 / uSize), vec2(1.0 / uSize, 0.0), uHorizontal);
  float index = mix(gl_FragCoord.y, gl_FragCoord.x, uHorizontal) - 0.5;
  float group = floor(index / (span * 2.0));
  float offset = mod(index, span);
  float a = group * span * 2.0 + offset;
  float b = a + span;
  vec2 base = vUv - axis * (index - a);
  vec2 A = texture2D(uInput, base).rg;
  vec2 B = texture2D(uInput, base + axis * (b - a)).rg;
  float angle = -3.14159265359 * offset / span;
  vec2 W = vec2(cos(angle), sin(angle));
  vec2 BW = vec2(B.x * W.x - B.y * W.y, B.x * W.y + B.y * W.x);
  vec2 outv = mod(index, span * 2.0) < span ? A + BW : A - BW;
  gl_FragColor = vec4(outv, 0.0, 1.0);
}
`;

export const ASSEMBLE_SURFACE_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uInput;
uniform float uSize;
uniform float uPatchSize;
uniform float uChoppiness;
uniform float uOutputMode;
void main() {
  vec2 texel = vec2(1.0 / uSize);
  float normalization = 1.0 / (uSize * uSize);
  float h = texture2D(uInput, vUv).r * normalization;
  float hL = texture2D(uInput, vUv - vec2(texel.x, 0.0)).r * normalization;
  float hR = texture2D(uInput, vUv + vec2(texel.x, 0.0)).r * normalization;
  float hD = texture2D(uInput, vUv - vec2(0.0, texel.y)).r * normalization;
  float hU = texture2D(uInput, vUv + vec2(0.0, texel.y)).r * normalization;
  float cell = uPatchSize / uSize;
  vec2 slope = vec2(hR - hL, hU - hD) / (2.0 * cell);
  vec2 curvature = vec2(hR - 2.0 * h + hL, hU - 2.0 * h + hD) / (cell * cell);
  float jacobian = clamp(1.0 - uChoppiness * (abs(curvature.x) + abs(curvature.y)), 0.0, 1.0);
  if (uOutputMode < 0.5) {
    gl_FragColor = vec4(-slope.x * uChoppiness, h, -slope.y * uChoppiness, 1.0);
  } else {
    gl_FragColor = vec4(slope, length(slope), jacobian);
  }
}
`;
