import { describe, expect, it } from 'vitest';
import { DEFAULT_OCEAN_CONFIG } from '../src/ocean/config';
import { createWaveComponents } from '../src/ocean/spectrum';
import {
  clampFoamThreshold,
  packLightningUniforms,
  packWaveUniforms,
} from '../src/render/OceanWater';
import { OCEAN_FRAGMENT_SHADER, OCEAN_VERTEX_SHADER } from '../src/render/OceanSurfaceShaders';

describe('OceanWater helpers', () => {
  it('packs at least twelve deterministic wave components', () => {
    const waves = createWaveComponents(DEFAULT_OCEAN_CONFIG);
    const packed = packWaveUniforms(waves, 16);
    expect(packed.data).toHaveLength(16);
    expect(packed.meta).toHaveLength(16);
    expect(packed.count).toBe(16);
    expect(packed.data[0]?.toArray()).toEqual(packWaveUniforms(waves, 16).data[0]?.toArray());
  });

  it('clamps foam thresholds away from unstable extremes', () => {
    expect(clampFoamThreshold(-2)).toBe(0.35);
    expect(clampFoamThreshold(0.72)).toBe(0.72);
    expect(clampFoamThreshold(4)).toBe(0.92);
  });

  it('packs at most four immutable lightning samples for both ocean layers', () => {
    const packed = packLightningUniforms([
      { x: 1, y: 2, z: 3, r: 0.8, g: 0.9, b: 1, power: 40 },
      { x: 4, y: 5, z: 6, r: 1, g: 1, b: 1, power: 20 },
      { x: 7, y: 8, z: 9, r: 1, g: 1, b: 1, power: 10 },
      { x: 10, y: 11, z: 12, r: 1, g: 1, b: 1, power: 5 },
      { x: 13, y: 14, z: 15, r: 1, g: 1, b: 1, power: 1 },
    ]);
    expect(packed.count).toBe(4);
    expect(packed.positions[0]?.toArray()).toEqual([1, 2, 3]);
    expect(packed.colors[0]?.toArray()).toEqual([0.8, 0.9, 1]);
    expect(packed.powers).toEqual([40, 20, 10, 5]);
  });

  it('ships the Ocean V2 sampling and shoreline features', () => {
    expect(OCEAN_VERTEX_SHADER).toContain('uMinimumGeometryWavelength');
    expect(OCEAN_VERTEX_SHADER).toContain('uClipNearPatch');
    expect(OCEAN_FRAGMENT_SHADER).toContain('detailOctave');
    expect(OCEAN_FRAGMENT_SHADER).toContain('fwidth');
    expect(OCEAN_VERTEX_SHADER).toContain('uDisplacement');
    expect(OCEAN_VERTEX_SHADER).toContain('uDisplacementFar');
    expect(OCEAN_VERTEX_SHADER).toContain('uSlope');
    expect(OCEAN_VERTEX_SHADER).toContain('uSlopeFar');
    expect(OCEAN_FRAGMENT_SHADER).toContain('uShoreField');
    expect(OCEAN_FRAGMENT_SHADER).toContain('compression');
    expect(OCEAN_FRAGMENT_SHADER).toContain('shoreBreak');
    expect(OCEAN_FRAGMENT_SHADER).toContain('continuousNoise');
    expect(OCEAN_FRAGMENT_SHADER).toContain('caustics');
    expect(OCEAN_FRAGMENT_SHADER).toContain('uLightningPosition');
    expect(OCEAN_FRAGMENT_SHADER).toContain('lightningSpecular');
    expect(OCEAN_FRAGMENT_SHADER).toContain('uFlashExposure');
    expect(OCEAN_FRAGMENT_SHADER).not.toContain('hash21(floor');
  });
});
