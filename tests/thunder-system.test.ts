import { describe, expect, it } from 'vitest';
import {
  estimateFirstThunderArrival,
  sceneListenerToSimulation,
} from '../src/weather/ThunderSystem';
import type { LightningChannel } from '../src/weather/LightningSimulation';

describe('ThunderSystem acoustic mapping', () => {
  it('maps the chase listener back from y-up scene metres to z-up simulation metres', () => {
    expect(sceneListenerToSimulation(
      { x: -15, y: 12, z: -85 },
      { scale: 0.03, originX: -45, originZ: -70 },
    )).toEqual({ x: 1_000, y: -500, z: 400 });
  });

  it('uses physical sound travel time for a kilometre-distant channel', () => {
    const channel: LightningChannel = {
      count: 2,
      x: new Float32Array([1_000, 1_000]),
      y: new Float32Array([0, 0]),
      z: new Float32Array([0, 100]),
      parent: new Int32Array([-1, 0]),
      segLen: new Float32Array([0, 100]),
      current: new Float32Array([0, 30_000]),
      temp: new Float32Array([0, 30_000]),
      lum: new Float32Array([0, 1]),
    };
    const delay = estimateFirstThunderArrival(channel, { x: 0, y: 0, z: 50 });
    expect(delay).toBeCloseTo(1_000 / 343, 1);
  });
});
