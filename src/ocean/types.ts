export interface OceanConfig {
  seed: string;
  gravity: number;
  windSpeed: number;
  windDirectionRad: number;
  fetchMeters: number;
  peakEnhancement: number;
  componentCount: number;
  minWavelength: number;
  maxWavelength: number;
}

export interface WaveComponent {
  amplitude: number;
  angularFrequency: number;
  waveNumber: number;
  directionX: number;
  directionZ: number;
  phase: number;
  steepness: number;
}

export interface WaveSample {
  height: number;
  normal: Readonly<{ x: number; y: number; z: number }>;
  velocity: Readonly<{ x: number; y: number; z: number }>;
}
