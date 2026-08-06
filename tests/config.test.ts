import { describe, expect, it } from 'vitest';
import { DEFAULT_OCEAN_CONFIG, validateOceanConfig } from '../src/ocean/config';

describe('validateOceanConfig', () => {
  it('accepts the default M4 profile', () => {
    expect(validateOceanConfig(DEFAULT_OCEAN_CONFIG)).toEqual(DEFAULT_OCEAN_CONFIG);
  });

  it('rejects invalid physical inputs', () => {
    expect(() => validateOceanConfig({ ...DEFAULT_OCEAN_CONFIG, gravity: 0 })).toThrow('gravity');
    expect(() => validateOceanConfig({ ...DEFAULT_OCEAN_CONFIG, windDirectionRad: Number.NaN })).toThrow('windDirectionRad');
    expect(() => validateOceanConfig({ ...DEFAULT_OCEAN_CONFIG, componentCount: 2 })).toThrow('componentCount');
  });
});
