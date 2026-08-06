import { describe, expect, it } from 'vitest';
import { AdaptiveQualityController } from '../src/platform/AdaptiveQualityController';

describe('AdaptiveQualityController', () => {
  it('steps down after three slow seconds and waits ten fast seconds to recover', () => {
    const quality = new AdaptiveQualityController('high');
    for (let index = 0; index < 179; index += 1) quality.update(1 / 60, 40);
    expect(quality.tier.name).toBe('high');
    quality.update(1 / 60, 40);
    expect(quality.tier.name).toBe('medium');
    for (let index = 0; index < 599; index += 1) quality.update(1 / 60, 60);
    expect(quality.tier.name).toBe('medium');
    quality.update(1 / 60, 60);
    expect(quality.tier.name).toBe('high');
  });

  it('resets hysteresis in the neutral band and supports deterministic locking', () => {
    const quality = new AdaptiveQualityController('high');
    for (let index = 0; index < 120; index += 1) quality.update(1 / 60, 40);
    quality.update(1 / 60, 48);
    for (let index = 0; index < 120; index += 1) quality.update(1 / 60, 40);
    expect(quality.tier.name).toBe('high');
    quality.lock('low');
    for (let index = 0; index < 900; index += 1) quality.update(1 / 60, 60);
    expect(quality.tier.name).toBe('low');
    expect(quality.locked).toBe(true);
    quality.lock(undefined);
    expect(quality.locked).toBe(false);
  });
});
