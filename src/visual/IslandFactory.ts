import * as THREE from 'three';
import type { MaterialLibrary } from './MaterialLibrary';

export interface IslandResult {
  root: THREE.Group;
  shoreline: Readonly<{ radiusX: number; radiusZ: number }>;
  diagnostics: Readonly<{ palms: number; rocks: number }>;
}

const ISLAND_RX = 18;
const ISLAND_RZ = 13;

function ripple(angle: number): number {
  return Math.sin(angle * 3.1) * 0.18 + Math.sin(angle * 7.3 + 0.8) * 0.1;
}

export function sampleIslandHeight(normalizedRadius: number, angle: number): number {
  const r = Math.max(0, normalizedRadius);
  if (r > 0.94) return -0.25 - (r - 0.94) * 8;
  const crown = 3.5 * Math.pow(Math.max(0, 1 - r), 1.35);
  const shelf = r > 0.72 ? (0.94 - r) * 2.4 : 0;
  return Math.max(0.08, crown + shelf + ripple(angle) * (1 - r));
}

function createTerrain(material: THREE.Material): THREE.Mesh {
  const segments = 72;
  const rings = 36;
  const positions: number[] = [0, sampleIslandHeight(0, 0), 0];
  const colors: number[] = [0.22, 0.46, 0.23];
  const indices: number[] = [];
  const color = new THREE.Color();

  for (let ring = 1; ring <= rings; ring += 1) {
    const r = (ring / rings) * 1.12;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const edgeNoise = 1 + ripple(angle) * 0.18;
      const localR = r * edgeNoise;
      const y = sampleIslandHeight(localR, angle);
      positions.push(Math.cos(angle) * ISLAND_RX * localR, y, Math.sin(angle) * ISLAND_RZ * localR);
      if (localR < 0.67) color.set('#3c7745').offsetHSL(0, 0, ripple(angle) * 0.08);
      else if (localR < 0.94) color.set(localR > 0.86 ? '#d8bd78' : '#cdb06a');
      else color.set('#9bbf93');
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + segment, 1 + ((segment + 1) % segments));
  }
  for (let ring = 1; ring < rings; ring += 1) {
    const aStart = 1 + (ring - 1) * segments;
    const bStart = 1 + ring * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(aStart + segment, bStart + segment, bStart + next);
      indices.push(aStart + segment, bStart + next, aStart + next);
    }
  }
  for (let index = 0; index < indices.length; index += 3) {
    const second = indices[index + 1];
    indices[index + 1] = indices[index + 2]!;
    indices[index + 2] = second!;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = 'terrain';
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  return terrain;
}

function createGableRoof(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -5, 0, -4, 5, 0, -4, 5, 0, 4, -5, 0, 4,
    -5, 0, -4, 0, 2.2, -4, 5, 0, -4,
    -5, 0, 4, 5, 0, 4, 0, 2.2, 4,
    -5, 0, -4, -5, 0, 4, 0, 2.2, 4, 0, 2.2, -4,
    5, 0, -4, 0, 2.2, -4, 0, 2.2, 4, 5, 0, 4,
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 10, 12, 13, 14, 15, 16, 14, 16, 17]);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function createVilla(materials: MaterialLibrary): THREE.Group {
  const villa = new THREE.Group();
  villa.name = 'villa';
  villa.position.set(-2, 2.5, -1.5);
  villa.scale.setScalar(0.78);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(10, 3.4, 7.5), materials.villa);
  lower.castShadow = true;
  lower.receiveShadow = true;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.4, 5.4), materials.villa);
  upper.position.set(0.8, 2.8, 0);
  upper.castShadow = true;
  const roof = createGableRoof(materials.roof);
  roof.position.y = 5.1;
  roof.scale.set(0.82, 0.82, 0.82);
  roof.castShadow = true;
  villa.add(lower, upper, roof);

  const terrace = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.22, 2.7), materials.wood);
  terrace.position.set(0, -1.52, 4.25);
  terrace.castShadow = true;
  terrace.receiveShadow = true;
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.18, 1.65), materials.villa);
  balcony.position.set(0.7, 1.72, 3.55);
  balcony.castShadow = true;
  const postGeometry = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8);
  const posts = new THREE.InstancedMesh(postGeometry, materials.wood, 6);
  const postMatrix = new THREE.Matrix4();
  for (let index = 0; index < 6; index += 1) {
    postMatrix.makeTranslation(-4.7 + index * 1.9, 0.05, 5.02);
    posts.setMatrixAt(index, postMatrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.castShadow = true;
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.16, 2.45), materials.roof);
  canopy.position.set(0, 1.68, 4.42);
  canopy.rotation.x = -0.08;
  canopy.castShadow = true;
  villa.add(terrace, balcony, posts, canopy);

  const windowGeometry = new THREE.PlaneGeometry(1.35, 1.45);
  const windowMaterial = materials.yachtGlass;
  for (let index = -2; index <= 2; index += 1) {
    const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
    windowMesh.position.set(index * 1.65, 0.35, 3.76);
    villa.add(windowMesh);
  }
  return villa;
}

