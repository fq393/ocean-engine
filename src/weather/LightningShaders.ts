/**
 * View-aligned lightning capsules, adapted from lightning-sim's MIT-licensed
 * bolt renderer. The hard Gaussian core and inverse-square halo are evaluated
 * separately so the channel stays legible without becoming a soft tube.
 */
export const LIGHTNING_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec3 aColor;
  attribute float aIntensity;
  attribute float aRadius;

  uniform float uFovScale;
  uniform float uMinPixels;
  uniform float uWidthScale;

  varying vec2 vLocal;
  varying float vHalfLen;
  varying vec3 vColor;
  varying float vIntensity;

  void main() {
    vec3 startView = (modelViewMatrix * vec4(aStart, 1.0)).xyz;
    vec3 endView = (modelViewMatrix * vec4(aEnd, 1.0)).xyz;
    vec3 midpoint = 0.5 * (startView + endView);
    vec3 axis = endView - startView;
    float segmentLength = length(axis);
    axis = segmentLength < 0.000001 ? vec3(1.0, 0.0, 0.0) : axis / segmentLength;

    float distanceToCamera = max(0.001, -midpoint.z);
    float pixelWorldSize = uFovScale * distanceToCamera;
    float radius = max(aRadius * uWidthScale, uMinPixels * pixelWorldSize);
    vec3 eyeDirection = normalize(-midpoint);
    vec3 across = cross(axis, eyeDirection);
    float acrossLength = length(across);
    if (acrossLength < 0.0001) {
      across = normalize(cross(axis, vec3(0.0, 0.0, 1.0)));
    } else {
      across /= acrossLength;
    }

    float halfLength = 0.5 * segmentLength;
    float along = position.x * (halfLength + radius);
    float side = position.y * radius;
    vec3 viewPosition = midpoint + axis * along + across * side;
    vLocal = vec2(along, side) / radius;
    vHalfLen = halfLength / radius;
    vColor = aColor;
    vIntensity = aIntensity;
    gl_Position = projectionMatrix * vec4(viewPosition, 1.0);
  }
`;

export const LIGHTNING_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vLocal;
  varying float vHalfLen;
  varying vec3 vColor;
  varying float vIntensity;

  uniform float uCoreWidth;
  uniform float uGlowStrength;
  uniform float uExposure;

  void main() {
    float along = max(abs(vLocal.x) - vHalfLen, 0.0);
    float distanceFromChannel = length(vec2(along, vLocal.y));
    float core = exp(
      -(distanceFromChannel * distanceFromChannel) / (uCoreWidth * uCoreWidth)
    );
    float halo = 1.0 / (1.0 + 9.0 * distanceFromChannel * distanceFromChannel);
    halo *= halo;
    vec3 color = vColor * halo * uGlowStrength + vec3(1.0) * core * 2.2;
    if (core + halo < 0.002) discard;
    gl_FragColor = vec4(color * vIntensity * uExposure, 1.0);
  }
`;
