// Instanced spruces on forest cells of the Czech grid.
import { THREE } from "./three.ts";
import { CZ_MASK, ELEVATION, FOREST, GRID } from "../data/grid.ts";
import { cellLat, cellLon } from "../model/weather.ts";
import { altToY, latToZ, lonToX } from "./mapMath.ts";
import { hash01 } from "../model/math.ts";
import {
  buildSpruceGeometry,
  buildTrunkGeometry,
  spruceMaterial,
  spruceTrunkMaterial,
} from "./spruce.ts";

export const buildForest = (): THREE.Group => {
  const root = new THREE.Group();
  root.name = "forest";

  type Spot = { x: number; y: number; z: number; s: number; rot: number };
  const spots: Spot[] = [];
  const n = GRID.cols * GRID.rows;
  // Stride keeps draw calls sane; denser where canopy is thick.
  for (let i = 0; i < n; i++) {
    if (!CZ_MASK[i]) continue;
    const cover = FOREST[i] ?? 0;
    if (cover < 50) continue;
    const stride = cover >= 75 ? 2 : 3;
    if (i % stride !== 0) continue;
    // skip some for natural gaps
    if (hash01(i, 7) < 0.35) continue;
    const lon = cellLon(i);
    const lat = cellLat(i);
    const alt = ELEVATION[i] ?? 300;
    const s = (0.275 + hash01(i, 3) * 0.35 + (cover / 100) * 0.175) * 0.75;
    spots.push({
      x: lonToX(lon) + (hash01(i, 1) - 0.5) * 0.35,
      y: altToY(alt),
      z: latToZ(lat) + (hash01(i, 2) - 0.5) * 0.35,
      s,
      rot: hash01(i, 9) * Math.PI * 2,
    });
  }

  const canopy = new THREE.InstancedMesh(
    buildSpruceGeometry(),
    spruceMaterial(),
    spots.length,
  );
  canopy.castShadow = true;
  const trunk = new THREE.InstancedMesh(
    buildTrunkGeometry(),
    spruceTrunkMaterial(),
    spots.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  spots.forEach((sp, i) => {
    e.set(0, sp.rot, 0);
    q.setFromEuler(e);
    p.set(sp.x, sp.y, sp.z);
    s.set(sp.s, sp.s, sp.s);
    m.compose(p, q, s);
    canopy.setMatrixAt(i, m);
    s.set(sp.s, sp.s, sp.s);
    m.compose(p, q, s);
    trunk.setMatrixAt(i, m);
  });
  canopy.instanceMatrix.needsUpdate = true;
  trunk.instanceMatrix.needsUpdate = true;
  root.add(trunk);
  root.add(canopy);
  return root;
};
