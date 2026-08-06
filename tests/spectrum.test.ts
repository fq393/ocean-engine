import { describe, expect, it } from 'vitest';
import { DEFAULT_OCEAN_CONFIG } from '../src/ocean/config';
import { createWaveComponents, jonswapDensity } from '../src/ocean/spectrum';

describe('JONSWAP spectrum', () => {
  it('returns finite non-negative density', () => {
    for (const omega of [0.2, 0.5, 1, 2, 4]) {
      expect(jonswapDensity(omega, DEFAULT_OCEAN_CONFIG)).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(jonswapDensity(omega, DEFAULT_OCEAN_CONFIG))).toBe(true);
    }
  });

  it('creates deterministic normalized components in the wavelength range', () => {
    const first = createWaveComponents(DEFAULT_OCEAN_CONFIG);
    const second = createWaveComponents(DEFAULT_OCEAN_CONFIG);
    expect(first).toEqual(second);
    expect(first).toHaveLength(DEFAULT_OCEAN_CONFIG.componentCount);
    for (const wave of first) {
      const wavelength = (Math.PI * 2) / wave.waveNumber;
      expect(wavelength).toBeGreaterThanOrEqual(DEFAULT_OCEAN_CONFIG.minWavelength);
      expect(wavelength).toBeLessThanOrEqual(DEFAULT_OCEAN_CONFIG.maxWavelength);
      expect(Math.hypot(wave.directionX, wave.directionZ)).toBeCloseTo(1, 8);
      expect(wave.steepness).toBeGreaterThanOrEqual(0);
      expect(wave.steepness).toBeLessThanOrEqual(0.85);
    }
  });
});
