import { THREE } from "./three.ts";
import { CZ_BORDER, GRID } from "../data/grid.ts";

/** World units across the CZ bbox. */
export const MAP_W = 48;
export const MAP_D = 30;
/** metres → world Y */
export const EXAGGERATE = 0.0027;

/**
 * Geographic → world (measured against Three.js camera basis):
 *   west → +X, east → −X
 *   south → −Z, north → +Z
 * Default camera sits SOUTH (az=π) looking north; camera-right is −X, so +X
 * (west) appears on the LEFT — Praha west of Svitavy.
 */
export const lonToX = (lon: number): number =>
  (0.5 - (lon - GRID.lon0) / (GRID.lon1 - GRID.lon0)) * MAP_W;

export const latToZ = (lat: number): number =>
  ((lat - GRID.lat0) / (GRID.lat1 - GRID.lat0) - 0.5) * MAP_D;

/** Inverse projections — world back to geographic. */
export const xToLon = (x: number): number =>
  GRID.lon0 + (0.5 - x / MAP_W) * (GRID.lon1 - GRID.lon0);

export const zToLat = (z: number): number =>
  GRID.lat0 + (z / MAP_D + 0.5) * (GRID.lat1 - GRID.lat0);

export const altToY = (alt: number): number => alt * EXAGGERATE;

/** Grid value at fractional (col, row), bilinearly interpolated — the source
 *  is 96×60, so sampling it on a finer lattice is what removes the staircase. */
export const sampleBilinear = (
  values: readonly number[],
  col: number,
  row: number,
): number => {
  const c = Math.max(0, Math.min(GRID.cols - 1, col));
  const r = Math.max(0, Math.min(GRID.rows - 1, row));
  const c0 = Math.floor(c), r0 = Math.floor(r);
  const c1 = Math.min(GRID.cols - 1, c0 + 1);
  const r1 = Math.min(GRID.rows - 1, r0 + 1);
  const fx = c - c0, fy = r - r0;
  const v00 = values[r0 * GRID.cols + c0] ?? 0;
  const v10 = values[r0 * GRID.cols + c1] ?? v00;
  const v01 = values[r1 * GRID.cols + c0] ?? v00;
  const v11 = values[r1 * GRID.cols + c1] ?? v00;
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
    v01 * (1 - fx) * fy + v11 * fx * fy;
};

/** Ray-cast point-in-polygon against the simplified Czech border. */
export const insideCz = (lon: number, lat: number): boolean => {
  let inside = false;
  for (let i = 0, j = CZ_BORDER.length - 1; i < CZ_BORDER.length; j = i++) {
    const [xi, yi] = CZ_BORDER[i];
    const [xj, yj] = CZ_BORDER[j];
    if (
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) inside = !inside;
  }
  return inside;
};

/**
 * Terrain is tessellated finer than the 96×60 source so both the elevation
 * steps and the border staircase shrink by this factor. Bilinear sampling
 * keeps the height field continuous, so the finer mesh cannot invent terrain.
 */
export const TERRAIN_SUBDIV = 3;
export const FINE_COLS = (GRID.cols - 1) * TERRAIN_SUBDIV + 1;
export const FINE_ROWS = (GRID.rows - 1) * TERRAIN_SUBDIV + 1;

/** Fine-lattice position → source-grid fractional (col, row). */
export const fineToSource = (row: number, col: number): [number, number] => [
  col / TERRAIN_SUBDIV,
  row / TERRAIN_SUBDIV,
];

/** Hypsometric tint stops (metres → RGB): green lowlands, yellow mid, brown
 *  highlands. Linear between stops; the classic atlas ramp. */
const HYPSO: readonly (readonly [number, readonly [number, number, number]])[] =
  [
    [150, [0.24, 0.44, 0.20]], // deep green — lowlands
    [350, [0.34, 0.52, 0.20]], // green
    [550, [0.56, 0.60, 0.22]], // yellow-green
    [750, [0.74, 0.66, 0.28]], // yellow
    [950, [0.60, 0.48, 0.24]], // brown
    [1250, [0.46, 0.35, 0.22]], // dark brown — summits
  ];

const rampColor = (alt: number): [number, number, number] => {
  if (alt <= HYPSO[0][0]) return [...HYPSO[0][1]];
  for (let i = 1; i < HYPSO.length; i++) {
    const [a1, c1] = HYPSO[i];
    if (alt <= a1) {
      const [a0, c0] = HYPSO[i - 1];
      const u = (alt - a0) / (a1 - a0);
      return [
        c0[0] + (c1[0] - c0[0]) * u,
        c0[1] + (c1[1] - c0[1]) * u,
        c0[2] + (c1[2] - c0[2]) * u,
      ];
    }
  }
  return [...HYPSO[HYPSO.length - 1][1]];
};

export const elevColor = (alt: number, forestPct: number): THREE.Color => {
  let [r, g, b] = rampColor(alt);
  // Dense canopy darkens and cools the tint toward forest green.
  const f = Math.max(0, Math.min(1, (forestPct - 35) / 50));
  if (f > 0) {
    r = r * (1 - 0.55 * f) + 0.05 * f;
    g = g * (1 - 0.25 * f) + 0.24 * f;
    b = b * (1 - 0.55 * f) + 0.09 * f;
  }
  return new THREE.Color(r, g, b);
};
