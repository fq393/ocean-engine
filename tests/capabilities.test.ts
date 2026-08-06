import { describe, expect, it } from 'vitest';
import { chooseBackend } from '../src/platform/capabilities';

describe('chooseBackend', () => {
  it('prefers WebGPU and falls back to WebGL2', () => {
    expect(chooseBackend({ webgpu: true, webgl2: true })).toBe('webgpu');
    expect(chooseBackend({ webgpu: false, webgl2: true })).toBe('webgl2');
    expect(chooseBackend({ webgpu: false, webgl2: false })).toBe('unsupported');
  });
});
