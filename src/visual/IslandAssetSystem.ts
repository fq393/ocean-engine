import * as THREE from 'three';
import { convexHull, ShoreField, type ShorePoint } from '../ocean/ShoreField';
import { createIslandFallback, createIslandStructures } from './IslandFactory';
import type { MaterialLibrary } from './MaterialLibrary';
import type {
  AssetEntry,
  IslandAssetManifest,
  IslandLod,
  PalmPlacement,
  PalmVariant,
} from './IslandAssetTypes';

const ISLAND_MANIFEST_URL = '/assets/models/island/asset-manifest.json';
const LODS = ['lod0', 'lod1', 'lod2'] as const satisfies readonly IslandLod[];
const PALM_VARIANTS = ['upright', 'leaning', 'tall', 'wide'] as const satisfies readonly PalmVariant[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function validateEntry(value: unknown, label: string): AssetEntry {
  const record = requireRecord(value, label);
  const url = record.url;
  if (
    typeof url !== 'string'
    || !url.startsWith('/assets/models/island/')
    || url.includes('..')
    || /^[a-z]+:/i.test(url)
  ) {
    throw new TypeError(`${label}.url must be a local asset URL`);
  }
  const triangles = requireFiniteNumber(record.triangles, `${label}.triangles`);
  if (triangles <= 0) throw new TypeError(`${label}.triangles must be positive`);
  const sha256 = record.sha256;
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new TypeError(`${label}.sha256 must be a 64-character digest`);
  }
  return { url, triangles, sha256 };
}

function validatePlacement(value: unknown, index: number): PalmPlacement {
  const record = requireRecord(value, `placements[${index}]`);
  const variant = record.variant;
  if (typeof variant !== 'string' || !PALM_VARIANTS.includes(variant as PalmVariant)) {
    throw new TypeError(`placements[${index}].variant is unknown`);
  }
  const rawPosition = record.position;
  if (!Array.isArray(rawPosition) || rawPosition.length !== 3) {
    throw new TypeError(`placements[${index}].position must contain three values`);
  }
  const position = rawPosition.map((component, axis) => (
    requireFiniteNumber(component, `placements[${index}].position[${axis}]`)
  )) as [number, number, number];
  const rotationY = requireFiniteNumber(record.rotationY, `placements[${index}].rotationY`);
  const scale = requireFiniteNumber(record.scale, `placements[${index}].scale`);
  if (scale <= 0 || scale > 3) throw new TypeError(`placements[${index}].scale is unsafe`);
  return { variant: variant as PalmVariant, position, rotationY, scale };
}

export function selectIslandLod(viewportWidth: number): IslandLod {
  if (viewportWidth >= 1440) return 'lod0';
  if (viewportWidth >= 640) return 'lod1';
  return 'lod2';
}

export function validateIslandManifest(value: unknown): IslandAssetManifest {
  const manifest = requireRecord(value, 'manifest');
  if (manifest.schemaVersion !== 1) throw new TypeError('manifest schemaVersion must be 1');
  if (manifest.unitMeters !== 1) throw new TypeError('manifest unitMeters must be 1');
  const islandRecord = requireRecord(manifest.island, 'manifest.island');
  const palmRecord = requireRecord(manifest.palms, 'manifest.palms');
  const island = {
    lod0: validateEntry(islandRecord.lod0, 'manifest.island.lod0'),
    lod1: validateEntry(islandRecord.lod1, 'manifest.island.lod1'),
    lod2: validateEntry(islandRecord.lod2, 'manifest.island.lod2'),
    collision: validateEntry(islandRecord.collision, 'manifest.island.collision'),
  };
  const palms = {
    lod0: validateEntry(palmRecord.lod0, 'manifest.palms.lod0'),
    lod1: validateEntry(palmRecord.lod1, 'manifest.palms.lod1'),
    lod2: validateEntry(palmRecord.lod2, 'manifest.palms.lod2'),
  };
  if (!Array.isArray(manifest.placements) || manifest.placements.length > 18) {
    throw new TypeError('manifest placements must contain at most 18 entries');
  }
  const placements = manifest.placements.map(validatePlacement);
  return { schemaVersion: 1, unitMeters: 1, island, palms, placements };
}

function disposeGeometry(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
}

function disposeOwnedModel(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}

