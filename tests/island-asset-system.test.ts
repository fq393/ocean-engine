import { describe, expect, it } from 'vitest';
import { selectIslandLod, validateIslandManifest } from '../src/visual/IslandAssetSystem';

const manifest = {
  schemaVersion: 1,
  unitMeters: 1,
  island: {
    lod0: { url: '/assets/models/island/island_base_lod0.glb', triangles: 35000, sha256: 'a'.repeat(64) },
    lod1: { url: '/assets/models/island/island_base_lod1.glb', triangles: 12000, sha256: 'b'.repeat(64) },
    lod2: { url: '/assets/models/island/island_base_lod2.glb', triangles: 4000, sha256: 'c'.repeat(64) },
    collision: { url: '/assets/models/island/island_collision.glb', triangles: 600, sha256: 'd'.repeat(64) },
  },
  palms: {
    lod0: { url: '/assets/models/island/palm_library_lod0.glb', triangles: 18000, sha256: 'e'.repeat(64) },
    lod1: { url: '/assets/models/island/palm_library_lod1.glb', triangles: 7200, sha256: 'f'.repeat(64) },
    lod2: { url: '/assets/models/island/palm_library_lod2.glb', triangles: 2200, sha256: '1'.repeat(64) },
  },
  placements: [{ variant: 'upright', position: [0, 0, 1], rotationY: 0, scale: 1 }],
};

describe('IslandAssetSystem contracts', () => {
  it('selects a bounded viewport LOD', () => {
    expect(selectIslandLod(1920)).toBe('lod0');
    expect(selectIslandLod(1024)).toBe('lod1');
    expect(selectIslandLod(390)).toBe('lod2');
  });

  it('accepts the generated schema and rejects an unsafe asset URL', () => {
    expect(validateIslandManifest(manifest).schemaVersion).toBe(1);
    expect(() => validateIslandManifest({
      ...manifest,
      palms: { ...manifest.palms, lod0: { ...manifest.palms.lod0, url: 'https://example.com/a.glb' } },
    })).toThrow(/local asset URL/);
  });
});
