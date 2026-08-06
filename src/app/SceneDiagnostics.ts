export type SerializableNumber = number | null;
export type DiagnosticAudioStatus = 'locked' | 'ready' | 'unavailable' | 'silent-error';

export interface SceneDiagnosticsSnapshot {
  readonly renderer: {
    readonly calls: SerializableNumber;
    readonly triangles: SerializableNumber;
    readonly geometries: SerializableNumber;
    readonly textures: SerializableNumber;
    readonly pixelRatio: SerializableNumber;
    readonly fps: SerializableNumber;
  };
  readonly water: {
    readonly mode: 'spectral' | 'gerstner';
    readonly fftSize: 0 | 64 | 128;
    readonly cascades: 0 | 1 | 2;
    readonly stormFactor: SerializableNumber;
  };
  readonly weather: {
    readonly mode: 'clear' | 'storm';
    readonly rainCount: SerializableNumber;
    readonly fogDensity: SerializableNumber;
  };
  readonly lightning: {
    readonly phase: string;
    readonly segments: SerializableNumber;
    readonly physicsMs: SerializableNumber;
    readonly lightCount: SerializableNumber;
    readonly error: string | null;
  };
  readonly boat: {
    readonly speed: SerializableNumber;
    readonly yaw: SerializableNumber;
    readonly x: SerializableNumber;
    readonly z: SerializableNumber;
    readonly shallow: boolean;
    readonly collided: boolean;
  };
  readonly audio: { readonly status: DiagnosticAudioStatus };
  readonly quality: {
    readonly tier: 'high' | 'medium' | 'low';
    readonly locked: boolean;
  };
}

type SceneDiagnosticsInput = {
  renderer: { calls: number; triangles: number; geometries: number; textures: number; pixelRatio: number; fps: number };
  water: { mode: 'spectral' | 'gerstner'; fftSize: 0 | 64 | 128; cascades: 0 | 1 | 2; stormFactor: number };
  weather: { mode: 'clear' | 'storm'; rainCount: number; fogDensity: number };
  lightning: { phase: string; segments: number; physicsMs: number; lightCount: number; error: unknown };
  boat: { speed: number; yaw: number; x: number; z: number; shallow: boolean; collided: boolean };
  audio: { status: DiagnosticAudioStatus };
  quality: { tier: 'high' | 'medium' | 'low'; locked: boolean };
};

function finite(value: number): SerializableNumber {
  return Number.isFinite(value) ? value : null;
}

function errorMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Error) return value.message;
  return String(value);
}

export function createSceneDiagnostics(input: SceneDiagnosticsInput): SceneDiagnosticsSnapshot {
  return {
    renderer: {
      calls: finite(input.renderer.calls),
      triangles: finite(input.renderer.triangles),
      geometries: finite(input.renderer.geometries),
      textures: finite(input.renderer.textures),
      pixelRatio: finite(input.renderer.pixelRatio),
      fps: finite(input.renderer.fps),
    },
    water: {
      mode: input.water.mode,
      fftSize: input.water.fftSize,
      cascades: input.water.cascades,
      stormFactor: finite(input.water.stormFactor),
    },
    weather: {
      mode: input.weather.mode,
      rainCount: finite(input.weather.rainCount),
      fogDensity: finite(input.weather.fogDensity),
    },
    lightning: {
      phase: input.lightning.phase,
      segments: finite(input.lightning.segments),
      physicsMs: finite(input.lightning.physicsMs),
      lightCount: finite(input.lightning.lightCount),
      error: errorMessage(input.lightning.error),
    },
    boat: {
      speed: finite(input.boat.speed),
      yaw: finite(input.boat.yaw),
      x: finite(input.boat.x),
      z: finite(input.boat.z),
      shallow: input.boat.shallow,
      collided: input.boat.collided,
    },
    audio: { status: input.audio.status },
    quality: { tier: input.quality.tier, locked: input.quality.locked },
  };
}
