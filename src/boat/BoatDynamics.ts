import type { WaveSample } from '../ocean/types';
import type { BoatEnvironment, BoatIntent, BoatState } from './types';

export interface WaveSampler {
  sample(x: number, z: number, time: number): WaveSample;
}

const MAX_DT = 1 / 30;
const HALF_LENGTH = 3.4;
const HALF_BEAM = 1.3;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export class BoatDynamics {
  readonly state: BoatState;

  constructor(initial: Readonly<BoatState>) {
    this.state = { ...initial };
  }

  update(
    deltaSeconds: number,
    timeSeconds: number,
    intent: BoatIntent,
    waves: WaveSampler,
    environment: BoatEnvironment,
  ): Readonly<BoatState> {
    const dt = clamp(deltaSeconds, 0, MAX_DT);
    const state = this.state;
    const sinYaw = Math.sin(state.yaw);
    const cosYaw = Math.cos(state.yaw);
    const thrust = intent.throttle >= 0 ? intent.throttle * 7.5 : intent.throttle * 3.2;
    const surgeDrag = 0.085 * state.surge * Math.abs(state.surge);
    const lateralDrag = 1.7 * state.sway * Math.abs(state.sway);
    const rudderForce = intent.rudder
      * Math.min(1, Math.abs(state.surge) / 2.5)
      * state.surge
      * 0.22;
    const windSide = (-environment.windX * cosYaw + environment.windZ * sinYaw)
      * environment.stormFactor
      * 0.012;

    state.surge += (thrust - surgeDrag) * dt;
    state.sway += (windSide - lateralDrag) * dt;
    state.yawRate += (rudderForce - state.yawRate * 1.8) * dt;
    state.yaw += state.yawRate * dt;
    state.x += (sinYaw * state.surge + cosYaw * state.sway) * dt;
    state.z += (cosYaw * state.surge - sinYaw * state.sway) * dt;

    const sample = (forward: number, right: number): WaveSample => waves.sample(
      state.x + sinYaw * forward + cosYaw * right,
      state.z + cosYaw * forward - sinYaw * right,
      timeSeconds,
    );
    const center = sample(0, 0);
    const bow = sample(HALF_LENGTH, 0);
    const stern = sample(-HALF_LENGTH, 0);
    const port = sample(0, -HALF_BEAM);
    const starboard = sample(0, HALF_BEAM);

    state.heave += (center.height + 0.24 - state.heave) * Math.min(1, dt * 7);
    state.pitch += (
      Math.atan2(bow.height - stern.height, HALF_LENGTH * 2) - state.pitch
    ) * Math.min(1, dt * 6);
    const targetRoll = Math.atan2(
      port.height - starboard.height,
      HALF_BEAM * 2,
    ) - state.yawRate * 0.45;
    state.roll += (targetRoll - state.roll) * Math.min(1, dt * 5);
    state.roll = clamp(state.roll, -Math.PI * 0.36, Math.PI * 0.36);
    return state;
  }
}