function createPalmFrondGeometry(): THREE.BufferGeometry {
  const segments = 8;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const x = t * 3.8;
    const y = -Math.pow(t, 1.55) * 0.72;
    const halfWidth = Math.sin(t * Math.PI) * 0.34 + 0.015;
    positions.push(x, y, -halfWidth, x, y, halfWidth);
    if (index < segments) {
      const start = index * 2;
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createJetty(materials: MaterialLibrary): THREE.Group {
  const jetty = new THREE.Group();
  jetty.name = 'jetty';
  jetty.position.set(13, 0.45, 6);
  jetty.rotation.y = -0.38;
  const plankGeometry = new THREE.BoxGeometry(1.05, 0.22, 3.2);
  const planks = new THREE.InstancedMesh(plankGeometry, materials.wood, 10);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 10; index += 1) {
    matrix.makeTranslation(index * 1.05, 0, 0);
    planks.setMatrixAt(index, matrix);
  }
  planks.castShadow = true;
  planks.receiveShadow = true;
  jetty.add(planks);
  return jetty;
}

function createPalms(materials: MaterialLibrary, count: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'palms';
  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.32, 4.8, 7, 4);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, count);
  trunks.castShadow = true;
  const leafGeometry = createPalmFrondGeometry();
  const leavesPerPalm = 11;
  const leaves = new THREE.InstancedMesh(leafGeometry, materials.foliage, count * leavesPerPalm);
  leaves.castShadow = true;
  const dummy = new THREE.Object3D();
  const positions: ReadonlyArray<readonly [number, number]> = [
    [-13, 4], [-10, -7], [-6, 8], [5, 8], [9, -7], [14, 3],
    [-16, -2], [16, -3], [1, -10], [-2, 10], [11, 7], [-12, 9],
  ];
  for (let index = 0; index < count; index += 1) {
    const [x, z] = positions[index] ?? [0, 0];
    const r = Math.hypot(x / ISLAND_RX, z / ISLAND_RZ);
    const angle = Math.atan2(z / ISLAND_RZ, x / ISLAND_RX);
    const baseY = sampleIslandHeight(r, angle);
    dummy.position.set(x, baseY + 2.4, z);
    dummy.rotation.set(0.03 * Math.sin(index), index * 0.7, 0.08 * Math.cos(index));
    dummy.scale.setScalar(0.85 + (index % 3) * 0.08);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
    for (let leaf = 0; leaf < leavesPerPalm; leaf += 1) {
      dummy.position.set(x, baseY + 4.7, z);
      dummy.rotation.set(-0.12 + (leaf % 3) * 0.09, (leaf / leavesPerPalm) * Math.PI * 2 + index, -0.12);
      dummy.scale.setScalar(0.72 + (index % 2) * 0.07);
      dummy.updateMatrix();
      leaves.setMatrixAt(index * leavesPerPalm + leaf, dummy.matrix);
    }
  }
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  group.add(trunks, leaves);
  return group;
}

function createRocks(materials: MaterialLibrary, count: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rocks';
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), materials.rock, count);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.39996;
    const r = 0.72 + (index % 4) * 0.065;
    const x = Math.cos(angle) * ISLAND_RX * r;
    const z = Math.sin(angle) * ISLAND_RZ * r;
    dummy.position.set(x, sampleIslandHeight(r, angle) + 0.35, z);
    dummy.rotation.set(index * 0.31, index * 0.63, index * 0.19);
    dummy.scale.set(0.55 + (index % 4) * 0.17, 0.45 + (index % 3) * 0.2, 0.65 + (index % 5) * 0.13);
    dummy.updateMatrix();
    rocks.setMatrixAt(index, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);
  return group;
}

export function createIslandStructures(materials: MaterialLibrary): THREE.Group {
  const structures = new THREE.Group();
  structures.name = 'islandStructures';
  structures.add(createVilla(materials), createJetty(materials), createRocks(materials, 18));
  return structures;
}

export function createIslandFallback(materials: MaterialLibrary): IslandResult {
  const root = new THREE.Group();
  root.name = 'island';
  root.position.set(0, 0, -28);
  const palms = 12;
  const rocks = 18;
  root.add(
    createTerrain(materials.terrain),
    createVilla(materials),
    createJetty(materials),
    createPalms(materials, palms),
    createRocks(materials, rocks),
  );
  return {
    root,
    shoreline: Object.freeze({ radiusX: ISLAND_RX, radiusZ: ISLAND_RZ }),
    diagnostics: Object.freeze({ palms, rocks }),
  };
}

export const createIsland = createIslandFallback;
