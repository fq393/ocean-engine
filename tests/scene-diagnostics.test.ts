import { describe, expect, it } from 'vitest';
import { createSceneDiagnostics } from '../src/app/SceneDiagnostics';

describe('createSceneDiagnostics', () => {
  it('serializes every subsystem and replaces unsafe values', () => {
    const snapshot = createSceneDiagnostics({
      renderer: { calls: 9, triangles: 12_000, geometries: 8, textures: 7, pixelRatio: 1.5, fps: Infinity },
      water: { mode: 'spectral', fftSize: 128, cascades: 2, stormFactor: 1 },
      weather: { mode: 'storm', rainCount: 22_000, fogDensity: 0.0062 },
      lightning: { phase: 'return-stroke', segments: 300, physicsMs: Number.NaN, lightCount: 4, error: new Error('leader failed') },
      boat: { speed: 7, yaw: -2.1, x: 31, z: 4, shallow: false, collided: false },
      audio: { status: 'ready' },
      quality: { tier: 'high', locked: false },
    });

    expect(snapshot.renderer.fps).toBeNull();
    expect(snapshot.lightning.physicsMs).toBeNull();
    expect(snapshot.lightning.error).toBe('leader failed');
    expect(Object.keys(snapshot)).toEqual([
      'renderer', 'water', 'weather', 'lightning', 'boat', 'audio', 'quality',
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('Float32Array');
    expect(JSON.stringify(snapshot)).not.toContain('uuid');
  });
});
