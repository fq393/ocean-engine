export interface VisualDiagnostics {
  calls: number;
  triangles: number;
  rendererGeometries: number;
  textures: number;
  meshes: number;
  uniqueGeometries: number;
  uniqueMaterials: number;
}

export interface RendererInfoLike {
  render: { calls: number; triangles: number };
  memory: { geometries: number; textures: number };
}
