import * as THREE from 'three';
import type { LightningFrameState, LightningLightSample } from './types';
import {
  DEFAULT_LIGHTNING_MAP,
  mapLightningPoint,
  type LightningChannel,
  type LightningPoint,
  type LightningSceneMap,
} from './LightningSimulation';
import { blackbodyRGB } from './lightning-core';
import { LIGHTNING_FRAGMENT_SHADER, LIGHTNING_VERTEX_SHADER } from './LightningShaders';

const RENDER_SUBDIVISIONS = 3;
const DEFAULT_MAX_SEGMENTS = 90_000;
const PERSISTENCE_TAU_SECONDS = 0.11;

export interface LightningLightCandidate {
  readonly point: LightningPoint;
  readonly luminosity: number;
  readonly segmentLength: number;
  readonly color: readonly [number, number, number];
}

export interface LightningRendererOptions {
  readonly map?: LightningSceneMap;
  readonly maxSegments?: number;
  readonly persistenceTau?: number;
}

interface MutableLight {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  power: number;
}

export function selectLightningLights(
  candidates: readonly LightningLightCandidate[],
  limit = 4,
  mergeDistance = 7.8,
  map: LightningSceneMap = DEFAULT_LIGHTNING_MAP,
): readonly LightningLightSample[] {
  const sorted = [...candidates].sort(
    (left, right) =>
      right.luminosity * right.segmentLength - left.luminosity * left.segmentLength,
  );
  const selected: MutableLight[] = [];
  for (const candidate of sorted) {
    const mapped = mapLightningPoint(candidate.point, map);
    const score = Math.max(0, candidate.luminosity * candidate.segmentLength);
    const nearby = selected.find((light) =>
      Math.hypot(light.x - mapped.x, light.y - mapped.y, light.z - mapped.z) < mergeDistance,
    );
    if (nearby) {
      const contribution = score * 0.35;
      nearby.power += contribution;
      continue;
    }
    selected.push({
      ...mapped,
      r: candidate.color[0],
      g: candidate.color[1],
      b: candidate.color[2],
      power: score,
    });
    if (selected.length >= Math.max(0, Math.floor(limit))) break;
  }
  return Object.freeze(selected.map((light) => Object.freeze({ ...light })));
}

