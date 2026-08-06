export interface LightningLightSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly power: number;
}

export interface LightningFrameState {
  readonly lights: readonly LightningLightSample[];
  readonly flashExposure: number;
}

export interface SeaState {
  readonly stormFactor: number;
  readonly windSpeed: number;
  readonly windDirectionRad: number;
  readonly significantWaveHeight: number;
  readonly peakPeriod: number;
  readonly directionalSpread: number;
  readonly choppiness: number;
}

export interface WeatherFrame {
  readonly mode: 'clear' | 'storm';
  readonly stormFactor: number;
  readonly windX: number;
  readonly windZ: number;
  readonly rain: number;
  readonly clouds: number;
  readonly fogDensity: number;
  readonly ambientExposure: number;
  readonly sea: SeaState;
  readonly lightning: readonly LightningLightSample[];
  readonly flashExposure: number;
}
