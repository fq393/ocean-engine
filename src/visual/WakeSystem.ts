import * as THREE from 'three';
import type { WaveSampler } from '../boat/BoatDynamics';
import type { BoatState } from '../boat/types';

const SEGMENTS = 38;
const MAX_HISTORY = 96;
const MIN_SAMPLE_DISTANCE = 0.04;
const MAX_AGE_SECONDS = 6;

export interface WakeSample {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly speed: number;
  readonly time: number;
}

export function appendWakeSample(
  history: WakeSample[],
  sample: WakeSample,
  maximum = MAX_HISTORY,
  minimumDistance = MIN_SAMPLE_DISTANCE,
): boolean {
  const previous = history.at(-1);
  if (previous && Math.hypot(sample.x - previous.x, sample.z - previous.z) < minimumDistance) {
    return false;
  }
  history.push(sample);
  if (history.length > maximum) history.splice(0, history.length - maximum);
  return true;
}

export function rebaseWakeSamples(history: WakeSample[], offsetSeconds: number): void {
  if (!Number.isFinite(offsetSeconds) || offsetSeconds === 0) return;
  for (let index = 0; index < history.length; index += 1) {
    const sample = history[index];
    if (sample) history[index] = { ...sample, time: sample.time + offsetSeconds };
  }
}

export class WakeSystem {
  readonly root = new THREE.Group();
  readonly #geometry: THREE.BufferGeometry;
  readonly #material: THREE.ShaderMaterial;
  readonly #history: WakeSample[] = [];
  #displacementEnabled = true;

  constructor() {
    this.root.name = 'wake';
    const positions = new Float32Array(SEGMENTS * 2 * 3);
    const alphas = new Float32Array(SEGMENTS * 2);
    const sides = new Float32Array(SEGMENTS * 2);
    const indices: number[] = [];
    for (let index = 0; index < SEGMENTS - 1; index += 1) {
      const a = index * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    for (let index = 0; index < SEGMENTS; index += 1) {
      sides[index * 2] = -1;
      sides[index * 2 + 1] = 1;
    }
    this.#geometry = new THREE.BufferGeometry();
    this.#geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.#geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    this.#geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    this.#geometry.setIndex(indices);
    this.#material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSide;
        varying float vAlpha;
        varying float vSide;
        varying vec3 vWorld;
        void main(){
          vAlpha=aAlpha;
          vSide=aSide;
          vec4 world=modelMatrix*vec4(position,1.0);
          vWorld=world.xyz;
          gl_Position=projectionMatrix*viewMatrix*world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying float vAlpha;
        varying float vSide;
        varying vec3 vWorld;
        void main(){
          float side=abs(vSide);
          float edgeBand=smoothstep(0.48,0.78,side)*(1.0-smoothstep(0.94,1.0,side));
          float ripple=0.5+0.5*sin(dot(vWorld.xz,vec2(5.7,-3.9))+uTime*3.2);
          float breakup=0.58+0.42*smoothstep(-0.25,0.55,
            sin(dot(vWorld.xz,vec2(2.3,3.7))-uTime*1.4));
          float alpha=vAlpha*edgeBand*(0.13+ripple*0.16)*breakup;
          if(alpha<0.003) discard;
          gl_FragColor=vec4(vec3(0.82,0.97,1.0),alpha);
        }
      `,
    });
    const ribbon = new THREE.Mesh(this.#geometry, this.#material);
    ribbon.name = 'wakeRibbon';
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 3;
    this.root.add(ribbon);
  }

  update(timeSeconds: number, state: Readonly<BoatState>, waves: WaveSampler): void {
    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    appendWakeSample(this.#history, {
      x: state.x - forwardX * 4.25,
      z: state.z - forwardZ * 4.25,
      yaw: state.yaw,
      speed: Math.abs(state.surge),
      time: timeSeconds,
    });
    while (this.#history[0] && timeSeconds - this.#history[0].time > MAX_AGE_SECONDS) {
      this.#history.shift();
    }

    const positions = this.#geometry.getAttribute('position') as THREE.BufferAttribute;
    const alphas = this.#geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    for (let index = 0; index < SEGMENTS; index += 1) {
      const historyIndex = Math.max(
        0,
        this.#history.length - 1 - Math.round(index * Math.max(1, this.#history.length - 1) / (SEGMENTS - 1)),
      );
      const sample = this.#history[historyIndex];
      if (!sample) {
        positions.setXYZ(index * 2, state.x, state.heave, state.z);
        positions.setXYZ(index * 2 + 1, state.x, state.heave, state.z);
        alphas.setX(index * 2, 0);
        alphas.setX(index * 2 + 1, 0);
        continue;
      }
      const age = Math.max(0, timeSeconds - sample.time);
      const rightX = Math.cos(sample.yaw);
      const rightZ = -Math.sin(sample.yaw);
      const width = 0.16 + age * (0.58 + Math.min(0.36, sample.speed * 0.03));
      const waterHeight = this.#displacementEnabled
        ? waves.sample(sample.x, sample.z, timeSeconds).height
        : state.heave - 0.24;
      const speedGain = THREE.MathUtils.smoothstep(sample.speed, 0.35, 5);
      const ageFade = Math.max(0, 1 - age / MAX_AGE_SECONDS);
      const alpha = 0.54 * speedGain * ageFade * Math.min(1, index * 0.28);
      positions.setXYZ(index * 2, sample.x - rightX * width, waterHeight + 0.1, sample.z - rightZ * width);
      positions.setXYZ(index * 2 + 1, sample.x + rightX * width, waterHeight + 0.1, sample.z + rightZ * width);
      alphas.setX(index * 2, alpha);
      alphas.setX(index * 2 + 1, alpha);
    }
    positions.needsUpdate = true;
    alphas.needsUpdate = true;
    this.#geometry.computeBoundingSphere();
    this.#material.uniforms.uTime!.value = timeSeconds;
  }

  setDisplacementEnabled(enabled: boolean): void {
    this.#displacementEnabled = enabled;
  }

  rebaseTime(offsetSeconds: number): void {
    rebaseWakeSamples(this.#history, offsetSeconds);
  }

  dispose(): void {
    this.#geometry.dispose();
    this.#material.dispose();
  }
}
