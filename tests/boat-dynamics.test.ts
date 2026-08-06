import { describe, expect, it } from 'vitest';
import { BoatDynamics } from '../src/boat/BoatDynamics';
import { INITIAL_BOAT_STATE } from '../src/boat/types';

const flat = {
  sample: () => ({
    height: 0,
    normal: { x: 0, y: 1, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
  }),
};
const calm = { windX: 0, windZ: 0, stormFactor: 0 };

describe('BoatDynamics', () => {
  it('accelerates forward and gains rudder authority only while moving', () => {
    const boat = new BoatDynamics(INITIAL_BOAT_STATE);
    for (let index = 0; index < 180; index += 1) {
      boat.update(1 / 60, index / 60, { throttle: 1, rudder: 1 }, flat, calm);
    }
    expect(boat.state.surge).toBeGreaterThan(2);
    expect(Math.abs(boat.state.yawRate)).toBeGreaterThan(0.01);
  });

  it('remains finite after a long variable-step run', () => {
    const boat = new BoatDynamics(INITIAL_BOAT_STATE);
    for (let index = 0; index < 2_000; index += 1) {
      boat.update(
        index % 2 ? 1 / 20 : 1 / 120,
        index / 60,
        { throttle: 0.7, rudder: -0.4 },
        flat,
        calm,
      );
    }
    expect(Object.values(boat.state).every(Number.isFinite)).toBe(true);
    expect(Math.abs(boat.state.roll)).toBeLessThanOrEqual(Math.PI * 0.36);
  });

  it('samples center, bow, stern, port, and starboard once per update', () => {
    let samples = 0;
    const waves = {
      sample: () => {
        samples += 1;
        return flat.sample();
      },
    };
    new BoatDynamics(INITIAL_BOAT_STATE).update(
      1 / 60,
      0,
      { throttle: 0, rudder: 0 },
      waves,
      calm,
    );
    expect(samples).toBe(5);
  });
});
