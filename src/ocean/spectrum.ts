import { validateOceanConfig } from './config';
import { createPrng } from './prng';
import type { OceanConfig, WaveComponent } from './types';

const TAU = Math.PI * 2;

export interface PairedWaveComponents {
  readonly clear: readonly WaveComponent[];
  readonly storm: readonly WaveComponent[];
}

export function normalizeSignificantWaveHeight(
  waves: readonly WaveComponent[],
  targetHeight: number,
): readonly WaveComponent[] {
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    throw new RangeError('target significant wave height must be positive and finite');
  }
  const variance = waves.reduce(
    (total, wave) => total + wave.amplitude * wave.amplitude * 0.5,
    0,
  );
  const currentHeight = 4 * Math.sqrt(variance);
  if (currentHeight <= Number.EPSILON) throw new RangeError('wave spectrum energy must be positive');
  const scale = targetHeight / currentHeight;
  return Object.freeze(waves.map((wave) => Object.freeze({
    ...wave,
    amplitude: wave.amplitude * scale,
    steepness: Math.min(0.85, wave.steepness * scale),
  })));
}

export function jonswapDensity(omega: number, config: OceanConfig): number {
  if (!Number.isFinite(omega) || omega <= 0) return 0;
  const peakOmega = 22 * Math.pow(
    (config.gravity * config.gravity) / (config.windSpeed * config.fetchMeters),
    1 / 3,
  );
  const sigma = omega <= peakOmega ? 0.07 : 0.09;
  const peakShape = Math.exp(
    -Math.pow(omega - peakOmega, 2) / (2 * sigma * sigma * peakOmega * peakOmega),
  );
  const alpha = 0.076 * Math.pow(
    (config.windSpeed * config.windSpeed) / (config.fetchMeters * config.gravity),
    0.22,
  );
  const base = alpha * config.gravity * config.gravity * Math.pow(omega, -5)
    * Math.exp(-1.25 * Math.pow(peakOmega / omega, 4));
  return Math.max(0, base * Math.pow(config.peakEnhancement, peakShape));
}

export function createWaveComponents(rawConfig: OceanConfig): readonly WaveComponent[] {
  const config = validateOceanConfig(rawConfig);
  const random = createPrng(config.seed);
  const minK = TAU / config.maxWavelength;
  const maxK = TAU / config.minWavelength;
  const logMin = Math.log(minK);
  const logMax = Math.log(maxK);
  const deltaLogK = (logMax - logMin) / config.componentCount;
  const waves: WaveComponent[] = [];

  for (let index = 0; index < config.componentCount; index += 1) {
    const logK = logMin + (index + 0.5) * deltaLogK;
    const waveNumber = Math.exp(logK);
    const angularFrequency = Math.sqrt(config.gravity * waveNumber);
    const density = jonswapDensity(angularFrequency, config);
    const deltaOmega = 0.5 * angularFrequency * deltaLogK;
    const amplitude = Math.sqrt(Math.max(0, 2 * density * deltaOmega));
    const directionalSpread = (random() - 0.5) * Math.PI * 0.45;
    const direction = config.windDirectionRad + directionalSpread;
    waves.push({
      amplitude,
      angularFrequency,
      waveNumber,
      directionX: Math.cos(direction),
      directionZ: Math.sin(direction),
      phase: random() * TAU,
      steepness: Math.min(0.85, amplitude * waveNumber),
    });
  }
  return Object.freeze(waves.map((wave) => Object.freeze(wave)));
}

export function createPairedWaveComponents(
  clearRaw: OceanConfig,
  stormRaw: OceanConfig,
): PairedWaveComponents {
  const clearConfig = validateOceanConfig(clearRaw);
  const stormConfig = validateOceanConfig(stormRaw);
  const random = createPrng(clearConfig.seed);
  const minK = TAU / clearConfig.maxWavelength;
  const maxK = TAU / clearConfig.minWavelength;
  const logMin = Math.log(minK);
  const logMax = Math.log(maxK);
  const deltaLogK = (logMax - logMin) / clearConfig.componentCount;
  const clear: WaveComponent[] = [];
  const storm: WaveComponent[] = [];

  for (let index = 0; index < clearConfig.componentCount; index += 1) {
    const logK = logMin + (index + 0.5) * deltaLogK;
    const waveNumber = Math.exp(logK);
    const angularFrequency = Math.sqrt(clearConfig.gravity * waveNumber);
    const deltaOmega = 0.5 * angularFrequency * deltaLogK;
    const directionOffset = (random() - 0.5) * Math.PI * 0.45;
    const phase = random() * TAU;

    const makeWave = (config: OceanConfig): WaveComponent => {
      const density = jonswapDensity(angularFrequency, config);
      const amplitude = Math.sqrt(Math.max(0, 2 * density * deltaOmega));
      const direction = config.windDirectionRad + directionOffset;
      return Object.freeze({
        amplitude,
        angularFrequency,
        waveNumber,
        directionX: Math.cos(direction),
        directionZ: Math.sin(direction),
        phase,
        steepness: Math.min(0.85, amplitude * waveNumber),
      });
    };

    clear.push(makeWave(clearConfig));
    storm.push(makeWave(stormConfig));
  }

  return Object.freeze({
    clear: Object.freeze(clear),
    storm: Object.freeze(storm),
  });
}
