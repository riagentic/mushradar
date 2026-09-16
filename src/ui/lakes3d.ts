// Lakes and reservoirs as irregular flat pools that sit on the terrain.
//
// A real lake is a dendritic flooded valley; at map scale an irregular,
// rotated ellipse reads correctly. The surface is drawn FLAT at the lowest
// terrain height under its footprint, so a pool on a slope never sinks into
// the ground, and lifted a hair so it never z-fights the surface.
import { THREE } from "./three.ts";
import { type Lake, LAKES } from "../data/lakes.ts";
import { ELEVATION, GRID } from "../data/grid.ts";
import { altToY, insideCz, latToZ, lonToX, sampleBilinear } from "./mapMath.ts";
import { hash01 } from "../model/math.ts";

/** km per degree at ~50° N — matches model/weather.ts */
const KM_PER_LAT = 111;
const KM_PER_LON = 71.5;

const LIFT = 0.05;
const SEGMENTS = 48;

const altAt = (lon: number, lat: number): number => {
  const sc = (lon - GRID.lon0) / (GRID.lon1 - GRID.lon0) * (GRID.cols - 1);
  const sr = (lat - GRID.lat0) / (GRID.lat1 - GRID.lat0) * (GRID.rows - 1);
  return sampleBilinear(ELEVATION, sc, sr);
};

/** Lowest terrain height under the pool, so the flat surface never clips. */
const floorY = (
  lake: Lake,
  axKm: number,
  axKm2: number,
  rot: number,
): number => {
  let min = Infinity;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    // sample the two axis tips and the corners between
    const u = Math.cos(a) * axKm;
    const v = Math.sin(a) * axKm2;
    const dx = u * Math.cos(rot) - v * Math.sin(rot);
    const dy = u * Math.sin(rot) + v * Math.cos(rot);
    const lon = lake.lon + dx / KM_PER_LON;
    const lat = lake.lat + dy / KM_PER_LAT;
    min = Math.min(min, altAt(lon, lat));
  }
  return altToY(min);
};

export const buildLakes = (): THREE.Group => {
  const root = new THREE.Group();
  root.name = "lakes";

  const material = new THREE.MeshStandardMaterial({
    color: 0x1f6fa8, // same water as the rivers
    emissive: 0x0d3d63,
    emissiveIntensity: 0.4,
    roughness: 0.28,
    metalness: 0.15,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
  });

  for (const lake of LAKES) {
    // order 1 → big reservoir, 3 → pond; keep the drawn size honest to data.
    const scale = lake.order === 1 ? 1.0 : lake.order === 2 ? 0.95 : 0.9;
    const axKm = lake.lenKm * scale;
    const axKm2 = Math.max(lake.widKm * scale, 0.35);
    const rot = (lake.rotDeg * Math.PI) / 180;
    const cx = lonToX(lake.lon);
    const cz = latToZ(lake.lat);
    const y = floorY(lake, axKm, axKm2, rot) + LIFT;

    const shoreLonLat = (i: number): [number, number] => {
      const a = (i / SEGMENTS) * Math.PI * 2;
      // Irregular shoreline: a small deterministic wobble per lake + angle.
      const wob = 0.82 + 0.36 * hash01(i * 7 + Math.round(lake.lon * 100), 11);
      const u = Math.cos(a) * axKm * wob;
      const v = Math.sin(a) * axKm2 * wob;
      return [
        lake.lon +
        (u * Math.cos(rot) - v * Math.sin(rot)) / KM_PER_LON,
        lake.lat +
        (u * Math.sin(rot) + v * Math.cos(rot)) / KM_PER_LAT,
      ];
    };
    const positions: number[] = [cx, y, cz];
    const index: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      let [lon, lat] = shoreLonLat(i);
      // Lakes on the border (Lipno, Vranov) would otherwise draw water over
      // foreign land. Shrink this vertex toward the centroid until it lands
      // inside — the fan stays intact, only the shore pulls in.
      if (!insideCz(lon, lat)) {
        let lo = 0, hi = 1;
        for (let it = 0; it < 16; it++) {
          const mid = (lo + hi) / 2;
          const l = lake.lon + (lon - lake.lon) * mid;
          const t = lake.lat + (lat - lake.lat) * mid;
          if (insideCz(l, t)) lo = mid;
          else hi = mid;
        }
        lon = lake.lon + (lon - lake.lon) * lo;
        lat = lake.lat + (lat - lake.lat) * lo;
      }
      positions.push(lonToX(lon), y, latToZ(lat));
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const a = 1 + i;
      const b = 1 + ((i + 1) % SEGMENTS);
      index.push(0, a, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `lake-${lake.id}`;
    mesh.userData = { kind: "lake", id: lake.id, name: lake.name };
    root.add(mesh);
  }

  return root;
};