function shoreFieldFromCollision(root: THREE.Object3D, islandRoot: THREE.Object3D): ShoreField {
  const point = new THREE.Vector3();
  const points: ShorePoint[] = [];
  root.updateMatrixWorld(true);
  islandRoot.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      points.push({
        x: point.x + islandRoot.position.x,
        z: point.z + islandRoot.position.z,
      });
    }
  });
  const hull = convexHull(points);
  return ShoreField.fromPolygon(hull, { minX: -64, minZ: -92, maxX: 64, maxZ: 36 }, 128);
}

function findMesh(root: THREE.Object3D, name: string): THREE.Mesh {
  const object = root.getObjectByName(name);
  if (!(object instanceof THREE.Mesh)) throw new Error(`Required Blender mesh missing: ${name}`);
  return object;
}

function configureImportedMesh(mesh: THREE.Mesh): void {
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    material.roughness = Math.max(material.roughness, 0.48);
    material.needsUpdate = true;
  }
}

function ensureWindAttribute(geometry: THREE.BufferGeometry): void {
  const existing = geometry.getAttribute('wind_weight')
    ?? geometry.getAttribute('_WIND_WEIGHT')
    ?? geometry.getAttribute('_wind_weight');
  if (existing !== undefined) {
    if (geometry.getAttribute('wind_weight') === undefined) {
      geometry.setAttribute('wind_weight', existing);
    }
    return;
  }
  const positions = geometry.getAttribute('position');
  const weights = new Float32Array(positions.count * 4);
  let maximumY = 0;
  for (let index = 0; index < positions.count; index += 1) {
    maximumY = Math.max(maximumY, positions.getY(index));
  }
  for (let index = 0; index < positions.count; index += 1) {
    const weight = 0.35 + 0.65 * THREE.MathUtils.clamp(positions.getY(index) / Math.max(maximumY, 0.001), 0, 1);
    weights[index * 4] = weight;
    weights[index * 4 + 1] = weight;
    weights[index * 4 + 2] = weight;
    weights[index * 4 + 3] = 1;
  }
  geometry.setAttribute('wind_weight', new THREE.BufferAttribute(weights, 4));
}

export class IslandAssetSystem {
  readonly root = new THREE.Group();
  readonly ready: Promise<'blender-glb' | 'procedural-fallback'>;
  readonly shoreFieldReady: Promise<ShoreField>;
  readonly diagnostics: {
    source: 'loading' | 'blender-glb' | 'procedural-fallback';
    lod: IslandLod;
    error?: string;
    shore: 'loading' | 'collision-glb' | 'fallback';
    shoreError?: string;
  };
  readonly #fallback: THREE.Group;
  readonly #importedMaterials = new Set<THREE.Material>();
  readonly #windUniforms: Array<{ value: number }> = [];

