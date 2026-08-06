import { describe, expect, it } from 'vitest';
import { computeChaseTarget } from '../src/boat/ChaseCamera';
import { INITIAL_BOAT_STATE } from '../src/boat/types';

describe('computeChaseTarget', () => {
  it('places the camera behind and above the yacht', () => {
    const pose = computeChaseTarget({
      ...INITIAL_BOAT_STATE,
      x: 10,
      z: 20,
      yaw: 0,
      surge: 8,
    });
    expect(pose.position.z).toBeLessThan(20);
    expect(pose.position.y).toBeGreaterThan(5);
    expect(pose.fov).toBeGreaterThan(47);
  });
});
