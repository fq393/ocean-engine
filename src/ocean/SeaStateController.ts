import type { SeaState } from '../weather/types';

export const CLEAR_SEA: Readonly<SeaState> = Object.freeze({
  stormFactor: 0,
  windSpeed: 9,
  windDirectionRad: Math.PI * 0.2,
  significantWaveHeight: 0.8,
  peakPeriod: 5,
  directionalSpread: 0.7,
  choppiness: 0.28,
});

export const STORM_SEA: Readonly<SeaState> = Object.freeze({
  stormFactor: 1,
  windSpeed: 22,
  windDirectionRad: Math.PI * 0.32,
  significantWaveHeight: 2.8,
  peakPeriod: 8.5,
  directionalSpread: 0.42,
  choppiness: 0.78,
});

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);

export class SeaStateController {
  #factor = 0;

  update(dtRaw: number, targetRaw: number): Readonly<SeaState> {
    const dt = Math.min(Math.max(dtRaw, 0), 1 / 30);
    const target = Math.min(1, Math.max(0, targetRaw));
    const duration = target > this.#factor ? 18 : 24;
    this.#factor += Math.sign(target - this.#factor)
      * Math.min(Math.abs(target - this.#factor), dt / duration);
    const t = smooth(this.#factor);
    return Object.freeze({
      stormFactor: this.#factor,
      windSpeed: mix(CLEAR_SEA.windSpeed, STORM_SEA.windSpeed, t),
      windDirectionRad: mix(CLEAR_SEA.windDirectionRad, STORM_SEA.windDirectionRad, t),
      significantWaveHeight: mix(CLEAR_SEA.significantWaveHeight, STORM_SEA.significantWaveHeight, t),
      peakPeriod: mix(CLEAR_SEA.peakPeriod, STORM_SEA.peakPeriod, t),
      directionalSpread: mix(CLEAR_SEA.directionalSpread, STORM_SEA.directionalSpread, t),
      choppiness: mix(CLEAR_SEA.choppiness, STORM_SEA.choppiness, t),
    });
  }
}
