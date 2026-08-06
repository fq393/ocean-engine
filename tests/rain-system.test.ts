import { describe, expect, it } from 'vitest';
import { clampRainIntensity, rainCountForTier } from '../src/weather/RainSystem';

describe('RainSystem helpers', () => {
  it('assigns bounded particle counts to each quality tier', () => {
    expect(rainCountForTier('high')).toBe(22_000);
    expect(rainCountForTier('medium')).toBe(12_000);
    expect(rainCountForTier('low')).toBe(6_000);
  });

  it('clamps rain intensity to a physical fraction', () => {
    expect(clampRainIntensity(-1)).toBe(0);
    expect(clampRainIntensity(0.42)).toBe(0.42);
    expect(clampRainIntensity(2)).toBe(1);
  });
});