function deterministicHash(value: number): number {
  const x = Math.sin(value * 127.1 + 311.7) * 43_758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function makeDynamicAttribute(array: Float32Array, itemSize: number): THREE.InstancedBufferAttribute {
  const attribute = new THREE.InstancedBufferAttribute(array, itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

export class LightningRenderer {
  readonly root = new THREE.Group();
  readonly #geometry: THREE.InstancedBufferGeometry;
  readonly #material: THREE.ShaderMaterial;
  readonly #pointLights: readonly [THREE.PointLight, THREE.PointLight];
  readonly #starts: Float32Array;
  readonly #ends: Float32Array;
  readonly #colors: Float32Array;
  readonly #intensities: Float32Array;
  readonly #radii: Float32Array;
  readonly #map: Readonly<LightningSceneMap>;
  readonly #maxSegments: number;
  readonly #persistenceTau: number;
  #persistence = new Float32Array(0);
  #disposed = false;
  #secondaryLightning = true;
  frame: Readonly<LightningFrameState> = Object.freeze({
    lights: Object.freeze([]),
    flashExposure: 0,
  });
  segmentCount = 0;

  constructor(options: LightningRendererOptions = {}) {
    this.#map = Object.freeze({ ...(options.map ?? DEFAULT_LIGHTNING_MAP) });
    this.#maxSegments = Math.max(3, Math.floor(options.maxSegments ?? DEFAULT_MAX_SEGMENTS));
    this.#persistenceTau = Math.max(0, options.persistenceTau ?? PERSISTENCE_TAU_SECONDS);
    this.#starts = new Float32Array(this.#maxSegments * 3);
    this.#ends = new Float32Array(this.#maxSegments * 3);
    this.#colors = new Float32Array(this.#maxSegments * 3);
    this.#intensities = new Float32Array(this.#maxSegments);
    this.#radii = new Float32Array(this.#maxSegments);

    const quad = new Float32Array([
      -1, -1, 1, -1, 1, 1,
      -1, -1, 1, 1, -1, 1,
    ]);
    this.#geometry = new THREE.InstancedBufferGeometry();
    this.#geometry.setAttribute('position', new THREE.BufferAttribute(quad, 2));
    this.#geometry.setAttribute('aStart', makeDynamicAttribute(this.#starts, 3));
    this.#geometry.setAttribute('aEnd', makeDynamicAttribute(this.#ends, 3));
    this.#geometry.setAttribute('aColor', makeDynamicAttribute(this.#colors, 3));
    this.#geometry.setAttribute('aIntensity', makeDynamicAttribute(this.#intensities, 1));
    this.#geometry.setAttribute('aRadius', makeDynamicAttribute(this.#radii, 1));
    this.#geometry.instanceCount = 0;
    this.#geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 120, -70), 1_300);

    this.#material = new THREE.ShaderMaterial({
      vertexShader: LIGHTNING_VERTEX_SHADER,
      fragmentShader: LIGHTNING_FRAGMENT_SHADER,
      uniforms: {
        uFovScale: { value: 0.001 },
        uMinPixels: { value: 2.8 },
        uWidthScale: { value: 1 },
        uCoreWidth: { value: 0.3 },
        uGlowStrength: { value: 0.82 },
        uExposure: { value: 1.35 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.#geometry, this.#material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.name = 'lightningChannels';
    this.#pointLights = [
      new THREE.PointLight('#d9ebff', 0, 230, 2),
      new THREE.PointLight('#d9ebff', 0, 230, 2),
    ];
    this.#pointLights[0].name = 'lightningKeyLight';
    this.#pointLights[1].name = 'lightningFillLight';
    this.root.name = 'lightningRenderer';
    this.root.add(mesh, ...this.#pointLights);
  }

  setViewport(height: number, fovDegrees: number): void {
    this.#material.uniforms.uFovScale!.value =
      2 * Math.tan(THREE.MathUtils.degToRad(fovDegrees) * 0.5) / Math.max(1, height);
  }

  setSecondaryLightning(enabled: boolean): void {
    this.#secondaryLightning = enabled;
  }

  update(channel: LightningChannel | undefined, deltaSecondsRaw: number): void {
    if (this.#disposed) return;
    const deltaSeconds = Math.max(0, Math.min(0.1, deltaSecondsRaw));
    const count = channel?.count ?? 0;
    if (this.#persistence.length < count) {
      const next = new Float32Array(Math.max(1_024, count));
      next.set(this.#persistence);
      this.#persistence = next;
    }
    const decay = this.#persistenceTau > 0
      ? Math.exp(-deltaSeconds / this.#persistenceTau)
      : 0;
    for (let index = 0; index < this.#persistence.length; index += 1) {
      const instantaneous = index < count ? channel?.lum[index] ?? 0 : 0;
      this.#persistence[index] = Math.max(instantaneous, this.#persistence[index]! * decay);
    }

    let rendered = 0;
    let totalRadiance = 0;
    const candidates: LightningLightCandidate[] = [];
    if (channel) {
      for (let index = 0; index < count; index += 1) {
        const parent = channel.parent[index] ?? -1;
        if (parent < 0) continue;
        if (!this.#secondaryLightning && (channel.level?.[index] ?? 0) > 0) continue;
        const luminosity = Math.max(
          channel.lum[index] ?? 0,
          (this.#persistence[index] ?? 0) * 0.85,
        );
        if (luminosity < 0.004 || rendered + RENDER_SUBDIVISIONS > this.#maxSegments) continue;
        const temperature = Math.max(2_500, channel.temp[index] || 8_000);
        const color = blackbodyRGB(temperature) as [number, number, number];
        const x0 = channel.x[parent] ?? 0;
        const y0 = channel.y[parent] ?? 0;
        const z0 = channel.z[parent] ?? 0;
        const x1 = channel.x[index] ?? 0;
        const y1 = channel.y[index] ?? 0;
        const z1 = channel.z[index] ?? 0;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dz = z1 - z0;
        const segmentLength = Math.hypot(dx, dy, dz) || 1;
        let axisX = -dy;
        let axisY = dx;
        let axisZ = 0;
        if (Math.abs(dx) + Math.abs(dy) < 0.001) {
          axisX = 1;
          axisY = 0;
        }
        const axisLength = Math.hypot(axisX, axisY, axisZ) || 1;
        axisX /= axisLength;
        axisY /= axisLength;
        axisZ /= axisLength;
        const crossX = (dy * axisZ - dz * axisY) / segmentLength;
        const crossY = (dz * axisX - dx * axisZ) / segmentLength;
        const crossZ = (dx * axisY - dy * axisX) / segmentLength;
        const amplitude = segmentLength * 0.16;
        let previous = { x: x0, y: y0, z: z0 };
        for (let subdivision = 1; subdivision <= RENDER_SUBDIVISIONS; subdivision += 1) {
          const t = subdivision / RENDER_SUBDIVISIONS;
          const next = { x: x0 + dx * t, y: y0 + dy * t, z: z0 + dz * t };
          if (subdivision < RENDER_SUBDIVISIONS) {
            const weight = Math.sin(Math.PI * t) * amplitude;
            const first = deterministicHash(index * 7.13 + subdivision * 3.77);
            const second = deterministicHash(index * 11.9 + subdivision * 5.31);
            next.x += (axisX * first + crossX * second) * weight;
            next.y += (axisY * first + crossY * second) * weight;
            next.z += (axisZ * first + crossZ * second) * weight;
          }
          const mappedStart = mapLightningPoint(previous, this.#map);
          const mappedEnd = mapLightningPoint(next, this.#map);
          const offset = rendered * 3;
          this.#starts.set([mappedStart.x, mappedStart.y, mappedStart.z], offset);
          this.#ends.set([mappedEnd.x, mappedEnd.y, mappedEnd.z], offset);
          this.#colors.set(color, offset);
          this.#intensities[rendered] = luminosity;
          this.#radii[rendered] = (1.2 + 4.2 * Math.min(1.6, luminosity)) * this.#map.scale;
          rendered += 1;
          previous = next;
        }
        totalRadiance += luminosity * segmentLength;
        if (luminosity > 0.12) {
          candidates.push({
            point: { x: x1, y: y1, z: z1 },
            luminosity,
            segmentLength,
            color,
          });
        }
      }
    }

    this.#geometry.instanceCount = rendered;
    this.segmentCount = rendered;
    for (const name of ['aStart', 'aEnd', 'aColor', 'aIntensity', 'aRadius']) {
      const attribute = this.#geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, rendered * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    const lights = selectLightningLights(candidates, 4, 7.8, this.#map);
    const flashExposure = THREE.MathUtils.clamp(totalRadiance / 3_500, 0, 1.4);
    this.frame = Object.freeze({ lights, flashExposure });
    for (let index = 0; index < this.#pointLights.length; index += 1) {
      const target = this.#pointLights[index]!;
      const sample = lights[index];
      if (!sample) {
        target.intensity = 0;
        continue;
      }
      target.position.set(sample.x, sample.y, sample.z);
      target.color.setRGB(sample.r, sample.g, sample.b);
      target.intensity = THREE.MathUtils.clamp(sample.power * 35, 0, 25_000);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#geometry.dispose();
    this.#material.dispose();
  }
}
