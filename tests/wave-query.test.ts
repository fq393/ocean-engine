import { describe, expect, it } from 'vitest';
import type { WaveComponent } from '../src/ocean/types';
import { WaveQuery } from '../src/ocean/wave-query';

const wave: WaveComponent = {
  amplitude: 2,
  angularFrequency: 1,
  waveNumber: 0.5,
  directionX: 1,
  directionZ: 0,
  phase: 0,
  steepness: 0.5,
};

describe('WaveQuery', () => {
  it('samples known height and vertical velocity at the origin', () => {
    const query = new WaveQuery([wave]);
    expect(query.sample(0, 0, 0).height).toBeCloseTo(0, 10);
    expect(query.sample(0, 0, 0).velocity.y).toBeCloseTo(-2, 10);
    expect(query.sample(0, 0, Math.PI / 2).height).toBeCloseTo(-2, 10);
  });

  it('returns a unit upward-facing normal', () => {
    const sample = new WaveQuery([wave]).sample(1, 0, 0.25);
    expect(Math.hypot(sample.normal.x, sample.normal.y, sample.normal.z)).toBeCloseTo(1, 10);
    expect(sample.normal.y).toBeGreaterThan(0);
  });

  it('rejects non-finite inputs', () => {
    const query = new WaveQuery([wave]);
    expect(() => query.sample(Number.NaN, 0, 0)).toThrow('finite');
  });
});
