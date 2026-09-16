// Procedural edible-mushroom meshes from Species.look (Three.js).
import { THREE } from "./three.ts";
import type { CapShape, Species } from "../data/species.ts";

const capGeo = (
  shape: CapShape,
  w: number,
  h: number,
): THREE.BufferGeometry => {
  switch (shape) {
    case "funnel":
      return new THREE.CylinderGeometry(w * 0.15, w * 0.55, h, 16, 1, false);
    case "bell":
      return new THREE.SphereGeometry(
        w * 0.45,
        16,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.55,
      );
    case "umbrella":
      return new THREE.ConeGeometry(w * 0.55, h * 0.9, 16, 1, true);
    case "flat":
      return new THREE.CylinderGeometry(w * 0.5, w * 0.5, h * 0.35, 16);
    case "convex":
    default:
      return new THREE.SphereGeometry(
        w * 0.48,
        16,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.6,
      );
  }
};

export const buildMushroom = (sp: Species, scale = 1): THREE.Group => {
  const g = new THREE.Group();
  g.name = sp.id;
  const { look } = sp;
  const s = 0.55 * scale;

  const stemMat = new THREE.MeshStandardMaterial({
    color: look.stemColor,
    roughness: 0.85,
    metalness: 0.05,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: look.capColor,
    roughness: 0.7,
    metalness: 0.02,
  });
  const underMat = new THREE.MeshStandardMaterial({
    color: look.underColor,
    roughness: 0.9,
    metalness: 0,
  });

  const stemH = look.stemH * s;
  const stemW = look.stemW * s * 0.5;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(
      stemW * 0.85,
      stemW * (look.bulb ? 1.35 : 1),
      stemH,
      10,
    ),
    stemMat,
  );
  stem.position.y = stemH / 2;
  stem.castShadow = true;
  g.add(stem);

  if (look.ring) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(stemW * 1.2, stemW * 0.18, 6, 12),
      stemMat,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = stemH * 0.72;
    g.add(ring);
  }

  const capW = look.capW * s;
  const capH = look.capH * s;
  const cap = new THREE.Mesh(capGeo(look.cap, capW, capH), capMat);
  cap.position.y = stemH + capH * 0.25;
  cap.castShadow = true;
  g.add(cap);

  const under = new THREE.Mesh(
    new THREE.CircleGeometry(capW * 0.42, 16),
    underMat,
  );
  under.rotation.x = -Math.PI / 2;
  under.position.y = stemH + 0.02;
  g.add(under);

  return g;
};
