import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { collectDiagnostics } from '../src/visual/QualityDiagnostics';

describe('collectDiagnostics', () => {
  it('deduplicates shared scene resources and includes renderer counters', () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const rendererInfo = {
      render: { calls: 12, triangles: 3456 },
      memory: { geometries: 4, textures: 3 },
    };

    expect(collectDiagnostics(rendererInfo, scene)).toEqual({
      calls: 12,
      triangles: 3456,
      rendererGeometries: 4,
      textures: 3,
      meshes: 2,
      uniqueGeometries: 1,
      uniqueMaterials: 1,
    });
  });
});
