export interface QualityProfile {
  oceanSegments: number;
  oceanSizeMeters: number;
  pixelRatioCap: number;
  shadowMapSize: number;
}

export interface OceanSurfaceProfile {
  readonly name: 'desktop' | 'mobile';
  readonly farSizeMeters: number;
  readonly farSegments: number;
  readonly nearSizeMeters: number;
  readonly nearSegments: number;
  readonly overlapMeters: number;
  readonly pixelRatioCap: number;
  readonly antialiasSamples: number;
  readonly snapIntervalMeters: number;
}

export type RuntimeQualityName = 'high' | 'medium' | 'low';

export interface RuntimeQualityTier {
  readonly name: RuntimeQualityName;
  readonly rainCount: number;
  readonly cloudSteps: number;
  readonly fftSize: 64 | 128;
  readonly fftCascades: 1 | 2;
  readonly secondaryLightning: boolean;
  readonly wakeDisplacement: boolean;
  readonly pixelRatioCap: number;
}

export const RUNTIME_QUALITY = Object.freeze({
  high: Object.freeze({
    name: 'high',
    rainCount: 22_000,
    cloudSteps: 5,
    fftSize: 128,
    fftCascades: 2,
    secondaryLightning: true,
    wakeDisplacement: true,
    pixelRatioCap: 1.75,
  }),
  medium: Object.freeze({
    name: 'medium',
    rainCount: 12_000,
    cloudSteps: 4,
    fftSize: 128,
    fftCascades: 1,
    secondaryLightning: true,
    wakeDisplacement: false,
    pixelRatioCap: 1.5,
  }),
  low: Object.freeze({
    name: 'low',
    rainCount: 6_000,
    cloudSteps: 3,
    fftSize: 64,
    fftCascades: 1,
    secondaryLightning: false,
    wakeDisplacement: false,
    pixelRatioCap: 1.25,
  }),
} satisfies Record<RuntimeQualityName, RuntimeQualityTier>);

export const QUALITY_PROFILES = Object.freeze({
  high: Object.freeze({ oceanSegments: 256, oceanSizeMeters: 1_500, pixelRatioCap: 1.75, shadowMapSize: 2048 }),
  medium: Object.freeze({ oceanSegments: 192, oceanSizeMeters: 1_200, pixelRatioCap: 1.25, shadowMapSize: 1024 }),
  low: Object.freeze({ oceanSegments: 128, oceanSizeMeters: 900, pixelRatioCap: 1, shadowMapSize: 1024 }),
} satisfies Record<'high' | 'medium' | 'low', QualityProfile>);

export const OCEAN_SURFACE_PROFILES = Object.freeze({
  desktop: Object.freeze({
    name: 'desktop',
    farSizeMeters: 1_500,
    farSegments: 192,
    nearSizeMeters: 420,
    nearSegments: 320,
    overlapMeters: 20,
    pixelRatioCap: 1.75,
    antialiasSamples: 4,
    snapIntervalMeters: 8,
  }),
  mobile: Object.freeze({
    name: 'mobile',
    farSizeMeters: 900,
    farSegments: 128,
    nearSizeMeters: 320,
    nearSegments: 192,
    overlapMeters: 16,
    pixelRatioCap: 1.25,
    antialiasSamples: 0,
    snapIntervalMeters: 8,
  }),
} satisfies Record<'desktop' | 'mobile', OceanSurfaceProfile>);
