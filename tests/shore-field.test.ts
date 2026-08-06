import { describe, expect, it } from 'vitest';
import { ShoreField } from '../src/ocean/ShoreField';

describe('ShoreField', () => {
  it('produces deterministic signed distance samples and a 128 square texture', () => {
    const shore = ShoreField.fromPolygon(
      [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }],
      { minX: -8, minZ: -8, maxX: 8, maxZ: 8 },
      128,
    );
    expect(shore.sample(0, 0)).toBeLessThan(0);
    expect(shore.sample(4, 0)).toBeGreaterThan(0);
    expect(shore.texture.image.data).toHaveLength(128 * 128);
    shore.dispose();
  });

  it('places the organic fallback around the existing island center', () => {
    const shore = ShoreField.fallbackIsland();
    expect(shore.sample(0, -28)).toBeLessThan(0);
    expect(shore.sample(32, -28)).toBeGreaterThan(0);
    expect(shore.sample(0, -8)).toBeGreaterThan(0);
    shore.dispose();
  });
});
