import { describe, expect, it } from 'vitest';
import { createPrng } from '../src/ocean/prng';

describe('createPrng', () => {
  it('replays a sequence from the same seed', () => {
    const a = createPrng('tropical-calm');
    const b = createPrng('tropical-calm');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('returns values in [0, 1)', () => {
    const random = createPrng('range-check');
    for (let index = 0; index < 100; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
