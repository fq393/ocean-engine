import * as THREE from 'three';

export interface MaterialLibrary {
  terrain: THREE.MeshStandardMaterial;
  sandWet: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  trunk: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  villa: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  yachtHull: THREE.MeshPhysicalMaterial;
  yachtGlass: THREE.MeshPhysicalMaterial;
  metalTrim: THREE.MeshStandardMaterial;
  foam: THREE.MeshBasicMaterial;
}

export function createMaterialLibrary(): MaterialLibrary {
  return {
    terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }),
    sandWet: new THREE.MeshStandardMaterial({ color: '#b59662', roughness: 0.62, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ color: '#615d50', roughness: 0.88, metalness: 0 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#176844', roughness: 0.78, metalness: 0, side: THREE.DoubleSide }),
    trunk: new THREE.MeshStandardMaterial({ color: '#745038', roughness: 0.9, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ color: '#8b5b35', roughness: 0.68, metalness: 0 }),
    villa: new THREE.MeshStandardMaterial({ color: '#f0e8d6', roughness: 0.66, metalness: 0 }),
    roof: new THREE.MeshStandardMaterial({ color: '#a84c30', roughness: 0.76, metalness: 0 }),
    yachtHull: new THREE.MeshPhysicalMaterial({
      color: '#f7f9f8', roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    }),
    yachtGlass: new THREE.MeshPhysicalMaterial({
      color: '#173846', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82,
      clearcoat: 1, depthWrite: true,
    }),
    metalTrim: new THREE.MeshStandardMaterial({ color: '#ccd4d5', roughness: 0.28, metalness: 0.92 }),
    foam: new THREE.MeshBasicMaterial({ color: '#f3ffff', transparent: true, opacity: 0.8, depthWrite: false }),
  };
}
