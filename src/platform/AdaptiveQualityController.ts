import {
  RUNTIME_QUALITY,
  type RuntimeQualityName,
  type RuntimeQualityTier,
} from './quality';

const ORDER: readonly RuntimeQualityName[] = ['low', 'medium', 'high'];

export class AdaptiveQualityController {
  #tier: RuntimeQualityTier;
  #lockedTier: RuntimeQualityTier | undefined;
  #slowSeconds = 0;
  #fastSeconds = 0;

  constructor(initial: RuntimeQualityName) {
    this.#tier = RUNTIME_QUALITY[initial];
  }

  get tier(): RuntimeQualityTier {
    return this.#lockedTier ?? this.#tier;
  }

  get locked(): boolean {
    return this.#lockedTier !== undefined;
  }

  lock(name: RuntimeQualityName | undefined): void {
    this.#lockedTier = name ? RUNTIME_QUALITY[name] : undefined;
    if (this.#lockedTier) this.#tier = this.#lockedTier;
    this.#resetAccumulators();
  }

  update(deltaSecondsRaw: number, fps: number): RuntimeQualityTier {
    if (this.#lockedTier) return this.#lockedTier;
    const deltaSeconds = Math.min(1, Math.max(0, deltaSecondsRaw));
    if (fps < 42) {
      this.#slowSeconds += deltaSeconds;
      this.#fastSeconds = 0;
      if (this.#slowSeconds + 1e-9 >= 3) {
        this.#step(-1);
        this.#resetAccumulators();
      }
    } else if (fps > 55) {
      this.#fastSeconds += deltaSeconds;
      this.#slowSeconds = 0;
      if (this.#fastSeconds + 1e-9 >= 10) {
        this.#step(1);
        this.#resetAccumulators();
      }
    } else {
      this.#resetAccumulators();
    }
    return this.#tier;
  }

  #step(direction: -1 | 1): void {
    const current = ORDER.indexOf(this.#tier.name);
    const next = Math.min(ORDER.length - 1, Math.max(0, current + direction));
    this.#tier = RUNTIME_QUALITY[ORDER[next]!];
  }

  #resetAccumulators(): void {
    this.#slowSeconds = 0;
    this.#fastSeconds = 0;
  }
}
