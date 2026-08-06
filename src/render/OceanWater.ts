import * as THREE from 'three';
import type { ShoreField } from '../ocean/ShoreField';
import type { WaveComponent } from '../ocean/types';
import type { LightningLightSample, SeaState } from '../weather/types';
import type { OceanSurfaceProfile } from '../platform/quality';
import { minimumResolvedWavelength, snapOceanCenter } from './OceanSurfaceProfile';
import { OCEAN_FRAGMENT_SHADER, OCEAN_VERTEX_SHADER } from './OceanSurfaceShaders';

const MAX_WAVES = 16;
const MAX_LIGHTNING_LIGHTS = 4;
const CLEAR_WATER_COLORS = Object.freeze({
  deep: new THREE.Color('#03485f'),
  mid: new THREE.Color('#087f98'),
  lagoon: new THREE.Color('#55d9d2'),
  horizon: new THREE.Color('#b9e5eb'),
  skyTop: new THREE.Color('#3d92cf'),
  foam: new THREE.Color('#efffff'),
  sun: new THREE.Color('#fff2c7'),
});
const STORM_WATER_COLORS = Object.freeze({
  deep: new THREE.Color('#071f2c'),
  mid: new THREE.Color('#1d5061'),
  lagoon: new THREE.Color('#347887'),
  horizon: new THREE.Color('#718691'),
  skyTop: new THREE.Color('#1b2937'),
  foam: new THREE.Color('#d6e2e6'),
  sun: new THREE.Color('#b7c7d2'),
});

export interface OceanSurfaceSource {
  readonly displacement: THREE.Texture;
  readonly slope: THREE.Texture;
  readonly farDisplacement?: THREE.Texture;
  readonly farSlope?: THREE.Texture;
  readonly size: 64 | 128;
  readonly cascades: 1 | 2;
}

interface OceanLayerOptions {
  readonly clipNearPatch: 0 | 1;
  readonly clipHalfExtent: number;
  readonly minimumGeometryWavelength: number;
}

export function clampFoamThreshold(value: number): number {
  return THREE.MathUtils.clamp(value, 0.35, 0.92);
}

export function packWaveUniforms(waves: readonly WaveComponent[], limit = MAX_WAVES): {
  data: THREE.Vector4[];
  meta: THREE.Vector2[];
  count: number;
} {
  const boundedLimit = Math.max(1, Math.min(MAX_WAVES, Math.floor(limit)));
  const selected = waves.slice(0, boundedLimit);
  return {
    count: selected.length,
    data: Array.from({ length: boundedLimit }, (_, index) => {
      const wave = selected[index];
      return wave
        ? new THREE.Vector4(wave.directionX, wave.directionZ, wave.amplitude, wave.waveNumber)
        : new THREE.Vector4();
    }),
    meta: Array.from({ length: boundedLimit }, (_, index) => {
      const wave = selected[index];
      return wave ? new THREE.Vector2(wave.angularFrequency, wave.phase) : new THREE.Vector2();
    }),
  };
}

export function packLightningUniforms(lights: readonly LightningLightSample[]): {
  positions: THREE.Vector3[];
  colors: THREE.Vector3[];
  powers: number[];
  count: number;
} {
  const selected = lights.slice(0, MAX_LIGHTNING_LIGHTS);
  return {
    count: selected.length,
    positions: Array.from({ length: MAX_LIGHTNING_LIGHTS }, (_, index) => {
      const light = selected[index];
      return light ? new THREE.Vector3(light.x, light.y, light.z) : new THREE.Vector3();
    }),
    colors: Array.from({ length: MAX_LIGHTNING_LIGHTS }, (_, index) => {
      const light = selected[index];
      return light ? new THREE.Vector3(light.r, light.g, light.b) : new THREE.Vector3();
    }),
    powers: Array.from(
      { length: MAX_LIGHTNING_LIGHTS },
      (_, index) => selected[index]?.power ?? 0,
    ),
  };
}

