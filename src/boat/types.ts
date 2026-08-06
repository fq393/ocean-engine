export interface BoatIntent {
  readonly throttle: number;
  readonly rudder: number;
}

export interface BoatEnvironment {
  readonly windX: number;
  readonly windZ: number;
  readonly stormFactor: number;
}

export interface BoatState {
  x: number;
  z: number;
  yaw: number;
  surge: number;
  sway: number;
  yawRate: number;
  heave: number;
  pitch: number;
  roll: number;
}

export const INITIAL_BOAT_STATE: Readonly<BoatState> = Object.freeze({
  x: 31,
  z: 4,
  yaw: -2.35,
  surge: 0,
  sway: 0,
  yawRate: 0,
  heave: 0,
  pitch: 0,
  roll: 0,
});
