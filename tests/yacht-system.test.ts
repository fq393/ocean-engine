import { Box3, BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { computeNormalizationScale, normalizeYachtModel } from '../src/visual/YachtSystem';

describe('YachtSystem helpers', () => {
  it('normalizes the longest horizontal model dimension to target length', () => {
    const bounds = new Box3(new Vector3(-1, -0.5, -5), new Vector3(1, 1, 5));
    expect(computeNormalizationScale(bounds, 8)).toBeCloseTo(0.8, 8);
  });

  it('centers and scales a generated model to a nine metre waterline footprint', () => {
    const model = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 3, 10));
    mesh.position.set(4, 2, -7);
    model.add(mesh);

    normalizeYachtModel(model, 9, 1.05);

    const bounds = new Box3().setFromObject(model);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    expect(Math.max(size.x, size.z)).toBeCloseTo(9, 5);
    expect(center.x).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
    expect(bounds.min.y).toBeCloseTo(-1.05, 5);
  });
});
