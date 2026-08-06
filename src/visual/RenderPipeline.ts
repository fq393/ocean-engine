import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.28 },
    uSize: { value: 0.78 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength, uSize;
    varying vec2 vUv;
    void main(){
      vec4 color=texture2D(tDiffuse,vUv);
      float d=distance(vUv,vec2(0.5));
      float vignette=mix(1.0,smoothstep(uSize,uSize-0.46,d),uStrength);
      color.rgb*=vignette;
      gl_FragColor=color;
    }
  `,
};

export interface RenderPipelineOptions {
  readonly antialiasSamples: number;
}

export interface BloomSettings {
  readonly strength: number;
  readonly threshold: number;
  readonly radius: number;
}

export function bloomForStorm(value: number): BloomSettings {
  const factor = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const mix = (clear: number, storm: number): number =>
    Math.round((clear + (storm - clear) * factor) * 1_000) / 1_000;
  return {
    strength: mix(0.1, 0.24),
    threshold: mix(1.1, 0.82),
    radius: mix(0.16, 0.22),
  };
}

export function resolveAntialiasSamples(requested: number, maximum: number): number {
  if (!Number.isInteger(requested) || requested < 0) {
    throw new RangeError('requested samples must be a non-negative integer');
  }
  if (!Number.isInteger(maximum) || maximum < 0) {
    throw new RangeError('maximum samples must be a non-negative integer');
  }
  return Math.min(requested, maximum);
}

export class RenderPipeline {
  readonly #composer: EffectComposer;
  readonly #bloom: UnrealBloomPass;
  readonly antialiasSamples: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: RenderPipelineOptions,
  ) {
    const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.antialiasSamples = resolveAntialiasSamples(
      options.antialiasSamples,
      renderer.capabilities.maxSamples,
    );
    target.samples = this.antialiasSamples;
    this.#composer = new EffectComposer(renderer, target);
    this.#composer.addPass(new RenderPass(scene, camera));
    this.#bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.16, 1.1);
    this.#composer.addPass(this.#bloom);
    this.#composer.addPass(new ShaderPass(VignetteShader));
    this.#composer.addPass(new OutputPass());
  }

  render(): void {
    this.#composer.render();
  }

  setBloom(strength: number, threshold: number, radius: number): void {
    this.#bloom.strength = Math.max(0, strength);
    this.#bloom.threshold = Math.max(0, threshold);
    this.#bloom.radius = THREE.MathUtils.clamp(radius, 0, 1);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.#composer.setPixelRatio(pixelRatio);
    this.#composer.setSize(width, height);
  }

  dispose(): void {
    this.#composer.dispose();
  }
}
