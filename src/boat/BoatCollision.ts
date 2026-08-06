import type { BoatState } from './types';

export interface CircleCollider {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly dragRadius: number;
}

export interface BoatCollisionResult {
  readonly collided: boolean;
  readonly shallow: boolean;
}

export function resolveBoatCollisions(
  state: BoatState,
  colliders: readonly CircleCollider[],
): BoatCollisionResult {
  let collided = false;
  let shallow = false;
  for (const collider of colliders) {
    let deltaX = state.x - collider.x;
    let deltaZ = state.z - collider.z;
    let distance = Math.hypot(deltaX, deltaZ);
    if (distance < 1e-6) {
      deltaX = Math.sin(state.yaw);
      deltaZ = Math.cos(state.yaw);
      distance = 1;
    }
    if (distance < collider.dragRadius) {
      shallow = true;
      state.surge *= 0.985;
    }
    if (distance >= collider.radius) continue;
    collided = true;
    deltaX /= distance;
    deltaZ /= distance;
    const resolvedRadius = collider.radius + 1e-6;
    state.x = collider.x + deltaX * resolvedRadius;
    state.z = collider.z + deltaZ * resolvedRadius;
    state.surge *= -0.08;
    state.sway *= 0.2;
    state.yawRate *= 0.35;
  }
  return { collided, shallow };
}
