export { Flash, FlashType, Phase, defaultRegionsFor, makeTarget } from './flash';
export { Channel, NODE } from './channel';
export { makeRng, fibonacciSphere, hashSeed } from './rng';
export { blackbodyRGB } from './current';
export { buildThunderImpulseResponse, delayPerKm, spectralPeak } from './thunder';

export interface FlashOptions {
  readonly type?: 'negative-cg' | 'positive-cg' | 'intracloud';
  readonly seed?: number;
  readonly regions?: readonly unknown[];
  readonly targets?: readonly unknown[];
  readonly stormJitter?: number;
  readonly stormIntensity?: number;
  readonly thresholdScale?: number;
  readonly maxRoundsPerUpdate?: number;
  readonly now?: () => number;
}

export interface FlashTelemetry {
  readonly time: number;
  readonly phase: string;
  readonly seed: number;
  readonly type: string;
  readonly nodes: number;
  readonly channelLength: number;
  readonly branches: number;
  readonly activeTips: number;
  readonly strokeIndex: number;
  readonly peakCurrent: number;
  readonly chargeTransferred: number;
  readonly peakTemp: number;
  readonly events: readonly unknown[];
}
