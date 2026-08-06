import { describe, expect, it } from 'vitest';
import { intentFromKeys } from '../src/boat/BoatController';

describe('BoatController', () => {
  it('maps WASD to throttle and camera-relative steering intent', () => {
    expect(intentFromKeys(new Set(['KeyW', 'KeyA']))).toEqual({ throttle: 1, rudder: 1 });
    expect(intentFromKeys(new Set(['KeyS', 'KeyD']))).toEqual({ throttle: -1, rudder: -1 });
    expect(intentFromKeys(new Set(['KeyW', 'KeyS']))).toEqual({ throttle: 0, rudder: 0 });
  });
});
