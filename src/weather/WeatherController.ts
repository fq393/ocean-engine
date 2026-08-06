import * as THREE from 'three';
import { SeaStateController } from '../ocean/SeaStateController';
import type { LightningFrameState, WeatherFrame } from './types';

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export class WeatherController {
  readonly #seaState = new SeaStateController();
  #target = 0;
  #stormFactor = 0;

  get stormFactor(): number {
    return this.#stormFactor;
  }

  get lightningEnabled(): boolean {
    return this.#stormFactor > 0.7;
  }

  toggle(): void {
    this.#target = this.#target > 0.5 ? 0 : 1;
  }

  setTarget(value: number): void {
    this.#target = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
  }

  update(
    deltaSeconds: number,
    time: number,
    lightning: Readonly<LightningFrameState>,
  ): Readonly<WeatherFrame> {
    void time;
    const sea = this.#seaState.update(deltaSeconds, this.#target);
    this.#stormFactor = sea.stormFactor;
    const rain = smoothstep(0.18, 0.82, this.#stormFactor);
    const clouds = smoothstep(0.02, 0.75, this.#stormFactor);
    const fogMix = smoothstep(0.2, 1, this.#stormFactor);
    const windX = Math.cos(sea.windDirectionRad) * sea.windSpeed;
    const windZ = Math.sin(sea.windDirectionRad) * sea.windSpeed;
    return Object.freeze({
      mode: this.#target > 0.5 || this.#stormFactor > 0.5 ? 'storm' : 'clear',
      stormFactor: this.#stormFactor,
      windX,
      windZ,
      rain,
      clouds,
      fogDensity: THREE.MathUtils.lerp(0.0016, 0.0062, fogMix),
      ambientExposure: THREE.MathUtils.lerp(1, 0.48, this.#stormFactor),
      sea,
      lightning: lightning.lights,
      flashExposure: THREE.MathUtils.clamp(lightning.flashExposure, 0, 1.4),
    });
  }
}
