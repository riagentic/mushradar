// Simple spruce tree — shared geometry for InstancedMesh forests.
import { THREE } from "./three.ts";

export const buildSpruceGeometry = (): THREE.BufferGeometry => {
  const g = new THREE.ConeGeometry(0.35, 1.4, 7);
  g.translate(0, 0.7, 0);
  return g;
};

export const spruceMaterial = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: 0x3f7a34, // deeper spruce green
    roughness: 0.85,
    metalness: 0.02,
    flatShading: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

export const spruceTrunkMaterial = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: 0x4a352a, // darker bark
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });

export const buildTrunkGeometry = (): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(0.06, 0.09, 0.35, 5);
  g.translate(0, 0.15, 0);
  return g;
};