function createPlane(size: number, segments: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createOceanMaterial(
  packed: ReturnType<typeof packWaveUniforms>,
  layer: OceanLayerOptions,
  neutralDisplacement: THREE.Texture,
  neutralSlope: THREE.Texture,
  neutralShore: THREE.Texture,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWaveCount: { value: packed.count },
      uWaves: { value: packed.data },
      uWaveMeta: { value: packed.meta },
      uMinimumGeometryWavelength: { value: layer.minimumGeometryWavelength },
      uClipNearPatch: { value: layer.clipNearPatch },
      uClipHalfExtent: { value: layer.clipHalfExtent },
      uNearCenter: { value: new THREE.Vector2() },
      uDeep: { value: new THREE.Color('#03485f') },
      uMid: { value: new THREE.Color('#087f98') },
      uLagoon: { value: new THREE.Color('#55d9d2') },
      uHorizon: { value: new THREE.Color('#b9e5eb') },
      uSkyTop: { value: new THREE.Color('#3d92cf') },
      uFoam: { value: new THREE.Color('#efffff') },
      uSunColor: { value: new THREE.Color('#fff2c7') },
      uSunDirection: { value: new THREE.Vector3(-0.42, 0.46, -0.68).normalize() },
      uIslandCenter: { value: new THREE.Vector2(0, -28) },
      uIslandRadii: { value: new THREE.Vector2(18, 13) },
      uFoamThreshold: { value: clampFoamThreshold(0.66) },
      uDisplacement: { value: neutralDisplacement },
      uSlope: { value: neutralSlope },
      uDisplacementFar: { value: neutralDisplacement },
      uSlopeFar: { value: neutralSlope },
      uShoreField: { value: neutralShore },
      uShoreBounds: { value: new THREE.Vector4(-64, -92, 64, 36) },
      uSpectralWeight: { value: 0 },
      uSpectralPatchSize: { value: 420 },
      uSpectralFarPatchSize: { value: 1_500 },
      uSpectralCascadeWeight: { value: 0 },
      uStormFactor: { value: 0 },
      uChoppiness: { value: 0.28 },
      uLightningPosition: {
        value: Array.from({ length: MAX_LIGHTNING_LIGHTS }, () => new THREE.Vector3()),
      },
      uLightningColor: {
        value: Array.from({ length: MAX_LIGHTNING_LIGHTS }, () => new THREE.Vector3()),
      },
      uLightningPower: { value: Array.from({ length: MAX_LIGHTNING_LIGHTS }, () => 0) },
      uLightningCount: { value: 0 },
      uFlashExposure: { value: 0 },
    },
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
  });
}

export class OceanWater extends THREE.Group {
  readonly #farMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly #nearMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly #materials: readonly THREE.ShaderMaterial[];
  readonly #profile: OceanSurfaceProfile;
  readonly #nearCenter = new THREE.Vector2();
  readonly #neutralDisplacement: THREE.DataTexture;
  readonly #neutralSlope: THREE.DataTexture;
  readonly #neutralShore: THREE.DataTexture;
  readonly layerCount = 2;

