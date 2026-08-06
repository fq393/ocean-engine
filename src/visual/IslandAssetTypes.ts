export type IslandLod = 'lod0' | 'lod1' | 'lod2';
export type PalmVariant = 'upright' | 'leaning' | 'tall' | 'wide';

export interface AssetEntry {
  url: string;
  triangles: number;
  sha256: string;
}

export interface PalmPlacement {
  variant: PalmVariant;
  position: readonly [number, number, number];
  rotationY: number;
  scale: number;
}

export interface IslandAssetManifest {
  schemaVersion: 1;
  unitMeters: 1;
  island: Record<IslandLod, AssetEntry> & { collision: AssetEntry };
  palms: Record<IslandLod, AssetEntry>;
  placements: readonly PalmPlacement[];
}
