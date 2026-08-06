import * as THREE from 'three';
import type { SeaState } from '../weather/types';
import {
  ASSEMBLE_SURFACE_FRAGMENT,
  EVOLVE_SPECTRUM_FRAGMENT,
  FULLSCREEN_VERTEX,
  STOCKHAM_FRAGMENT,
} from './SpectralShaders';
import type { WaveField } from './WaveField';

export interface SpectralTier {
  readonly size: 64 | 128;
  readonly cascades: 1 | 2;
}

export interface SpectralOceanFrame {
  readonly displacement?: THREE.Texture;
  readonly slope?: THREE.Texture;
  readonly farDisplacement?: THREE.Texture;
  readonly farSlope?: THREE.Texture;
  readonly size: 64 | 128;
  readonly cascades: 1 | 2;
  readonly available: boolean;
  readonly error?: string;
}

interface CascadeResources {
  readonly patchSize: number;
  readonly h0: THREE.DataTexture;
  readonly h0Data: Float32Array;
  readonly ping: readonly [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  readonly displacement: THREE.WebGLRenderTarget;
  readonly slope: THREE.WebGLRenderTarget;
}

export const selectSpectralTier = (width: number): SpectralTier => (
  width >= 1440
    ? { size: 128, cascades: 2 }
    : width >= 700
      ? { size: 128, cascades: 1 }
      : { size: 64, cascades: 1 }
);

export function fftStageCount(size: number): number {
  const stages = Math.log2(size);
  if (!Number.isInteger(stages)) throw new RangeError('FFT size must be a power of two');
  return stages;
}

export function spectralSeedScale(size: number): number {
  return size * size / Math.SQRT2;
}

function createTarget(
  size: number,
  filter: THREE.MagnificationTextureFilter = THREE.NearestFilter,
): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: filter,
    magFilter: filter,
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;
  return target;
}

function setUniform(material: THREE.ShaderMaterial, name: string, value: unknown): void {
  const uniform = material.uniforms[name];
  if (!uniform) throw new Error(`missing spectral shader uniform: ${name}`);
  uniform.value = value;
}

function fillH0Data(
  data: Float32Array,
  size: number,
  field: WaveField,
  cascadeIndex: number,
  cascadeCount: number,
  stormFactor: number,
): void {
  data.fill(0);
  const waves = field.components(stormFactor);
  const center = size / 2;
  const maximumRadius = center - 2;
  const normalization = spectralSeedScale(size);
  waves.forEach((wave, index) => {
    const longWaveSplit = Math.ceil(waves.length * 0.3);
    if (cascadeCount > 1) {
      if (cascadeIndex === 0 && index < longWaveSplit) return;
      if (cascadeIndex === 1 && index >= longWaveSplit) return;
    }
    const angle = Math.atan2(wave.directionZ, wave.directionX);
    const band = (index + 1) / (waves.length + 1);
    const radius = Math.max(1, Math.round(maximumRadius * band / (cascadeIndex + 1)));
    const x = Math.max(0, Math.min(size - 1, Math.round(center + Math.cos(angle) * radius)));
    const y = Math.max(0, Math.min(size - 1, Math.round(center + Math.sin(angle) * radius)));
    const offset = (y * size + x) * 4;
    const real = wave.amplitude * Math.cos(wave.phase) * normalization;
    const imaginary = wave.amplitude * Math.sin(wave.phase) * normalization;
    data[offset] = (data[offset] ?? 0) + real;
    data[offset + 1] = (data[offset + 1] ?? 0) + imaginary;
    data[offset + 3] = 1;
    const mirrorX = (size - x) % size;
    const mirrorY = (size - y) % size;
    const mirrorOffset = (mirrorY * size + mirrorX) * 4;
    data[mirrorOffset] = (data[mirrorOffset] ?? 0) + real;
    data[mirrorOffset + 1] = (data[mirrorOffset + 1] ?? 0) - imaginary;
    data[mirrorOffset + 3] = 1;
  });
}

function createH0Texture(
  size: number,
  field: WaveField,
  cascadeIndex: number,
  cascadeCount: number,
): { texture: THREE.DataTexture; data: Float32Array } {
  const data = new Float32Array(size * size * 4);
  fillH0Data(data, size, field, cascadeIndex, cascadeCount, 0);
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, data };
}

export class SpectralOcean {
  readonly #renderer: THREE.WebGLRenderer;
  readonly #field: WaveField;
  readonly #tier: SpectralTier;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly #evolveMaterial: THREE.ShaderMaterial;
  readonly #stockhamMaterial: THREE.ShaderMaterial;
  readonly #assemblyMaterial: THREE.ShaderMaterial;
  readonly #cascades: CascadeResources[] = [];
  #available = false;
  #error: string | undefined;
  #disposed = false;