  constructor(waves: readonly WaveComponent[], profile: OceanSurfaceProfile) {
    const packed = packWaveUniforms(waves);
    const neutralTexture = (
      values: readonly number[],
      format: THREE.PixelFormat = THREE.RGBAFormat,
    ): THREE.DataTexture => {
      const texture = new THREE.DataTexture(new Float32Array(values), 1, 1, format, THREE.FloatType);
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
    };
    const neutralDisplacement = neutralTexture([0, 0, 0, 1]);
    const neutralSlope = neutralTexture([0, 0, 0, 1]);
    const neutralShore = neutralTexture([1], THREE.RedFormat);
    const farMaterial = createOceanMaterial(packed, {
      clipNearPatch: 1,
      clipHalfExtent: profile.nearSizeMeters * 0.5 - profile.overlapMeters,
      minimumGeometryWavelength:
        minimumResolvedWavelength(profile.farSizeMeters, profile.farSegments) * 1.5,
    }, neutralDisplacement, neutralSlope, neutralShore);
    const nearMaterial = createOceanMaterial(packed, {
      clipNearPatch: 0,
      clipHalfExtent: 0,
      minimumGeometryWavelength:
        minimumResolvedWavelength(profile.nearSizeMeters, profile.nearSegments) * 1.5,
    }, neutralDisplacement, neutralSlope, neutralShore);

    super();
    this.#profile = profile;
    this.#neutralDisplacement = neutralDisplacement;
    this.#neutralSlope = neutralSlope;
    this.#neutralShore = neutralShore;
    this.#farMesh = new THREE.Mesh(
      createPlane(profile.farSizeMeters, profile.farSegments),
      farMaterial,
    );
    this.#nearMesh = new THREE.Mesh(
      createPlane(profile.nearSizeMeters, profile.nearSegments),
      nearMaterial,
    );
    this.#nearMesh.position.y = 0.015;
    this.#nearMesh.renderOrder = 1;
    this.#farMesh.name = 'oceanFarSurface';
    this.#nearMesh.name = 'oceanNearSurface';
    this.#farMesh.frustumCulled = false;
    this.#nearMesh.frustumCulled = false;
    this.#farMesh.receiveShadow = true;
    this.#nearMesh.receiveShadow = true;
    this.#materials = [farMaterial, nearMaterial];
    this.name = 'oceanWater';
    this.add(this.#farMesh, this.#nearMesh);
  }

  setIslandField(center: THREE.Vector2, radii: THREE.Vector2): void {
    for (const material of this.#materials) {
      material.uniforms.uIslandCenter!.value.copy(center);
      material.uniforms.uIslandRadii!.value.copy(radii);
    }
  }

  setSurfaceSource(source?: OceanSurfaceSource): void {
    for (const material of this.#materials) {
      material.uniforms.uDisplacement!.value = source?.displacement ?? this.#neutralDisplacement;
      material.uniforms.uSlope!.value = source?.slope ?? this.#neutralSlope;
      material.uniforms.uDisplacementFar!.value = source?.farDisplacement ?? this.#neutralDisplacement;
      material.uniforms.uSlopeFar!.value = source?.farSlope ?? this.#neutralSlope;
      material.uniforms.uSpectralWeight!.value = source ? 0.36 : 0;
      material.uniforms.uSpectralCascadeWeight!.value = source?.cascades === 2 ? 1 : 0;
    }
  }

  setWaveComponents(waves: readonly WaveComponent[]): void {
    const packed = packWaveUniforms(waves);
    for (const material of this.#materials) {
      material.uniforms.uWaveCount!.value = packed.count;
      const data = material.uniforms.uWaves!.value as THREE.Vector4[];
      const meta = material.uniforms.uWaveMeta!.value as THREE.Vector2[];
      for (let index = 0; index < MAX_WAVES; index += 1) {
        const nextData = packed.data[index];
        const nextMeta = packed.meta[index];
        const targetData = data[index];
        const targetMeta = meta[index];
        if (nextData && targetData) targetData.copy(nextData);
        if (nextMeta && targetMeta) targetMeta.copy(nextMeta);
      }
    }
  }

  setShoreField(shore: ShoreField): void {
    const bounds = shore.bounds;
    for (const material of this.#materials) {
      material.uniforms.uShoreField!.value = shore.texture;
      material.uniforms.uShoreBounds!.value.set(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
    }
  }

  setSeaState(sea: Readonly<SeaState>): void {
    for (const material of this.#materials) {
      material.uniforms.uStormFactor!.value = sea.stormFactor;
      material.uniforms.uChoppiness!.value = sea.choppiness;
      const factor = sea.stormFactor;
      (material.uniforms.uDeep!.value as THREE.Color)
        .copy(CLEAR_WATER_COLORS.deep).lerp(STORM_WATER_COLORS.deep, factor);
      (material.uniforms.uMid!.value as THREE.Color)
        .copy(CLEAR_WATER_COLORS.mid).lerp(STORM_WATER_COLORS.mid, factor);
      (material.uniforms.uLagoon!.value as THREE.Color)
        .copy(CLEAR_WATER_COLORS.lagoon).lerp(STORM_WATER_COLORS.lagoon, factor);
      (material.uniforms.uHorizon!.value as THREE.Color)
        .copy(CLEAR_WATER_COLORS.horizon).lerp(STORM_WATER_COLORS.horizon, factor);
      (material.uniforms.uSkyTop!.value as THREE.Color)
        .copy(CLEAR_WATER_COLORS.skyTop).lerp(STORM_WATER_COLORS.skyTop, factor);
      (material.uniforms.uFoam!.value as THREE.Color)
        .copy(CLEAR_WATER_COLORS.foam).lerp(STORM_WATER_COLORS.foam, factor);
      (material.uniforms.uSunColor!.value as THREE.Color)
        .copy(CLEAR_WATER_COLORS.sun).lerp(STORM_WATER_COLORS.sun, factor);
    }
  }

  setLightning(lights: readonly LightningLightSample[], flashExposure: number): void {
    const packed = packLightningUniforms(lights);
    for (const material of this.#materials) {
      material.uniforms.uLightningCount!.value = packed.count;
      material.uniforms.uFlashExposure!.value = Math.max(0, flashExposure);
      const positions = material.uniforms.uLightningPosition!.value as THREE.Vector3[];
      const colors = material.uniforms.uLightningColor!.value as THREE.Vector3[];
      const powers = material.uniforms.uLightningPower!.value as number[];
      for (let index = 0; index < MAX_LIGHTNING_LIGHTS; index += 1) {
        positions[index]?.copy(packed.positions[index]!);
        colors[index]?.copy(packed.colors[index]!);
        powers[index] = packed.powers[index] ?? 0;
      }
    }
  }

  update(timeSeconds: number, cameraX: number, cameraZ: number): void {
    const snapped = snapOceanCenter(cameraX, cameraZ, this.#profile.snapIntervalMeters);
    this.#nearCenter.set(snapped.x, snapped.z);
    this.#nearMesh.position.set(snapped.x, 0.015, snapped.z);
    for (const material of this.#materials) {
      material.uniforms.uTime!.value = timeSeconds;
      material.uniforms.uNearCenter!.value.copy(this.#nearCenter);
    }
  }

  dispose(): void {
    this.#farMesh.geometry.dispose();
    this.#nearMesh.geometry.dispose();
    for (const material of this.#materials) material.dispose();
    this.#neutralDisplacement.dispose();
    this.#neutralSlope.dispose();
    this.#neutralShore.dispose();
  }
}
