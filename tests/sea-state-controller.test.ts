import { describe, expect, it } from 'vitest';
import { SeaStateController } from '../src/ocean/SeaStateController';

describe('SeaStateController', () => {
  it('moves continuously from clear to storm and remains within physical bounds', () => {
    const sea = new SeaStateController();
    const first = sea.update(1, 1);
    const second = sea.update(1, 1);
    expect(second.stormFactor).toBeGreaterThan(first.stormFactor);
    expect(second.windSpeed).toBeGreaterThanOrEqual(9);
    expect(second.windSpeed).toBeLessThanOrEqual(24);
    expect(second.significantWaveHeight).toBeLessThanOrEqual(3.2);
  });

  it('does not jump when the target reverses', () => {
    const sea = new SeaStateController();
    const before = sea.update(8, 1);
    const after = sea.update(1 / 60, 0);
    expect(Math.abs(after.stormFactor - before.stormFactor)).toBeLessThan(0.01);
  });
});
