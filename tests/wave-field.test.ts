import { describe, expect, it } from 'vitest';
import { WaveField } from '../src/ocean/WaveField';

describe('WaveField', () => {
  it('keeps phase continuous while storm energy rises', () => {
    const field = WaveField.default();
    const clear = field.sample(12, -7, 3, 0);
    const nearClear = field.sample(12, -7, 3, 0.001);
    expect(Math.abs(clear.height - nearClear.height)).toBeLessThan(0.02);

    const clearEnergy = field.components(0)
      .reduce((energy, wave) => energy + wave.amplitude * wave.amplitude, 0);
    const stormEnergy = field.components(1)
      .reduce((energy, wave) => energy + wave.amplitude * wave.amplitude, 0);
    expect(stormEnergy).toBeGreaterThan(clearEnergy * 2);
  });

  it('preserves component phases and wave numbers across the paired spectrum', () => {
    const field = WaveField.default();
    const clear = field.components(0);
    const storm = field.components(1);
    expect(storm).toHaveLength(clear.length);
    storm.forEach((wave, index) => {
      expect(wave.phase).toBe(clear[index]?.phase);
      expect(wave.waveNumber).toBe(clear[index]?.waveNumber);
    });
  });

  it('normalizes component variance to the specified significant wave heights', () => {
    const field = WaveField.default();
    const significantHeight = (stormFactor: number): number => {
      const variance = field.components(stormFactor)
        .reduce((total, wave) => total + wave.amplitude * wave.amplitude * 0.5, 0);
      return 4 * Math.sqrt(variance);
    };
    expect(significantHeight(0)).toBeGreaterThanOrEqual(0.6);
    expect(significantHeight(0)).toBeLessThanOrEqual(1);
    expect(significantHeight(1)).toBeGreaterThanOrEqual(2.2);
    expect(significantHeight(1)).toBeLessThanOrEqual(3.2);
  });
});
