import { DEFAULT_OCEAN_CONFIG } from './config';
import { createPairedWaveComponents, normalizeSignificantWaveHeight } from './spectrum';
import type { WaveComponent, WaveSample } from './types';
import { WaveQuery } from './wave-query';

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export class WaveField {
  readonly #clear: readonly WaveComponent[];
  readonly #storm: readonly WaveComponent[];
  readonly #clearQuery: WaveQuery;
  readonly #stormQuery: WaveQuery;

  constructor(clear: readonly WaveComponent[], storm: readonly WaveComponent[]) {
    if (clear.length !== storm.length) {
      throw new RangeError('paired wave component arrays must have equal length');
    }
    this.#clear = clear;
    this.#storm = storm;
    this.#clearQuery = new WaveQuery(clear);
    this.#stormQuery = new WaveQuery(storm);
  }

  static default(): WaveField {
    const pair = createPairedWaveComponents(DEFAULT_OCEAN_CONFIG, {
      ...DEFAULT_OCEAN_CONFIG,
      windSpeed: 22,
      windDirectionRad: Math.PI * 0.32,
      fetchMeters: 130_000,
    });
    return new WaveField(
      normalizeSignificantWaveHeight(pair.clear, 0.8),
      normalizeSignificantWaveHeight(pair.storm, 2.8),
    );
  }

  components(stormFactorRaw: number): readonly WaveComponent[] {
    const stormFactor = clamp01(stormFactorRaw);
    return Object.freeze(this.#clear.map((clearWave, index) => {
      const stormWave = this.#storm[index];
      if (!stormWave) throw new RangeError('paired wave component missing');
      const directionX = mix(clearWave.directionX, stormWave.directionX, stormFactor);
      const directionZ = mix(clearWave.directionZ, stormWave.directionZ, stormFactor);
      const directionLength = Math.hypot(directionX, directionZ);
      return Object.freeze({
        ...clearWave,
        amplitude: mix(clearWave.amplitude, stormWave.amplitude, stormFactor),
        directionX: directionX / directionLength,
        directionZ: directionZ / directionLength,
        steepness: mix(clearWave.steepness, stormWave.steepness, stormFactor),
      });
    }));
  }

  sample(
    x: number,
    z: number,
    timeSeconds: number,
    stormFactorRaw: number,
  ): WaveSample {
    const stormFactor = clamp01(stormFactorRaw);
    const clear = this.#clearQuery.sample(x, z, timeSeconds);
    const storm = this.#stormQuery.sample(x, z, timeSeconds);
    const normalX = mix(clear.normal.x, storm.normal.x, stormFactor);
    const normalY = mix(clear.normal.y, storm.normal.y, stormFactor);
    const normalZ = mix(clear.normal.z, storm.normal.z, stormFactor);
    const normalLength = Math.hypot(normalX, normalY, normalZ);
    return {
      height: mix(clear.height, storm.height, stormFactor),
      normal: {
        x: normalX / normalLength,
        y: normalY / normalLength,
        z: normalZ / normalLength,
      },
      velocity: {
        x: mix(clear.velocity.x, storm.velocity.x, stormFactor),
        y: mix(clear.velocity.y, storm.velocity.y, stormFactor),
        z: mix(clear.velocity.z, storm.velocity.z, stormFactor),
      },
    };
  }
}
