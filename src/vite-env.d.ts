/// <reference types="vite/client" />

interface BoatTestState {
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

interface OceanTestHooks {
  setTime(seconds: number): void;
  setWeather(mode: 'clear' | 'storm'): void;
  setStormFactor(value: number): void;
  triggerLightning(seed: number): void;
  setBoatState(state: Partial<BoatTestState>): void;
  setOverviewCamera(enabled: boolean): void;
  forceOceanFallback(enabled: boolean): void;
  lockQuality(tier: 'high' | 'medium' | 'low' | undefined): void;
}

interface Window {
  __OCEAN_TEST_HOOKS__?: OceanTestHooks;
  __THREE_GAME_TEST_HOOKS__?: {
    seed?(value: number): void;
    setState?(name: string): void;
  };
  __THREE_GAME_DIAGNOSTICS__?: import('./app/SceneDiagnostics').SceneDiagnosticsSnapshot;
}
