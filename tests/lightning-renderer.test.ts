import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  LightningRenderer,
  selectLightningLights,
  type LightningLightCandidate,
} from '../src/weather/LightningRenderer';
import type { LightningChannel } from '../src/weather/LightningSimulation';

describe('LightningRenderer helpers', () => {
  it('maps, ranks, separates and caps ocean lighting samples', () => {
    const candidates: LightningLightCandidate[] = [
      { point: { x: 1_000, y: 0, z: 5_000 }, luminosity: 0.8, segmentLength: 90, color: [1, 0.9, 0.8] },
      { point: { x: 1_050, y: 0, z: 5_000 }, luminosity: 0.7, segmentLength: 80, color: [0.8, 0.9, 1] },
      { point: { x: 2_000, y: 0, z: 4_000 }, luminosity: 0.6, segmentLength: 70, color: [1, 1, 1] },
      { point: { x: -1_000, y: 0, z: 3_000 }, luminosity: 0.5, segmentLength: 60, color: [1, 1, 1] },
      { point: { x: 0, y: 1_000, z: 2_000 }, luminosity: 0.4, segmentLength: 50, color: [1, 1, 1] },
      { point: { x: 3_000, y: 0, z: 1_000 }, luminosity: 0.1, segmentLength: 20, color: [1, 1, 1] },
    ];

    const lights = selectLightningLights(candidates, 4, 7.8, {
      scale: 0.03,
      originX: -45,
      originZ: -70,
    });

    expect(lights).toHaveLength(4);
    expect(lights[0]).toMatchObject({ x: -15, y: 150, z: -70 });
    expect(lights[0]!.power).toBeGreaterThan(72);
    expect(lights.some((light) => light.x === 15 && light.y === 120)).toBe(true);
    expect(Object.isFrozen(lights)).toBe(true);
    expect(lights.every(Object.isFrozen)).toBe(true);
  });

  it('reuses two scene lights and subdivides every physical segment three times', () => {
    const renderer = new LightningRenderer({ maxSegments: 12 });
    const channel: LightningChannel = {
      count: 2,
      x: new Float32Array([0, 100]),
      y: new Float32Array([0, 20]),
      z: new Float32Array([5_000, 4_900]),
      parent: new Int32Array([-1, 0]),
      segLen: new Float32Array([0, 143]),
      current: new Float32Array([0, 25_000]),
      temp: new Float32Array([0, 30_000]),
      lum: new Float32Array([0, 1]),
    };

    renderer.update(channel, 1 / 60);
    renderer.update(channel, 1 / 60);

    expect(renderer.segmentCount).toBe(3);
    expect(renderer.root.children.filter((child) => child instanceof THREE.PointLight)).toHaveLength(2);
    expect(renderer.frame.lights).toHaveLength(1);
    expect(renderer.frame.flashExposure).toBeGreaterThan(0);
    expect(Object.isFrozen(renderer.frame)).toBe(true);
    renderer.dispose();
    renderer.dispose();
  });
});
