import {
  Flash,
  FlashType,
  makeRng,
  type FlashTelemetry,
} from './lightning-core';

export interface LightningChannel {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly parent: Int32Array;
  readonly segLen: Float32Array;
  readonly current: Float32Array;
  readonly temp: Float32Array;
  readonly lum: Float32Array;
  readonly level?: Uint8Array;
}

interface FlashRuntime {
  readonly channel: LightningChannel;
  readonly done: boolean;
  readonly strokeIndex: number;
  readonly seed: number;
  readonly time: number;
  update(deltaSeconds: number, deadline?: number): number;
  telemetry(): FlashTelemetry;
}

export interface LightningPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface LightningSceneMap {
  readonly scale: number;
  readonly originX: number;
  readonly originZ: number;
}

export interface LightningSimulationOptions {
  readonly seed?: number;
  readonly now?: () => number;
  readonly budgetMs?: number;
  readonly map?: LightningSceneMap;
}

export interface LightningSimulationEvent {
  readonly type: 'first-stroke' | 'complete';
  readonly seed: number;
  readonly simulationTime: number;
}

export const DEFAULT_LIGHTNING_MAP: Readonly<LightningSceneMap> = Object.freeze({
  scale: 0.03,
  originX: -45,
  originZ: -70,
});

export function mapLightningPoint(
  point: LightningPoint,
  map: LightningSceneMap,
): LightningPoint {
  return {
    x: map.originX + point.x * map.scale,
    y: point.z * map.scale,
    z: map.originZ + point.y * map.scale,
  };
}

export class LightningSimulation {
  readonly map: Readonly<LightningSceneMap>;
  readonly events: LightningSimulationEvent[] = [];
  readonly #now: () => number;
  readonly #budgetMs: number;
  readonly #rng: ReturnType<typeof makeRng>;
  #flash: FlashRuntime | undefined;
  #stormEnabled = false;
  #pendingSimulationSeconds = 0;
  #untilNextFlash: number;
  #firstStrokeEmitted = false;
  #completeEmitted = false;
  lastPhysicsMs = 0;

  constructor(options: LightningSimulationOptions = {}) {
    this.#now = options.now ?? (() => performance.now());
    this.#budgetMs = Math.max(0.25, options.budgetMs ?? 2.5);
    this.map = Object.freeze({ ...(options.map ?? DEFAULT_LIGHTNING_MAP) });
    this.#rng = makeRng(options.seed ?? 0x51f15e);
    this.#untilNextFlash = this.#rng.range(5, 14);
  }

  get channel(): LightningChannel | undefined {
    return this.#flash?.channel;
  }

  get telemetry(): FlashTelemetry | undefined {
    return this.#flash?.telemetry() as FlashTelemetry | undefined;
  }

  setStormEnabled(enabled: boolean): void {
    this.#stormEnabled = enabled;
    if (!enabled) this.lastPhysicsMs = 0;
  }

  newFlash(seed = this.#rng.int(0x7fff_ffff)): void {
    this.#flash = new Flash({
      type: FlashType.NEGATIVE_CG,
      seed,
      now: this.#now,
    }) as unknown as FlashRuntime;
    this.#pendingSimulationSeconds = 0;
    this.#firstStrokeEmitted = false;
    this.#completeEmitted = false;
    this.events.length = 0;
  }

  update(deltaSecondsRaw: number): void {
    if (!this.#stormEnabled) {
      this.lastPhysicsMs = 0;
      return;
    }
    const deltaSeconds = Math.min(0.1, Math.max(0, deltaSecondsRaw));
    if (!this.#flash || this.#flash.done) {
      this.#untilNextFlash -= deltaSeconds;
      if (this.#untilNextFlash > 0) {
        this.lastPhysicsMs = 0;
        return;
      }
      this.newFlash();
      this.#untilNextFlash = this.#rng.range(5, 14);
    }

    const flash = this.#flash;
    if (!flash) {
      this.lastPhysicsMs = 0;
      return;
    }
    this.#pendingSimulationSeconds += deltaSeconds;
    const startedAt = this.#now();
    const deadline = startedAt + this.#budgetMs;
    const consumed = flash.update(this.#pendingSimulationSeconds, deadline);
    this.#pendingSimulationSeconds = Math.max(0, this.#pendingSimulationSeconds - consumed);
    this.lastPhysicsMs = Math.min(
      this.#budgetMs + 1,
      Math.max(0, this.#now() - startedAt),
    );

    if (!this.#firstStrokeEmitted && flash.strokeIndex >= 1) {
      this.#firstStrokeEmitted = true;
      this.events.push({ type: 'first-stroke', seed: flash.seed, simulationTime: flash.time });
    }
    if (!this.#completeEmitted && flash.done) {
      this.#completeEmitted = true;
      this.events.push({ type: 'complete', seed: flash.seed, simulationTime: flash.time });
      this.#untilNextFlash = this.#rng.range(5, 14);
    }
  }
}
