import type { WaveComponent, WaveSample } from './types';

export class WaveQuery {
  readonly #waves: readonly WaveComponent[];

  constructor(waves: readonly WaveComponent[]) {
    this.#waves = waves;
  }

  sample(x: number, z: number, timeSeconds: number): WaveSample {
    if (![x, z, timeSeconds].every(Number.isFinite)) {
      throw new RangeError('WaveQuery inputs must be finite');
    }
    let height = 0;
    let slopeX = 0;
    let slopeZ = 0;
    let velocityX = 0;
    let velocityY = 0;
    let velocityZ = 0;

    for (const wave of this.#waves) {
      const theta = wave.waveNumber * (wave.directionX * x + wave.directionZ * z)
        - wave.angularFrequency * timeSeconds + wave.phase;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      height += wave.amplitude * sinTheta;
      const slope = wave.amplitude * wave.waveNumber * cosTheta;
      slopeX += slope * wave.directionX;
      slopeZ += slope * wave.directionZ;
      velocityY += -wave.amplitude * wave.angularFrequency * cosTheta;
      const horizontalSpeed = wave.steepness * wave.amplitude * wave.angularFrequency * sinTheta;
      velocityX += horizontalSpeed * wave.directionX;
      velocityZ += horizontalSpeed * wave.directionZ;
    }

    const length = Math.hypot(slopeX, 1, slopeZ);
    return {
      height,
      normal: { x: -slopeX / length, y: 1 / length, z: -slopeZ / length },
      velocity: { x: velocityX, y: velocityY, z: velocityZ },
    };
  }
}
