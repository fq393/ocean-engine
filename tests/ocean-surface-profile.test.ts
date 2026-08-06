import { describe, expect, it } from 'vitest';
import { OCEAN_SURFACE_PROFILES } from '../src/platform/quality';
import {
  effectivePixelRatio,
  gridSpacingMeters,
  minimumResolvedWavelength,
  selectOceanSurfaceProfile,
  snapOceanCenter,
} from '../src/render/OceanSurfaceProfile';

describe('OceanSurfaceProfile', () => {
  it('selects the documented desktop profile', () => {
    expect(selectOceanSurfaceProfile(1280)).toBe(OCEAN_SURFACE_PROFILES.desktop);
    expect(OCEAN_SURFACE_PROFILES.desktop).toMatchObject({
      farSizeMeters: 1500,
      farSegments: 192,
      nearSizeMeters: 420,
      nearSegments: 320,
      overlapMeters: 20,
      pixelRatioCap: 1.75,
      antialiasSamples: 4,
    });
  });

  it('selects the documented mobile profile', () => {
    expect(selectOceanSurfaceProfile(390)).toBe(OCEAN_SURFACE_PROFILES.mobile);
    expect(OCEAN_SURFACE_PROFILES.mobile).toMatchObject({
      farSizeMeters: 900,
      farSegments: 128,
      nearSizeMeters: 320,
      nearSegments: 192,
      overlapMeters: 16,
      pixelRatioCap: 1.25,
      antialiasSamples: 0,
    });
  });

  it('calculates sampling limits and clamps DPR', () => {
    expect(gridSpacingMeters(420, 320)).toBeCloseTo(1.3125, 8);
    expect(minimumResolvedWavelength(420, 320)).toBeCloseTo(2.625, 8);
    expect(effectivePixelRatio(2, 1.75)).toBe(1.75);
    expect(effectivePixelRatio(1, 1.75)).toBe(1);
  });

  it('snaps the near patch without per-frame swimming', () => {
    expect(snapOceanCenter(38.2, 34.9, 8)).toEqual({ x: 40, z: 32 });
    expect(snapOceanCenter(39.8, 35.7, 8)).toEqual({ x: 40, z: 32 });
    expect(snapOceanCenter(44.1, 36.2, 8)).toEqual({ x: 48, z: 40 });
  });

  it('rejects invalid grid inputs', () => {
    expect(() => gridSpacingMeters(0, 320)).toThrow('sizeMeters');
    expect(() => gridSpacingMeters(420, 0)).toThrow('segments');
    expect(() => snapOceanCenter(0, 0, 0)).toThrow('interval');
  });
});