  constructor(renderer: THREE.WebGLRenderer, field: WaveField, tier: SpectralTier) {
    this.#renderer = renderer;
    this.#field = field;
    this.#tier = tier;
    this.#evolveMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: EVOLVE_SPECTRUM_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uH0: { value: null },
        uTime: { value: 0 },
        uGravity: { value: 9.81 },
        uPatchSize: { value: 420 },
        uResolution: { value: tier.size },
      },
    });
    this.#stockhamMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: STOCKHAM_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInput: { value: null },
        uStage: { value: 0 },
        uSize: { value: tier.size },
        uHorizontal: { value: 1 },
      },
    });
    this.#assemblyMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: ASSEMBLE_SURFACE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInput: { value: null },
        uSize: { value: tier.size },
        uPatchSize: { value: 420 },
        uChoppiness: { value: 0.28 },
        uOutputMode: { value: 0 },
      },
    });
    this.#quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#evolveMaterial);
    this.#quad.frustumCulled = false;
    this.#scene.add(this.#quad);

    try {
      if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 is required');
      if (!renderer.extensions.has('EXT_color_buffer_float')) {
        throw new Error('EXT_color_buffer_float is unavailable');
      }
      if (renderer.capabilities.maxVertexTextures < 1) {
        throw new Error('vertex texture sampling is unavailable');
      }
      for (let index = 0; index < tier.cascades; index += 1) {
        const patchSize = index === 0 ? 420 : 1_500;
        const h0 = createH0Texture(tier.size, field, index, tier.cascades);
        this.#cascades.push({
          patchSize,
          h0: h0.texture,
          h0Data: h0.data,
          ping: [createTarget(tier.size), createTarget(tier.size)],
          displacement: createTarget(tier.size, THREE.LinearFilter),
          slope: createTarget(tier.size, THREE.LinearFilter),
        });
      }
      this.#available = true;
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error);
      this.#disposeResources();
    }
  }

  update(timeSeconds: number, sea: Readonly<SeaState>): SpectralOceanFrame {
    if (!this.#available || this.#disposed) return this.#frame();
    const previousTarget = this.#renderer.getRenderTarget();
    try {
      for (const cascade of this.#cascades) {
        fillH0Data(
          cascade.h0Data,
          this.#tier.size,
          this.#field,
          this.#cascades.indexOf(cascade),
          this.#tier.cascades,
          sea.stormFactor,
        );
        cascade.h0.needsUpdate = true;
        this.#quad.material = this.#evolveMaterial;
        setUniform(this.#evolveMaterial, 'uH0', cascade.h0);
        setUniform(this.#evolveMaterial, 'uTime', timeSeconds);
        setUniform(this.#evolveMaterial, 'uPatchSize', cascade.patchSize);
        this.#renderer.setRenderTarget(cascade.ping[0]);
        this.#renderer.render(this.#scene, this.#camera);

        let current = cascade.ping[0];
        let next = cascade.ping[1];
        this.#quad.material = this.#stockhamMaterial;
        for (const horizontal of [1, 0]) {
          setUniform(this.#stockhamMaterial, 'uHorizontal', horizontal);
          for (let stage = 0; stage < fftStageCount(this.#tier.size); stage += 1) {
            setUniform(this.#stockhamMaterial, 'uInput', current.texture);
            setUniform(this.#stockhamMaterial, 'uStage', stage);
            this.#renderer.setRenderTarget(next);
            this.#renderer.render(this.#scene, this.#camera);
            [current, next] = [next, current];
          }
        }

        this.#quad.material = this.#assemblyMaterial;
        setUniform(this.#assemblyMaterial, 'uInput', current.texture);
        setUniform(this.#assemblyMaterial, 'uPatchSize', cascade.patchSize);
        setUniform(this.#assemblyMaterial, 'uChoppiness', sea.choppiness);
        setUniform(this.#assemblyMaterial, 'uOutputMode', 0);
        this.#renderer.setRenderTarget(cascade.displacement);
        this.#renderer.render(this.#scene, this.#camera);
        setUniform(this.#assemblyMaterial, 'uOutputMode', 1);
        this.#renderer.setRenderTarget(cascade.slope);
        this.#renderer.render(this.#scene, this.#camera);
      }
    } catch (error) {
      this.#available = false;
      this.#error = error instanceof Error ? error.message : String(error);
    } finally {
      this.#renderer.setRenderTarget(previousTarget);
    }
    return this.#frame();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#available = false;
    this.#disposeResources();
    this.#quad.geometry.dispose();
    this.#evolveMaterial.dispose();
    this.#stockhamMaterial.dispose();
    this.#assemblyMaterial.dispose();
  }

  #frame(): SpectralOceanFrame {
    const primary = this.#cascades[0];
    const secondary = this.#cascades[1];
    return {
      displacement: this.#available ? primary?.displacement.texture : undefined,
      slope: this.#available ? primary?.slope.texture : undefined,
      farDisplacement: this.#available ? secondary?.displacement.texture : undefined,
      farSlope: this.#available ? secondary?.slope.texture : undefined,
      size: this.#tier.size,
      cascades: this.#tier.cascades,
      available: this.#available,
      error: this.#error,
    };
  }

  #disposeResources(): void {
    for (const cascade of this.#cascades) {
      cascade.h0.dispose();
      cascade.ping[0].dispose();
      cascade.ping[1].dispose();
      cascade.displacement.dispose();
      cascade.slope.dispose();
    }
    this.#cascades.length = 0;
  }
}
