import * as THREE from 'three';
import type { WeatherFrame } from './types';

export type RainQualityTier = 'high' | 'medium' | 'low';

const RAIN_COUNTS: Readonly<Record<RainQualityTier, number>> = Object.freeze({
  high: 22_000,
  medium: 12_000,
  low: 6_000,
});

const EXTENT = new THREE.Vector3(180, 90, 180);

export function rainCountForTier(tier: RainQualityTier): number {
  return RAIN_COUNTS[tier];
}

export function clampRainIntensity(value: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function seededUnit(index: number, salt: number): number {
  let value = (index + 1) * 0x9e37_79b1 ^ salt;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb_352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846c_a68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffff_ffff;
}

const RAIN_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSpeed;
  attribute float aPhase;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uCenter;
  uniform vec2 uWind;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    float travel = mod(aPhase + uTime * aSpeed, ${EXTENT.y.toFixed(1)});
    vec3 head = uCenter + vec3(
      aOffset.x + uWind.x * (travel / ${EXTENT.y.toFixed(1)} - 0.5) * 0.9,
      ${EXTENT.y.toFixed(1)} * 0.58 - travel,
      aOffset.z + uWind.y * (travel / ${EXTENT.y.toFixed(1)} - 0.5) * 0.9
    );
    vec3 streakDirection = normalize(vec3(-uWind.x * 0.055, -1.0, -uWind.y * 0.055));
    vec3 eyeDirection = normalize(cameraPosition - head);
    vec3 across = normalize(cross(streakDirection, eyeDirection));
    float streakLength = mix(0.58, 1.72, uIntensity) * mix(0.82, 1.18, aSpeed / 58.0);
    float width = mix(0.009, 0.018, uIntensity);
    vec3 worldPosition = head
      + across * position.x * width
      + streakDirection * (position.y - 0.5) * streakLength;
    vUv = vec2(position.x * 0.5 + 0.5, position.y);
    vWorldPosition = worldPosition;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
  }
`;

const RAIN_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform float uIntensity;
  uniform float uAmbientExposure;
  uniform float uFlashExposure;
  uniform vec3 uLightningPosition[4];
  uniform vec3 uLightningColor[4];
  uniform float uLightningPower[4];
  uniform int uLightningCount;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    float side = 1.0 - smoothstep(0.18, 0.5, abs(vUv.x - 0.5));
    float taper = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.58, vUv.y);
    float illumination = 0.24 + uAmbientExposure * 0.38 + uFlashExposure * 0.72;
    vec3 tint = vec3(0.61, 0.76, 0.86);
    for (int index = 0; index < 4; index++) {
      if (index >= uLightningCount) break;
      vec3 delta = uLightningPosition[index] - vWorldPosition;
      float irradiance = uLightningPower[index] / max(dot(delta, delta), 49.0);
      tint += uLightningColor[index] * irradiance * 3.5;
      illumination += irradiance * 2.2;
    }
    float nearFade = smoothstep(3.0, 15.0, distance(cameraPosition, vWorldPosition));
    float alpha = side * taper * nearFade * uIntensity * 0.16;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(tint * illumination, alpha);
  }
`;

export class RainSystem {
  readonly root = new THREE.Group();
  readonly #geometry: THREE.InstancedBufferGeometry;
  readonly #material: THREE.ShaderMaterial;
  readonly #mesh: THREE.Mesh;
  #intensity = 0;
  #disposed = false;
  count: number;

  constructor(tier: RainQualityTier = 'medium') {
    const maximum = rainCountForTier('high');
    const offsets = new Float32Array(maximum * 3);
    const speeds = new Float32Array(maximum);
    const phases = new Float32Array(maximum);
    for (let index = 0; index < maximum; index += 1) {
      const offset = index * 3;
      offsets[offset] = (seededUnit(index, 0x1234) - 0.5) * EXTENT.x;
      offsets[offset + 1] = 0;
      offsets[offset + 2] = (seededUnit(index, 0x9876) - 0.5) * EXTENT.z;
      speeds[index] = 34 + seededUnit(index, 0x5342) * 24;
      phases[index] = seededUnit(index, 0xa125) * EXTENT.y;
    }
    const quad = new Float32Array([
      -1, 0, 1, 0, 1, 1,
      -1, 0, 1, 1, -1, 1,
    ]);
    this.#geometry = new THREE.InstancedBufferGeometry();
    this.#geometry.setAttribute('position', new THREE.BufferAttribute(quad, 2));
    this.#geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    this.#geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
    this.#geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    this.count = rainCountForTier(tier);
    this.#geometry.instanceCount = this.count;
    this.#geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 180);
    this.#material = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERTEX_SHADER,
      fragmentShader: RAIN_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector2() },
        uAmbientExposure: { value: 1 },
        uFlashExposure: { value: 0 },
        uLightningPosition: {
          value: Array.from({ length: 4 }, () => new THREE.Vector3()),
        },
        uLightningColor: {
          value: Array.from({ length: 4 }, () => new THREE.Vector3()),
        },
        uLightningPower: { value: Array.from({ length: 4 }, () => 0) },
        uLightningCount: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.#mesh = new THREE.Mesh(this.#geometry, this.#material);
    this.#mesh.name = 'cameraLocalRain';
    this.#mesh.frustumCulled = false;
    this.#mesh.renderOrder = 8;
    this.#mesh.visible = false;
    this.root.name = 'rainSystem';
    this.root.add(this.#mesh);
  }

  setIntensity(value: number): void {
    this.#intensity = clampRainIntensity(value);
    this.#material.uniforms.uIntensity!.value = this.#intensity;
    this.#mesh.visible = this.#intensity > 0.001;
  }

  setQuality(value: RainQualityTier | number): void {
    const requested = typeof value === 'number' ? value : rainCountForTier(value);
    this.count = THREE.MathUtils.clamp(Math.floor(requested), 0, rainCountForTier('high'));
    this.#geometry.instanceCount = this.count;
  }

  update(camera: THREE.Camera, time: number, frame: Readonly<WeatherFrame>): void {
    if (this.#disposed) return;
    this.setIntensity(frame.rain);
    this.#material.uniforms.uTime!.value = time;
    const center = this.#material.uniforms.uCenter!.value as THREE.Vector3;
    center.copy(camera.position);
    center.y += 10;
    this.#material.uniforms.uWind!.value.set(frame.windX, frame.windZ);
    this.#material.uniforms.uAmbientExposure!.value = frame.ambientExposure;
    this.#material.uniforms.uFlashExposure!.value = frame.flashExposure;
    this.#material.uniforms.uLightningCount!.value = Math.min(4, frame.lightning.length);
    const positions = this.#material.uniforms.uLightningPosition!.value as THREE.Vector3[];
    const colors = this.#material.uniforms.uLightningColor!.value as THREE.Vector3[];
    const powers = this.#material.uniforms.uLightningPower!.value as number[];
    for (let index = 0; index < 4; index += 1) {
      const light = frame.lightning[index];
      positions[index]?.set(light?.x ?? 0, light?.y ?? 0, light?.z ?? 0);
      colors[index]?.set(light?.r ?? 0, light?.g ?? 0, light?.b ?? 0);
      powers[index] = light?.power ?? 0;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#geometry.dispose();
    this.#material.dispose();
  }
}
