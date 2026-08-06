import * as THREE from 'three';
import type { BoatState } from './types';

export interface ChasePose {
  readonly position: THREE.Vector3;
  readonly lookAt: THREE.Vector3;
  readonly fov: number;
}

export function computeChaseTarget(state: Readonly<BoatState>): ChasePose {
  const speed = Math.abs(state.surge);
  const distance = 15 + Math.min(7, speed * 0.55);
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  return {
    position: new THREE.Vector3(
      state.x - sinYaw * distance,
      state.heave + 7.5,
      state.z - cosYaw * distance,
    ),
    lookAt: new THREE.Vector3(
      state.x + sinYaw * 5,
      state.heave + 1.4,
      state.z + cosYaw * 5,
    ),
    fov: 47 + Math.min(7, speed * 0.5),
  };
}

export class ChaseCamera {
  readonly #look = new THREE.Vector3();

  snap(camera: THREE.PerspectiveCamera, state: Readonly<BoatState>): void {
    const pose = computeChaseTarget(state);
    camera.position.copy(pose.position);
    this.#look.copy(pose.lookAt);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(this.#look);
  }

  update(camera: THREE.PerspectiveCamera, state: Readonly<BoatState>, deltaSeconds: number): void {
    const pose = computeChaseTarget(state);
    const dt = Math.min(Math.max(deltaSeconds, 0), 1 / 30);
    const positionAlpha = 1 - Math.exp(-dt * 4.5);
    const lookAlpha = 1 - Math.exp(-dt * 6);
    camera.position.lerp(pose.position, positionAlpha);
    this.#look.lerp(pose.lookAt, lookAlpha);
    camera.fov += (pose.fov - camera.fov) * positionAlpha;
    camera.updateProjectionMatrix();
    camera.lookAt(this.#look);
  }
}
