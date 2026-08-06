import { OCEAN_SURFACE_PROFILES, type OceanSurfaceProfile } from '../platform/quality';

function finitePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
  return value;
}

export function selectOceanSurfaceProfile(viewportWidth: number): OceanSurfaceProfile {
  return viewportWidth < 700 ? OCEAN_SURFACE_PROFILES.mobile : OCEAN_SURFACE_PROFILES.desktop;
}

export function effectivePixelRatio(deviceRatio: number, cap: number): number {
  finitePositive(deviceRatio, 'deviceRatio');
  finitePositive(cap, 'cap');
  return Math.min(deviceRatio, cap);
}

export function gridSpacingMeters(sizeMeters: number, segments: number): number {
  finitePositive(sizeMeters, 'sizeMeters');
  finitePositive(segments, 'segments');
  if (!Number.isInteger(segments)) throw new RangeError('segments must be an integer');
  return sizeMeters / segments;
}

export function minimumResolvedWavelength(sizeMeters: number, segments: number): number {
  return gridSpacingMeters(sizeMeters, segments) * 2;
}

export function snapOceanCenter(x: number, z: number, interval: number): { x: number; z: number } {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new RangeError('coordinates must be finite');
  }
  finitePositive(interval, 'interval');
  return {
    x: Math.round(x / interval) * interval,
    z: Math.round(z / interval) * interval,
  };
}