  constructor(materials: MaterialLibrary, viewportWidth: number) {
    const lod = selectIslandLod(viewportWidth);
    this.diagnostics = { source: 'loading', lod, shore: 'loading' };
    this.root.name = 'island';
    this.root.position.set(0, 0, -28);
    const fallback = createIslandFallback(materials);
    this.#fallback = fallback.root;
    this.#fallback.name = 'proceduralIslandFallback';
    this.#fallback.position.set(0, 0, 0);
    this.root.add(this.#fallback);
    const loaded = this.#load(materials, lod);
    this.ready = loaded.then((result) => result.source);
    this.shoreFieldReady = loaded.then((result) => result.shoreField);
  }

  async #load(
    materials: MaterialLibrary,
    lod: IslandLod,
  ): Promise<{
    source: 'blender-glb' | 'procedural-fallback';
    shoreField: ShoreField;
  }> {
    let shoreFieldPromise: Promise<ShoreField> | undefined;
    try {
      const response = await fetch(ISLAND_MANIFEST_URL);
      if (!response.ok) throw new Error(`Island manifest request failed: ${response.status}`);
      const manifest = validateIslandManifest(await response.json());
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      shoreFieldPromise = loader.loadAsync(manifest.island.collision.url)
        .then((collisionGltf) => {
          const shoreField = shoreFieldFromCollision(collisionGltf.scene, this.root);
          disposeOwnedModel(collisionGltf.scene);
          this.diagnostics.shore = 'collision-glb';
          return shoreField;
        })
        .catch((error: unknown) => {
          this.diagnostics.shore = 'fallback';
          this.diagnostics.shoreError = error instanceof Error ? error.message : String(error);
          return ShoreField.fallbackIsland();
        });
      const [islandGltf, palmGltf] = await Promise.all([
        loader.loadAsync(manifest.island[lod].url),
        loader.loadAsync(manifest.palms[lod].url),
      ]);
      const detailed = new THREE.Group();
      detailed.name = 'blenderIslandAssets';
      islandGltf.scene.name = 'blenderIslandTerrain';
      islandGltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        configureImportedMesh(object);
        const assigned = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of assigned) this.#importedMaterials.add(material);
      });
      detailed.add(islandGltf.scene);
      palmGltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const assigned = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of assigned) this.#importedMaterials.add(material);
      });
      this.#createPalmInstances(detailed, palmGltf.scene, manifest.placements, lod);
      detailed.add(createIslandStructures(materials));
      this.root.add(detailed);
      this.root.remove(this.#fallback);
      disposeGeometry(this.#fallback);
      this.diagnostics.source = 'blender-glb';
      return { source: 'blender-glb', shoreField: await shoreFieldPromise };
    } catch (error) {
      this.diagnostics.source = 'procedural-fallback';
      this.diagnostics.error = error instanceof Error ? error.message : String(error);
      const shoreField = shoreFieldPromise
        ? await shoreFieldPromise
        : ShoreField.fallbackIsland();
      if (!shoreFieldPromise) this.diagnostics.shore = 'fallback';
      return { source: 'procedural-fallback', shoreField };
    }
  }

  #createPalmInstances(
    target: THREE.Group,
    palmLibrary: THREE.Object3D,
    placements: readonly PalmPlacement[],
    lod: IslandLod,
  ): void {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (const variant of PALM_VARIANTS) {
      const variantPlacements = placements.filter((placement) => placement.variant === variant);
      if (variantPlacements.length === 0) continue;
      for (const role of ['trunk', 'fronds'] as const) {
        const source = findMesh(palmLibrary, `GEO_palm_${variant}_${role}_${lod}`);
        if (role === 'fronds') ensureWindAttribute(source.geometry);
        const instances = new THREE.InstancedMesh(
          source.geometry,
          source.material,
          variantPlacements.length,
        );
        instances.name = `INST_palm_${variant}_${role}_${lod}`;
        instances.castShadow = role === 'trunk';
        instances.receiveShadow = role === 'trunk';
        const assigned = Array.isArray(source.material) ? source.material : [source.material];
        for (const material of assigned) {
          if (role === 'fronds' && material instanceof THREE.MeshStandardMaterial) {
            material.side = THREE.DoubleSide;
            material.alphaTest = 0.42;
            material.depthWrite = true;
            this.#patchWindMaterial(material);
          }
        }
        variantPlacements.forEach((placement, index) => {
          position.fromArray(placement.position);
          quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, placement.rotationY);
          scale.setScalar(placement.scale);
          matrix.compose(position, quaternion, scale);
          instances.setMatrixAt(index, matrix);
        });
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingBox();
        instances.computeBoundingSphere();
        target.add(instances);
      }
    }
  }

  #patchWindMaterial(material: THREE.MeshStandardMaterial): void {
    if (material.userData.islandPalmWind === true) return;
    material.userData.islandPalmWind = true;
    material.onBeforeCompile = (shader) => {
      const windTime = { value: 0 };
      shader.uniforms.uWindTime = windTime;
      shader.vertexShader = `attribute vec4 wind_weight;\nuniform float uWindTime;\n${shader.vertexShader}`
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float windPhase = 0.0;
           #ifdef USE_INSTANCING
             windPhase = instanceMatrix[3].x * 0.23 + instanceMatrix[3].z * 0.19;
           #endif
           float windWeight = wind_weight.r;
           transformed.x += sin(uWindTime * 1.35 + position.y * 0.72 + windPhase) * windWeight * 0.12;
           transformed.z += cos(uWindTime * 1.08 + position.x * 0.55 + windPhase) * windWeight * 0.08;`,
        );
      this.#windUniforms.push(windTime);
    };
    material.customProgramCacheKey = () => 'island-palm-wind-v1';
    material.needsUpdate = true;
  }

  update(timeSeconds: number): void {
    for (const uniform of this.#windUniforms) uniform.value = timeSeconds;
  }

  dispose(): void {
    disposeGeometry(this.root);
    for (const material of this.#importedMaterials) material.dispose();
    this.#windUniforms.length = 0;
    this.root.clear();
  }
}
