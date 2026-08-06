export const OCEAN_VERTEX_SHADER = /* glsl */ `
  #define MAX_WAVES 16
  const float TAU = 6.28318530718;
  uniform float uTime;
  uniform int uWaveCount;
  uniform vec4 uWaves[MAX_WAVES];
  uniform vec2 uWaveMeta[MAX_WAVES];
  uniform float uMinimumGeometryWavelength;
  uniform float uClipNearPatch;
  uniform sampler2D uDisplacement;
  uniform sampler2D uSlope;
  uniform sampler2D uDisplacementFar;
  uniform sampler2D uSlopeFar;
  uniform float uSpectralWeight;
  uniform float uSpectralPatchSize;
  uniform float uSpectralFarPatchSize;
  uniform float uSpectralCascadeWeight;
  uniform float uChoppiness;
  varying vec3 vWorldPosition;
  varying vec3 vWaveNormal;
  varying float vCrest;

  void main() {
    vec4 baseWorld = modelMatrix * vec4(position, 1.0);
    vec3 displaced = baseWorld.xyz;
    vec3 dX = vec3(1.0, 0.0, 0.0);
    vec3 dZ = vec3(0.0, 0.0, 1.0);
    float crestEnergy = 0.0;
    for (int index = 0; index < MAX_WAVES; index++) {
      if (index >= uWaveCount) break;
      vec4 wave = uWaves[index];
      vec2 meta = uWaveMeta[index];
      float wavelength = TAU / max(wave.w, 0.0001);
      float samplingWeight = smoothstep(
        uMinimumGeometryWavelength,
        uMinimumGeometryWavelength * 1.6,
        wavelength
      );
      float theta = wave.w * dot(wave.xy, baseWorld.xz) - meta.x * uTime + meta.y;
      float amplitude = wave.z * 1.28 * samplingWeight;
      float s = sin(theta);
      float c = cos(theta);
      float chop = min(0.58, amplitude * wave.w * 0.5) * mix(0.82, 1.32, uChoppiness);
      displaced.y += amplitude * s;
      displaced.x += wave.x * chop * c;
      displaced.z += wave.y * chop * c;
      float slope = amplitude * wave.w * c;
      dX.y += slope * wave.x;
      dZ.y += slope * wave.y;
      crestEnergy += max(0.0, s) * amplitude * wave.w;
    }
    vec2 spectralUv = fract(baseWorld.xz / uSpectralPatchSize + 0.5);
    vec3 spectralDisplacement = texture2D(uDisplacement, spectralUv).xyz;
    vec2 spectralFarUv = fract(baseWorld.xz / uSpectralFarPatchSize + 0.5);
    vec3 spectralFarDisplacement = texture2D(uDisplacementFar, spectralFarUv).xyz;
    displaced += (spectralDisplacement + spectralFarDisplacement * uSpectralCascadeWeight)
      * uSpectralWeight;
    vec2 spectralSlope = texture2D(uSlope, spectralUv).rg;
    vec2 spectralFarSlope = texture2D(uSlopeFar, spectralFarUv).rg;
    vec2 combinedSpectralSlope = spectralSlope + spectralFarSlope * uSpectralCascadeWeight;
    dX.y += combinedSpectralSlope.x * uSpectralWeight;
    dZ.y += combinedSpectralSlope.y * uSpectralWeight;
    vWorldPosition = displaced;
    vWaveNormal = normalize(cross(dZ, dX));
    vCrest = crestEnergy;
    gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
  }
`;

