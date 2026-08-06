import { describe, expect, it } from 'vitest';
import { Flash, FlashType, makeRng } from '../src/weather/lightning-core';

describe('ported lightning core', () => {
  it('keeps deterministic random sequences', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('replays fixed-seed flash telemetry', () => {
    const flash = new Flash({ type: FlashType.NEGATIVE_CG, seed: 1234 });
    let guard = 0;
    while (!flash.done && guard++ < 400_000) flash.update(2e-4);
    const telemetry = flash.telemetry();
    expect(guard).toBeLessThan(400_000);
    expect(telemetry.strokeIndex).toBeGreaterThanOrEqual(1);
    expect(telemetry.peakCurrent).toBeGreaterThan(10_000);
    expect(telemetry.peakCurrent).toBeLessThan(80_000);
  });
});
