import { describe, expect, it } from 'vitest';
import { resolveBoatCollisions } from '../src/boat/BoatCollision';
import { INITIAL_BOAT_STATE } from '../src/boat/types';

describe('resolveBoatCollisions', () => {
  it('projects a penetrating boat outside a shore collider', () => {
    const state = { ...INITIAL_BOAT_STATE, x: 0, z: -28, surge: 4 };
    const hit = resolveBoatCollisions(state, [
      { x: 0, z: -28, radius: 19, dragRadius: 23 },
    ]);
    expect(hit.collided).toBe(true);
    expect(Math.hypot(state.x, state.z + 28)).toBeGreaterThanOrEqual(19);
    expect(state.surge).toBeLessThan(4);
  });
});
