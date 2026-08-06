import { describe, expect, it } from 'vitest';
import { createMaterialLibrary } from '../src/visual/MaterialLibrary';
import { createIsland, sampleIslandHeight } from '../src/visual/IslandFactory';

describe('IslandFactory', () => {
  it('creates a deterministic raised center and submerged shelf', () => {
    expect(sampleIslandHeight(0, 0)).toBeGreaterThan(2);
    expect(sampleIslandHeight(0.7, 1.2)).toBeGreaterThan(0);
    expect(sampleIslandHeight(1.06, 2.5)).toBeLessThan(0);
    expect(sampleIslandHeight(0.47, 1.1)).toBe(sampleIslandHeight(0.47, 1.1));
  });

  it('builds named authored layers with bounded repeated props', () => {
    const island = createIsland(createMaterialLibrary());
    expect(island.root.name).toBe('island');
    for (const name of ['terrain', 'villa', 'jetty', 'palms', 'rocks']) {
      expect(island.root.getObjectByName(name), `${name} missing`).toBeTruthy();
    }
    expect(island.diagnostics.palms).toBeGreaterThanOrEqual(8);
    expect(island.diagnostics.palms).toBeLessThanOrEqual(18);
    expect(island.diagnostics.rocks).toBeLessThanOrEqual(24);
  });
});
