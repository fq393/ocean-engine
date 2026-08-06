import { describe, expect, it } from 'vitest';
import {
  fftStageCount,
  selectSpectralTier,
  spectralSeedScale,
} from '../src/ocean/SpectralOcean';
import { ASSEMBLE_SURFACE_FRAGMENT } from '../src/ocean/SpectralShaders';

describe('SpectralOcean quality helpers', () => {
  it('uses exact FFT tiers and radix-two stages', () => {
    expect(selectSpectralTier(1920)).toEqual({ size: 128, cascades: 2 });
    expect(selectSpectralTier(900)).toEqual({ size: 128, cascades: 1 });
    expect(selectSpectralTier(390)).toEqual({ size: 64, cascades: 1 });
    expect(fftStageCount(128)).toBe(7);
    expect(spectralSeedScale(128)).toBeCloseTo(16_384 / Math.SQRT2, 8);
    expect(() => fftStageCount(96)).toThrow(/power of two/);
    expect(ASSEMBLE_SURFACE_FRAGMENT).not.toContain('uHeightScale');
  });
});
