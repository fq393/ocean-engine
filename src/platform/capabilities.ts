export interface GraphicsCapabilities { webgpu: boolean; webgl2: boolean; }
export type GraphicsBackend = 'webgpu' | 'webgl2' | 'unsupported';

export function chooseBackend(value: GraphicsCapabilities): GraphicsBackend {
  if (value.webgpu) return 'webgpu';
  if (value.webgl2) return 'webgl2';
  return 'unsupported';
}

export function detectCapabilities(): GraphicsCapabilities {
  const canvas = document.createElement('canvas');
  return {
    webgpu: 'gpu' in navigator,
    webgl2: canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) !== null,
  };
}
