import { describe, expect, it } from 'vitest';
import { LightningSimulation, mapLightningPoint } from '../src/weather/LightningSimulation';

describe('LightningSimulation', () => {
  it('maps z-up kilometres into y-up scene metres', () => {
    expect(mapLightningPoint(
      { x: 1_000, y: -500, z: 5_000 },
      { scale: 0.03, originX: -45, originZ: -70 },
    )).toEqual({ x: -15, y: 150, z: -85 });
  });

  it('honours a wall-clock deadline', () => {
    let now = 0;
    const simulation = new LightningSimulation({
      seed: 1234,
      now: () => (now += 0.5),
      budgetMs: 2,
    });
    simulation.setStormEnabled(true);
    simulation.newFlash(1234);
    simulation.update(1 / 30);
    expect(simulation.lastPhysicsMs).toBeLessThanOrEqual(3);
    expect(simulation.channel?.count).toBeGreaterThan(0);
  });

  it('does no leader-growth work while the storm is disabled', () => {
    let now = 0;
    const simulation = new LightningSimulation({ now: () => ++now, budgetMs: 2 });
    simulation.newFlash(7);
    const before = simulation.channel?.count;
    simulation.update(1 / 30);
    expect(simulation.channel?.count).toBe(before);
    expect(simulation.lastPhysicsMs).toBe(0);
  });
});
