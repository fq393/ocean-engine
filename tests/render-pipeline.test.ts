import { describe, expect, it } from 'vitest';
import { bloomForStorm, resolveAntialiasSamples } from '../src/visual/RenderPipeline';

describe('resolveAntialiasSamples', () => {
  it('uses four samples when the renderer supports them', () => {
    expect(resolveAntialiasSamples(4, 8)).toBe(4);
  });

  it('falls back to the renderer maximum or zero', () => {
    expect(resolveAntialiasSamples(4, 2)).toBe(2);
    expect(resolveAntialiasSamples(4, 0)).toBe(0);
    expect(resolveAntialiasSamples(0, 8)).toBe(0);
  });

  it('rejects invalid sample counts', () => {
    expect(() => resolveAntialiasSamples(-1, 4)).toThrow('requested');
    expect(() => resolveAntialiasSamples(4, -1)).toThrow('maximum');
  });
});

describe('bloomForStorm', () => {
  it('moves continuously from clear highlights to storm lightning bloom', () => {
    expect(bloomForStorm(0)).toEqual({ strength: 0.1, threshold: 1.1, radius: 0.16 });
    expect(bloomForStorm(1)).toEqual({ strength: 0.24, threshold: 0.82, radius: 0.22 });
    expect(bloomForStorm(0.5)).toEqual({ strength: 0.17, threshold: 0.96, radius: 0.19 });
  });
});
