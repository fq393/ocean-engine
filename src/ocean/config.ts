import type { OceanConfig } from './types';

export const DEFAULT_OCEAN_CONFIG: Readonly<OceanConfig> = Object.freeze({
  seed: 'tropical-default-v1',
  gravity: 9.81,
  windSpeed: 9,
  windDirectionRad: Math.PI * 0.2,
  fetchMeters: 50_000,
  peakEnhancement: 3.3,
  componentCount: 16,
  minWavelength: 2,
  maxWavelength: 200,
});

export function validateOceanConfig(input: OceanConfig): OceanConfig {
  const finitePositive: Array<keyof OceanConfig> = [
    'gravity', 'windSpeed', 'fetchMeters', 'peakEnhancement', 'minWavelength', 'maxWavelength',
  ];
  for (const key of finitePositive) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${key} must be a finite positive number`);
    }
  }
  if (!Number.isFinite(input.windDirectionRad)) {
    throw new RangeError('windDirectionRad must be finite');
  }
  if (!Number.isInteger(input.componentCount) || input.componentCount < 4 || input.componentCount > 64) {
    throw new RangeError('componentCount must be an integer from 4 to 64');
  }
  if (input.minWavelength >= input.maxWavelength) {
    throw new RangeError('minWavelength must be less than maxWavelength');
  }
  if (input.seed.trim().length === 0) throw new RangeError('seed must not be empty');
  return { ...input };
}
