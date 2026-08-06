import * as THREE from 'three';
import type { RendererInfoLike, VisualDiagnostics } from './types';

export function collectDiagnostics(info: RendererInfoLike, scene: THREE.Object3D): VisualDiagnostics {
  const geometries = new Set<string>();
  const materials = new Set<string>();
  let meshes = 0;

  scene.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    geometries.add(object.geometry.uuid);
    const assigned = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of assigned) materials.add(material.uuid);
  });

  return {
    calls: info.render.calls,
    triangles: info.render.triangles,
    rendererGeometries: info.memory.geometries,
    textures: info.memory.textures,
    meshes,
    uniqueGeometries: geometries.size,
    uniqueMaterials: materials.size,
  };
}
