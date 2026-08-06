import {
  buildThunderImpulseResponse,
  delayPerKm,
  spectralPeak,
} from './lightning-core';
import type {
  LightningChannel,
  LightningPoint,
  LightningSceneMap,
} from './LightningSimulation';

export type ThunderStatus = 'locked' | 'ready' | 'unavailable' | 'disposed';

export interface ThunderReport {
  readonly delay: number;
  readonly duration: number;
  readonly brightness: number;
  readonly sources: number;
  readonly distanceKm: number;
  readonly spectralPeakHz: number;
  readonly secondsPerKm: number;
}

interface ThunderImpulseResponse {
  readonly data: Float32Array;
  readonly sampleRate: number;
  readonly firstArrival: number;
  readonly duration: number;
  readonly brightness: number;
  readonly sources?: number;
}

interface AudioGlobal {
  readonly AudioContext?: typeof AudioContext;
  readonly webkitAudioContext?: typeof AudioContext;
}

export function sceneListenerToSimulation(
  listener: LightningPoint,
  map: LightningSceneMap,
): LightningPoint {
  if (!(map.scale > 0)) throw new RangeError('lightning map scale must be positive');
  return {
    x: (listener.x - map.originX) / map.scale,
    y: (listener.z - map.originZ) / map.scale,
    z: listener.y / map.scale,
  };
}

export function estimateFirstThunderArrival(
  channel: LightningChannel,
  listener: LightningPoint,
): number {
  const response = buildThunderImpulseResponse({
    channel,
    listener,
    sampleRate: 1_000,
    maxSeconds: 60,
  }) as ThunderImpulseResponse;
  return response.firstArrival;
}

function minimumChannelDistance(channel: LightningChannel, listener: LightningPoint): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < channel.count; index += 1) {
    const parent = channel.parent[index] ?? -1;
    if (parent < 0 || (channel.segLen[index] ?? 0) <= 0) continue;
    const x = ((channel.x[index] ?? 0) + (channel.x[parent] ?? 0)) * 0.5;
    const y = ((channel.y[index] ?? 0) + (channel.y[parent] ?? 0)) * 0.5;
    const z = ((channel.z[index] ?? 0) + (channel.z[parent] ?? 0)) * 0.5;
    minimum = Math.min(minimum, Math.hypot(x - listener.x, y - listener.y, z - listener.z));
  }
  return Number.isFinite(minimum) ? minimum : 1_000;
}

export class ThunderSystem {
  #context: AudioContext | undefined;
  #master: GainNode | undefined;
  #tilt: BiquadFilterNode | undefined;
  #body: BiquadFilterNode | undefined;
  #disposed = false;
  #volume = 0.7;
  status: ThunderStatus = 'locked';
  lastReport: Readonly<ThunderReport> | undefined;

  async unlock(): Promise<boolean> {
    if (this.#disposed) return false;
    try {
      if (this.#context) {
        if (this.#context.state === 'suspended') await this.#context.resume();
        this.status = 'ready';
        return true;
      }
      const audioGlobal = globalThis as unknown as AudioGlobal;
      const AudioContextConstructor = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
      if (!AudioContextConstructor) {
        this.status = 'unavailable';
        return false;
      }
      this.#context = new AudioContextConstructor();
      this.#master = this.#context.createGain();
      this.#master.gain.value = this.#volume;
      this.#tilt = this.#context.createBiquadFilter();
      this.#tilt.type = 'lowpass';
      this.#tilt.frequency.value = 2_400;
      this.#tilt.Q.value = 0.6;
      this.#body = this.#context.createBiquadFilter();
      this.#body.type = 'peaking';
      this.#body.frequency.value = spectralPeak();
      this.#body.Q.value = 0.8;
      this.#body.gain.value = 5;
      this.#tilt.connect(this.#body);
      this.#body.connect(this.#master);
      this.#master.connect(this.#context.destination);
      if (this.#context.state === 'suspended') await this.#context.resume();
      this.status = 'ready';
      return true;
    } catch {
      this.status = 'unavailable';
      return false;
    }
  }

  setVolume(value: number): void {
    this.#volume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
    if (this.#master) this.#master.gain.value = this.#volume;
  }

  schedule(
    channel: LightningChannel,
    listenerInScene: LightningPoint,
    map: LightningSceneMap,
  ): Readonly<ThunderReport> | undefined {
    const context = this.#context;
    const tilt = this.#tilt;
    if (this.status !== 'ready' || !context || !tilt || this.#disposed) return undefined;
    const listener = sceneListenerToSimulation(listenerInScene, map);
    const response = buildThunderImpulseResponse({
      channel,
      listener,
      sampleRate: Math.min(22_050, context.sampleRate),
      maxSeconds: 40,
    }) as ThunderImpulseResponse;
    if (!response.sources || response.data.length < 4) return undefined;

    const source = context.createBufferSource();
    source.buffer = this.#makeSource(context);
    const convolver = context.createConvolver();
    convolver.normalize = true;
    convolver.buffer = this.#makeImpulseBuffer(context, response);
    const gain = context.createGain();
    const distance = Math.max(120, minimumChannelDistance(channel, listener));
    gain.gain.value = Math.min(1.6, 1_000 / distance);
    source.connect(convolver);
    convolver.connect(gain);
    gain.connect(tilt);
    const start = context.currentTime + response.firstArrival;
    source.start(start);
    source.stop(start + convolver.buffer.duration + 0.2);
    source.addEventListener('ended', () => {
      source.disconnect();
      convolver.disconnect();
      gain.disconnect();
    }, { once: true });

    this.lastReport = Object.freeze({
      delay: response.firstArrival,
      duration: response.duration,
      brightness: response.brightness,
      sources: response.sources,
      distanceKm: distance / 1_000,
      spectralPeakHz: spectralPeak(),
      secondsPerKm: delayPerKm(),
    });
    return this.lastReport;
  }

  #makeSource(context: AudioContext, durationSeconds = 0.05): AudioBuffer {
    const sampleCount = Math.max(64, Math.floor(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    let lowPass = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const t = index / sampleCount;
      const white = Math.random() * 2 - 1;
      lowPass += (white - lowPass) * 0.35;
      data[index] = lowPass * Math.exp(-t * 9) * (1 - Math.exp(-t * 400));
    }
    return buffer;
  }

  #makeImpulseBuffer(
    context: AudioContext,
    response: ThunderImpulseResponse,
  ): AudioBuffer {
    const ratio = context.sampleRate / response.sampleRate;
    const sampleCount = Math.max(2, Math.floor(response.data.length * ratio));
    const buffer = context.createBuffer(2, sampleCount, context.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let index = 0; index < sampleCount; index += 1) {
      const sourcePosition = index / ratio;
      const sourceIndex = Math.floor(sourcePosition);
      const fraction = sourcePosition - sourceIndex;
      const first = response.data[sourceIndex] ?? 0;
      const second = response.data[sourceIndex + 1] ?? 0;
      const value = first + (second - first) * fraction;
      const jitter = 1 + 0.12 * Math.sin(index * 0.0007 + 1.7);
      left[index] = value * jitter;
      right[index] = value * (2 - jitter);
    }
    return buffer;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.status = 'disposed';
    void this.#context?.close();
    this.#context = undefined;
    this.#master = undefined;
    this.#tilt = undefined;
    this.#body = undefined;
  }
}