export const OCEAN_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uDeep, uMid, uLagoon, uHorizon, uSkyTop, uFoam, uSunColor, uSunDirection;
  uniform vec2 uIslandCenter, uIslandRadii, uNearCenter;
  uniform sampler2D uSlope;
  uniform sampler2D uSlopeFar;
  uniform sampler2D uShoreField;
  uniform vec4 uShoreBounds;
  uniform float uFoamThreshold, uClipNearPatch, uClipHalfExtent;
  uniform float uStormFactor, uSpectralPatchSize, uSpectralFarPatchSize, uSpectralCascadeWeight;
  uniform vec3 uLightningPosition[4];
  uniform vec3 uLightningColor[4];
  uniform float uLightningPower[4];
  uniform int uLightningCount;
  uniform float uFlashExposure;
  varying vec3 vWorldPosition;
  varying vec3 vWaveNormal;
  varying float vCrest;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float continuousNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float detailOctave(vec2 p, vec2 direction, float frequency, float speed, float phase) {
    float theta = dot(p, normalize(direction)) * frequency + uTime * speed + phase;
    float footprint = fwidth(theta);
    float visibility = 1.0 - smoothstep(0.35, 0.95, footprint);
    return cos(theta) * visibility;
  }

  void main() {
    vec2 nearDelta = abs(vWorldPosition.xz - uNearCenter);
    if (uClipNearPatch > 0.5 && max(nearDelta.x, nearDelta.y) < uClipHalfExtent) discard;

    vec2 p = vWorldPosition.xz;
    vec2 shoreUv = clamp(
      (p - uShoreBounds.xy) / max(uShoreBounds.zw - uShoreBounds.xy, vec2(0.001)),
      vec2(0.0),
      vec2(1.0)
    );
    float shoreDistance = texture2D(uShoreField, shoreUv).r * 32.0;
    float lagoon = 1.0 - smoothstep(0.0, 38.0, shoreDistance);
    float viewDistance = distance(cameraPosition.xz, p);
    float warpA = continuousNoise(p * 0.075 + vec2(uTime * 0.025, -uTime * 0.018)) * 2.0 - 1.0;
    float warpB = continuousNoise(p * 0.19 + vec2(-uTime * 0.045, uTime * 0.032)) * 2.0 - 1.0;
    vec2 warped = p + vec2(warpA * 3.2 + warpB * 0.8, warpB * 2.4 - warpA * 0.65);
    vec2 microSlope = vec2(
      detailOctave(warped, vec2(0.84, 0.54), 0.52, 1.22, 0.2 + warpB * 1.7)
        + detailOctave(warped, vec2(-0.28, 0.96), 1.12, -1.82, 1.4 + warpA * 2.1) * 0.58,
      detailOctave(warped, vec2(0.62, -0.78), 0.71, 1.46, 2.1 - warpA * 1.5)
        + detailOctave(warped, vec2(0.16, 0.99), 1.92, -2.2, 0.5 + warpB * 2.3) * 0.42
    ) * mix(0.16, 0.024, smoothstep(95.0, 390.0, viewDistance))
      * mix(1.0, 1.48, uStormFactor);

    float macroWeight = mix(0.38, 0.012, smoothstep(76.0, 245.0, viewDistance));
    vec3 macroNormal = normalize(mix(vec3(0.0, 1.0, 0.0), vWaveNormal, macroWeight));
    vec3 normal = normalize(macroNormal + vec3(microSlope.x, 0.0, microSlope.y));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float ndv = max(dot(normal, viewDirection), 0.0);
    float fresnel = 0.028 + 0.972 * pow(1.0 - ndv, 5.0);
    vec3 reflected = reflect(-viewDirection, normal);
    float skyHeight = clamp(reflected.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(uHorizon, uSkyTop, pow(skyHeight, 0.68));

    vec3 water = mix(uDeep, uMid, 0.38 + lagoon * 0.34);
    water = mix(water, uLagoon, lagoon * 0.62);
    float shallow = lagoon * (1.0 - smoothstep(1.5, 12.0, abs(shoreDistance)));
    float caustics = pow(abs(sin(p.x * 0.72 + uTime * 0.65) * sin(p.y * 0.61 - uTime * 0.48)), 5.0);
    caustics *= 0.45 + 0.55 * continuousNoise(p * 0.22 + uTime * 0.05);
    water += uSunColor * caustics * shallow * 0.075;

    vec3 halfVector = normalize(uSunDirection + viewDirection);
    float sharpGlitter = pow(max(dot(normal, halfVector), 0.0), 1150.0);
    float facetBreakup = 0.5 + 0.5 * detailOctave(warped, vec2(-0.73, 0.68), 2.85, 2.35, 0.9);
    float glitterBreakup = smoothstep(0.7, 0.92, continuousNoise(p * 1.8 + uTime * 0.3));
    glitterBreakup *= smoothstep(0.58, 0.9, facetBreakup);
    float sunGlitter = sharpGlitter * glitterBreakup * 0.72;

    float fineFacet = 0.5 + 0.5 * detailOctave(warped, vec2(0.93, 0.37), 2.35, 2.7, 1.6 + warpA);
    float fineBreakup = smoothstep(0.58, 0.84, continuousNoise(p * 0.72 - uTime * 0.11));
    float fineRipple = smoothstep(0.89, 0.985, fineFacet) * fineBreakup;
    fineRipple *= 1.0 - smoothstep(90.0, 360.0, viewDistance);

    vec2 spectralUv = fract(p / uSpectralPatchSize + 0.5);
    vec2 spectralFarUv = fract(p / uSpectralFarPatchSize + 0.5);
    float nearCompression = max(0.0, 1.0 - texture2D(uSlope, spectralUv).a);
    float farCompression = max(0.0, 1.0 - texture2D(uSlopeFar, spectralFarUv).a)
      * uSpectralCascadeWeight;
    float compression = max(nearCompression, farCompression);
    float steepFoam = smoothstep(mix(0.82, 0.58, uStormFactor), 0.96, compression);
    float shoreBreak = smoothstep(4.2, 0.2, abs(shoreDistance)) * smoothstep(0.25, 0.8, vCrest);
    float breakup = smoothstep(0.35, 0.74, continuousNoise(p * 0.41 + uTime * 0.08));
    float foam = clamp((steepFoam + shoreBreak) * breakup, 0.0, 0.9);

    // A lightning reflection is a collection of moving specular facets,
    // not a painted stripe. Distance falloff provides the energy scale;
    // the warped fine normal/noise field breaks the highlight into streaks.
    vec3 lightningSpecular = vec3(0.0);
    for (int index = 0; index < 4; index++) {
      if (index >= uLightningCount) break;
      vec3 toLightning = uLightningPosition[index] - vWorldPosition;
      float distanceSquared = max(dot(toLightning, toLightning), 36.0);
      vec3 lightDirection = normalize(toLightning);
      vec3 reflectedLightning = reflect(-lightDirection, normal);
      float alignment = max(dot(reflectedLightning, viewDirection), 0.0);
      float broadFacing = pow(alignment, mix(3.5, 9.0, 1.0 - uStormFactor * 0.35));
      float surfaceFacing = max(dot(normal, lightDirection), 0.0);
      float fractured = smoothstep(
        0.42,
        0.86,
        continuousNoise(warped * 0.76 + vec2(float(index) * 13.7, uTime * 0.18))
      );
      float filament = 0.35 + 0.65 * smoothstep(
        0.55,
        0.94,
        0.5 + 0.5 * detailOctave(
          warped,
          normalize(vec2(0.42 + float(index), 0.91 - float(index) * 0.13)),
          1.55 + float(index) * 0.21,
          1.7,
          float(index) * 1.9
        )
      );
      float irradiance = uLightningPower[index] / distanceSquared;
      lightningSpecular += uLightningColor[index]
        * irradiance
        * broadFacing
        * surfaceFacing
        * fractured
        * filament
        * 260.0;
    }

    vec3 color = mix(water, sky, fresnel * 0.58);
    color += uSunColor * sunGlitter * 0.18;
    color += mix(uLagoon, uHorizon, 0.55) * fineRipple * 0.012;
    color += lightningSpecular;
    color += vec3(0.36, 0.48, 0.7) * uFlashExposure * (0.018 + fresnel * 0.035);
    color = mix(color, uFoam, foam);
    float distanceHaze = smoothstep(280.0, 820.0, viewDistance);
    float farBlend = smoothstep(95.0, 360.0, viewDistance) * (1.0 - distanceHaze);
    float farNoise = continuousNoise(p * 0.37 + vec2(uTime * 0.035, -uTime * 0.022));
    farNoise = mix(farNoise, continuousNoise(p * 0.93 - vec2(uTime * 0.08, uTime * 0.045)), 0.38);
    float distantGlint = smoothstep(0.72, 0.91, farNoise) * farBlend;
    color += uHorizon * distantGlint * 0.055;
    color = mix(color, uHorizon, distanceHaze * 0.66);
    gl_FragColor = vec4(color, 1.0);
  }
`;
