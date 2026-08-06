import * as THREE from 'three';
import type { RainQualityTier } from './RainSystem';
import type { WeatherFrame } from './types';
import type { SkySystem } from '../visual/SkySystem';

const CLEAR_TOP = new THREE.Color('#3b91cf');
const STORM_TOP = new THREE.Color('#101d2c');
const CLEAR_HORIZON = new THREE.Color('#c9edf3');
const STORM_HORIZON = new THREE.Color('#52636f');
const CLEAR_SUN = new THREE.Color('#fff1c7');
const STORM_SUN = new THREE.Color('#91a7b8');

export interface StormAtmosphereSample {
  readonly top: THREE.Color;
  readonly horizon: THREE.Color;
  readonly sun: THREE.Color;
  readonly fogDensity: number;
  readonly hemisphereIntensity: number;
  readonly sunIntensity: number;
  readonly environmentIntensity: number;
}

export function sampleStormAtmosphere(value: number): StormAtmosphereSample {
  const factor = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
  return {
    top: CLEAR_TOP.clone().lerp(STORM_TOP, factor),
    horizon: CLEAR_HORIZON.clone().lerp(STORM_HORIZON, factor),
    sun: CLEAR_SUN.clone().lerp(STORM_SUN, factor),
    fogDensity: THREE.MathUtils.lerp(0.0016, 0.0062, factor),
    hemisphereIntensity: THREE.MathUtils.lerp(0.9, 0.28, factor),
    sunIntensity: THREE.MathUtils.lerp(2.55, 0.32, factor),
    environmentIntensity: THREE.MathUtils.lerp(0.5, 0.18, factor),
  };
}

export interface StormSkySystemOptions {
  readonly sky: SkySystem;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly hemisphere: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly quality?: RainQualityTier;
}

export function cloudOctavesForTier(quality: RainQualityTier): number {
  if (quality === 'high') return 5;
  if (quality === 'medium') return 4;
  return 3;
}

const CLOUD_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CLOUD_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uClouds;
  uniform float uFlashExposure;
  uniform float uLayer;
  uniform int uOctaves;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.54;
    for (int octave = 0; octave < 5; octave++) {
      if (octave >= uOctaves) break;
      value += noise(p) * amplitude;
      p = p * 2.04 + vec2(11.7, 7.3);
      amplitude *= 0.49;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    vec2 drift = vec2(uTime * (0.006 + uLayer * 0.003), -uTime * 0.0025);
    float broad = fbm(uv * vec2(4.2, 2.15) + drift + uLayer * 17.0);
    float detail = fbm(uv * vec2(10.0, 5.1) - drift * 1.8 + uLayer * 31.0);
    float density = smoothstep(0.42, 0.79, broad * 0.83 + detail * 0.28);
    float edge = smoothstep(0.0, 0.13, uv.x)
      * smoothstep(0.0, 0.13, 1.0 - uv.x)
      * smoothstep(0.0, 0.22, uv.y)
      * smoothstep(0.0, 0.22, 1.0 - uv.y);
    float lower = smoothstep(0.95, 0.18, uv.y);
    float alpha = density * edge * mix(0.28, 0.48, lower) * uClouds;
    vec3 shadow = mix(vec3(0.14, 0.2, 0.27), vec3(0.27, 0.34, 0.4), detail);
    vec3 flash = vec3(0.56, 0.68, 0.82) * uFlashExposure * (0.22 + detail * 0.38);
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(shadow + flash, alpha);
  }
`;

function createCloudMaterial(layer: number, octaves: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERTEX_SHADER,
    fragmentShader: CLOUD_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uClouds: { value: 0 },
      uFlashExposure: { value: 0 },
      uLayer: { value: layer },
      uOctaves: { value: octaves },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export class StormSkySystem {
  readonly root = new THREE.Group();
  readonly #sky: SkySystem;
  readonly #scene: THREE.Scene;
  readonly #camera: THREE.Camera;
  readonly #hemisphere: THREE.HemisphereLight;
  readonly #sun: THREE.DirectionalLight;
  readonly #geometry = new THREE.PlaneGeometry(720, 190, 1, 1);
  readonly #materials: readonly [THREE.ShaderMaterial, THREE.ShaderMaterial];
  readonly #currentTop = new THREE.Color();
  readonly #currentHorizon = new THREE.Color();
  readonly #currentSun = new THREE.Color();
  #disposed = false;

  constructor(options: StormSkySystemOptions) {
    this.#sky = options.sky;
    this.#scene = options.scene;
    this.#camera = options.camera;
    this.#hemisphere = options.hemisphere;
    this.#sun = options.sun;
    const octaves = cloudOctavesForTier(options.quality ?? 'medium');
    this.#materials = [createCloudMaterial(0, octaves), createCloudMaterial(1, octaves)];
    const distant = new THREE.Mesh(this.#geometry, this.#materials[0]);
    distant.position.set(-70, 100, -430);
    distant.scale.set(1.08, 1, 1);
    const near = new THREE.Mesh(this.#geometry, this.#materials[1]);
    near.position.set(120, 64, -315);
    near.scale.set(0.72, 0.66, 1);
    for (const cloud of [distant, near]) {
      cloud.frustumCulled = false;
      cloud.renderOrder = -0.5;
    }
    this.root.name = 'stormSky';
    this.root.add(distant, near);
  }

  update(frame: Readonly<WeatherFrame>, time: number): void {
    if (this.#disposed) return;
    const factor = THREE.MathUtils.clamp(frame.stormFactor, 0, 1);
    this.#currentTop.lerpColors(CLEAR_TOP, STORM_TOP, factor);
    this.#currentHorizon.lerpColors(CLEAR_HORIZON, STORM_HORIZON, factor);
    this.#currentSun.lerpColors(CLEAR_SUN, STORM_SUN, factor);
    this.#sky.setPalette({
      top: this.#currentTop,
      horizon: this.#currentHorizon,
      sun: this.#currentSun,
    });
    this.#sky.setClearCloudOpacity(0.48 * (1 - frame.clouds * 0.88));
    this.root.position.copy(this.#camera.position);
    this.root.quaternion.copy(this.#camera.quaternion);
    this.root.visible = frame.clouds > 0.001;
    for (const material of this.#materials) {
      material.uniforms.uTime!.value = time;
      material.uniforms.uClouds!.value = frame.clouds;
      material.uniforms.uFlashExposure!.value = frame.flashExposure;
    }
    if (this.#scene.fog instanceof THREE.FogExp2) {
      this.#scene.fog.density = frame.fogDensity;
      this.#scene.fog.color.copy(this.#currentHorizon);
    }
    this.#hemisphere.intensity = THREE.MathUtils.lerp(0.9, 0.48, factor);
    this.#sun.intensity = THREE.MathUtils.lerp(2.55, 0.65, factor);
    this.#sun.color.copy(this.#currentSun);
    this.#scene.environmentIntensity = THREE.MathUtils.lerp(0.5, 0.28, factor);
  }

  setQuality(value: RainQualityTier | number): void {
    const octaves = typeof value === 'number'
      ? THREE.MathUtils.clamp(Math.floor(value), 3, 5)
      : cloudOctavesForTier(value);
    for (const material of this.#materials) material.uniforms.uOctaves!.value = octaves;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#geometry.dispose();
    for (const material of this.#materials) material.dispose();
  }
}
