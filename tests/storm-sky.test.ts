import { describe, expect, it } from 'vitest';
import { cloudOctavesForTier, sampleStormAtmosphere } from '../src/weather/StormSkySystem';

describe('StormSkySystem atmosphere', () => {
  it('interpolates from tropical daylight to a dark storm palette', () => {
    expect(sampleStormAtmosphere(0).top.getHexString()).toBe('3b91cf');
    expect(sampleStormAtmosphere(1).top.getHexString()).toBe('101d2c');
  });

  it('increases fog monotonically as the storm closes in', () => {
    const clear = sampleStormAtmosphere(0).fogDensity;
    const transition = sampleStormAtmosphere(0.5).fogDensity;
    const storm = sampleStormAtmosphere(1).fogDensity;
    expect(clear).toBeLessThan(transition);
    expect(transition).toBeLessThan(storm);
  });

  it('reduces cloud detail work with the selected quality tier', () => {
    expect(cloudOctavesForTier('high')).toBe(5);
    expect(cloudOctavesForTier('medium')).toBe(4);
    expect(cloudOctavesForTier('low')).toBe(3);
  });
});
