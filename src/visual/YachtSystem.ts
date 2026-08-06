import * as THREE from 'three';
import type { BoatState } from '../boat/types';
import type { MaterialLibrary } from './MaterialLibrary';

export function computeNormalizationScale(bounds: THREE.Box3, targetLength: number): number {
  const size = bounds.getSize(new THREE.Vector3());
  const horizontalLength = Math.max(size.x, size.z, Number.EPSILON);
  return targetLength / horizontalLength;
}

export function normalizeYachtModel(model: THREE.Object3D, targetLength = 9, draftDepth = 1.05): void {
  model.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(model);
  const scale = computeNormalizationScale(initialBounds, targetLength);
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);

  const scaledBounds = new THREE.Box3().setFromObject(model);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y += -scaledBounds.min.y - draftDepth;
  model.updateMatrixWorld(true);
}

function createHullGeometry(): THREE.BufferGeometry {
  const sections: Array<readonly [number, number, number, number]> = [
    [-4.2, 1.15, 0.42, -0.54], [-3.1, 1.62, 0.52, -0.72], [-1.2, 1.72, 0.58, -0.82],
    [1.3, 1.48, 0.62, -0.66], [3.15, 0.78, 0.68, -0.34], [4.25, 0.04, 0.72, 0.18],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [z, width, deck, keel] of sections) {
    positions.push(-width, deck, z, -width * 1.06, 0, z, 0, keel, z, width * 1.06, 0, z, width, deck, z);
  }
  for (let section = 0; section < sections.length - 1; section += 1) {
    const start = section * 5;
    const next = start + 5;
    for (let side = 0; side < 4; side += 1) {
      indices.push(start + side, next + side, next + side + 1, start + side, next + side + 1, start + side + 1);
    }
  }
  indices.push(0, 1, 2, 0, 2, 3, 0, 3, 4);
  const last = (sections.length - 1) * 5;
  indices.push(last, last + 2, last + 1, last, last + 3, last + 2, last, last + 4, last + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createDeckGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1.08, -3.9);
  shape.lineTo(-1.52, -2.9);
  shape.lineTo(-1.62, -1.0);
  shape.lineTo(-1.36, 1.5);
  shape.lineTo(-0.62, 3.2);
  shape.lineTo(0, 4.05);
  shape.lineTo(0.62, 3.2);
  shape.lineTo(1.36, 1.5);
  shape.lineTo(1.62, -1.0);
  shape.lineTo(1.52, -2.9);
  shape.lineTo(1.08, -3.9);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 12);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function addRail(group: THREE.Group, x: number, material: THREE.Material): void {
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 5.3, 6), material);
  rail.position.set(x, 1.15, 0.3);
  rail.rotation.x = Math.PI / 2;
  group.add(rail);
  for (const z of [-2.2, -0.7, 0.8, 2.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 6), material);
    post.position.set(x, 0.88, z);
    group.add(post);
  }
}

function createProceduralYacht(materials: MaterialLibrary): THREE.Group {
  const visual = new THREE.Group();
  visual.name = 'yachtVisual';
  const hull = new THREE.Mesh(createHullGeometry(), materials.yachtHull);
  hull.name = 'sculptedHull';
  hull.castShadow = true;
  hull.receiveShadow = true;
  visual.add(hull);

  const deck = new THREE.Mesh(createDeckGeometry(), materials.wood);
  deck.name = 'teakDeck';
  deck.position.y = 0.64;
  deck.receiveShadow = true;
  visual.add(deck);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.75, 1.05, 3.2), materials.yachtHull);
  cabin.name = 'mainCabin';
  cabin.position.set(0, 1.14, -0.15);
  cabin.castShadow = true;
  visual.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.78, 2.48), materials.yachtGlass);
  glass.name = 'panoramicGlass';
  glass.position.set(0, 1.9, 0.18);
  glass.castShadow = true;
  visual.add(glass);
  const flybridge = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.16, 2.6), materials.yachtHull);
  flybridge.position.set(0, 2.38, 0.05);
  flybridge.castShadow = true;
  visual.add(flybridge);

  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.12, 1.55), materials.wood);
  rearDeck.position.set(0, 0.82, -2.8);
  visual.add(rearDeck);
  const lounge = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 0.75), materials.villa);
  lounge.position.set(0, 1.02, -2.48);
  visual.add(lounge);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.15, 8), materials.metalTrim);
  mast.position.set(0, 3.0, 0.15);
  visual.add(mast);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.18), materials.yachtHull);
  radar.position.set(0, 3.58, 0.15);
  visual.add(radar);
  const radarDome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), materials.yachtHull);
  radarDome.position.set(0.48, 3.32, -0.05);
  visual.add(radarDome);

  addRail(visual, -1.38, materials.metalTrim);
  addRail(visual, 1.38, materials.metalTrim);
  return visual;
}

export class YachtSystem {
  readonly root = new THREE.Group();
  readonly wakeAnchor = new THREE.Object3D();
  readonly collisionProxy: THREE.Mesh;
  readonly diagnostics: { source: 'loading' | 'tripo-pbr' | 'procedural-fallback'; error?: string } = {
    source: 'loading',
  };
  readonly ready: Promise<'tripo-pbr' | 'procedural-fallback'>;
  readonly #fallbackVisual: THREE.Group;
  #detailedVisual: THREE.Object3D | undefined;

  constructor(materials: MaterialLibrary) {
    this.root.name = 'yacht';
    this.root.userData.sceneMarker = 'yacht';
    this.#fallbackVisual = createProceduralYacht(materials);
    this.root.add(this.#fallbackVisual);
    this.wakeAnchor.name = 'wakeAnchor';
    this.wakeAnchor.position.set(0, 0.05, -4.25);
    this.root.add(this.wakeAnchor);
    this.collisionProxy = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.8, 8.5),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.collisionProxy.name = 'collisionProxy';
    this.collisionProxy.position.y = 0.1;
    this.root.add(this.collisionProxy);
    this.ready = this.#loadDetailedModel();
  }

  async #loadDetailedModel(): Promise<'tripo-pbr' | 'procedural-fallback'> {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync('/assets/models/yacht/yacht-optimized.glb');
      const model = gltf.scene;
      model.name = 'tripoPbrYacht';
      normalizeYachtModel(model);
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      this.#detailedVisual = model;
      this.root.add(model);
      this.#fallbackVisual.visible = false;
      this.diagnostics.source = 'tripo-pbr';
      return 'tripo-pbr';
    } catch (error) {
      this.diagnostics.source = 'procedural-fallback';
      this.diagnostics.error = error instanceof Error ? error.message : String(error);
      return 'procedural-fallback';
    }
  }

  update(state: Readonly<BoatState>): void {
    this.root.position.set(state.x, state.heave, state.z);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(state.pitch, state.yaw, state.roll);
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
    });
    this.#detailedVisual?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of assigned) material.dispose();
    });
  }
}
