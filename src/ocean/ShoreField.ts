import * as THREE from 'three';

const DISTANCE_NORMALIZATION_METERS = 32;

export interface ShorePoint {
  readonly x: number;
  readonly z: number;
}

export interface ShoreBounds {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

function pointSegmentDistance(point: ShorePoint, start: ShorePoint, end: ShorePoint): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.z - start.z);
  const projection = THREE.MathUtils.clamp(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared,
    0,
    1,
  );
  return Math.hypot(
    point.x - (start.x + dx * projection),
    point.z - (start.z + dz * projection),
  );
}

function isInside(point: ShorePoint, polygon: readonly ShorePoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if (!a || !b) continue;
    const crosses = (a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function convexHull(points: readonly ShorePoint[]): readonly ShorePoint[] {
  const sorted = [...points]
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
    .sort((a, b) => a.x - b.x || a.z - b.z);
  const unique = sorted.filter((point, index) => (
    index === 0 || point.x !== sorted[index - 1]?.x || point.z !== sorted[index - 1]?.z
  ));
  if (unique.length < 3) throw new RangeError('shore polygon requires at least three unique points');
  const cross = (origin: ShorePoint, a: ShorePoint, b: ShorePoint): number => (
    (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x)
  );
  const lower: ShorePoint[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: ShorePoint[] = [];
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return Object.freeze([...lower, ...upper].map((point) => Object.freeze({ ...point })));
}

export class ShoreField {
  readonly texture: THREE.DataTexture;
  readonly bounds: Readonly<ShoreBounds>;
  readonly #polygon: readonly ShorePoint[];

  private constructor(
    polygon: readonly ShorePoint[],
    bounds: Readonly<ShoreBounds>,
    texture: THREE.DataTexture,
  ) {
    this.#polygon = polygon;
    this.bounds = bounds;
    this.texture = texture;
  }

  static fromPolygon(
    rawPolygon: readonly ShorePoint[],
    rawBounds: ShoreBounds,
    resolution = 128,
  ): ShoreField {
    const polygon = rawPolygon.map((point) => Object.freeze({ x: point.x, z: point.z }));
    if (polygon.length < 3) throw new RangeError('shore polygon requires at least three points');
    if (!Number.isInteger(resolution) || resolution < 2) {
      throw new RangeError('shore texture resolution must be an integer of at least two');
    }
    const bounds = Object.freeze({ ...rawBounds });
    if (!(bounds.maxX > bounds.minX) || !(bounds.maxZ > bounds.minZ)) {
      throw new RangeError('shore bounds must have positive area');
    }
    const data = new Float32Array(resolution * resolution);
    const signedDistance = (point: ShorePoint): number => {
      let distance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < polygon.length; index += 1) {
        const start = polygon[index];
        const end = polygon[(index + 1) % polygon.length];
        if (start && end) distance = Math.min(distance, pointSegmentDistance(point, start, end));
      }
      return isInside(point, polygon) ? -distance : distance;
    };
    for (let row = 0; row < resolution; row += 1) {
      for (let column = 0; column < resolution; column += 1) {
        const point = {
          x: THREE.MathUtils.lerp(bounds.minX, bounds.maxX, (column + 0.5) / resolution),
          z: THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, (row + 0.5) / resolution),
        };
        data[row * resolution + column] = THREE.MathUtils.clamp(
          signedDistance(point) / DISTANCE_NORMALIZATION_METERS,
          -1,
          1,
        );
      }
    }
    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RedFormat, THREE.FloatType);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return new ShoreField(Object.freeze(polygon), bounds, texture);
  }

  static fallbackIsland(): ShoreField {
    const center = { x: 0, z: -28 };
    const polygon = Array.from({ length: 128 }, (_, index) => {
      const angle = index / 128 * Math.PI * 2;
      const outline = 1
        + 0.055 * Math.sin(angle * 3 + 0.8)
        + 0.032 * Math.sin(angle * 5 - 1.1)
        + 0.018 * Math.sin(angle * 9 + 2.3);
      return {
        x: center.x + Math.cos(angle) * 18 * outline,
        z: center.z + Math.sin(angle) * 13 * outline,
      };
    });
    return ShoreField.fromPolygon(
      polygon,
      { minX: -64, minZ: -92, maxX: 64, maxZ: 36 },
      128,
    );
  }

  sample(x: number, z: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      throw new RangeError('shore sample coordinates must be finite');
    }
    const point = { x, z };
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.#polygon.length; index += 1) {
      const start = this.#polygon[index];
      const end = this.#polygon[(index + 1) % this.#polygon.length];
      if (start && end) distance = Math.min(distance, pointSegmentDistance(point, start, end));
    }
    return isInside(point, this.#polygon) ? -distance : distance;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
