// Terrain from the elevation grid — slope, aspect, relative height — plus the
// forest canopy, and the microclimate they imply. Pure. Cells are ~5 km, so
// slopes are regional (median 0.7°, p99 3.3°): aspect reads mountain flanks,
// not single hillsides.
import { ELEVATION, GRID } from "../data/grid.ts";
import { RIVERS } from "../data/rivers.ts";
import { clamp, smoothstep } from "./math.ts";
import type { Daily } from "./weather.ts";

export type Terrain = {
  /** steepness, degrees */
  slope: number;
  /** direction the slope faces, degrees clockwise from north */
  aspect: number;
  /** height above the 8 neighbours' mean (m): < 0 valley, > 0 ridge */
  tpi: number;
};

/** What a forest floor feels that the weather station doesn't. */
export type Micro = {
  /** day-maximum shift (°C): sunny flanks warmer */
  dT: number;
  /** night-minimum shift (°C): cold air pools in valleys */
  dTmin: number;
  /** soil moisture multiplier: sunny flanks and ridges dry faster */
  wet: number;
  /** canopy density 0..1: buffers heat and holds humidity */
  canopy: number;
  /** wind multiplier: canopy shelters, ridges are exposed */
  wind: number;
  /** relative-humidity bonus (%) on a floodplain */
  dRh: number;
};

export const FLAT: Terrain = { slope: 0, aspect: 180, tpi: 0 };
export const NO_MICRO: Micro = {
  dT: 0,
  dTmin: 0,
  wet: 1,
  canopy: 0,
  wind: 1,
  dRh: 0,
};

const DX = (GRID.lon1 - GRID.lon0) / (GRID.cols - 1) * 71_500; // m, ~50° N
const DY = (GRID.lat1 - GRID.lat0) / (GRID.rows - 1) * 111_000; // m
const DEG = 180 / Math.PI;

const elevAt = (c: number, r: number): number =>
  ELEVATION[
    clamp(r, 0, GRID.rows - 1) * GRID.cols + clamp(c, 0, GRID.cols - 1)
  ] ?? 0;

/** Terrain of grid cell `i` (row 0 = south). */
export const terrainAt = (i: number): Terrain => {
  const c = i % GRID.cols;
  const r = Math.floor(i / GRID.cols);
  const gx = (elevAt(c + 1, r) - elevAt(c - 1, r)) / (2 * DX); // rise to east
  const gy = (elevAt(c, r + 1) - elevAt(c, r - 1)) / (2 * DY); // rise to north
  let ring = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr || dc) ring += elevAt(c + dc, r + dr);
    }
  }
  return {
    slope: Math.atan(Math.hypot(gx, gy)) * DEG,
    aspect: (Math.atan2(-gx, -gy) * DEG + 360) % 360, // downhill direction
    tpi: elevAt(c, r) - ring / 8,
  };
};

const KM_LON = 71.5;
const KM_LAT = 111;

/** km from a point to segment a→b, all in lon/lat. */
const segKm = (
  lon: number,
  lat: number,
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
): number => {
  const px = (lon - ax) * KM_LON, py = (lat - ay) * KM_LAT;
  const vx = (bx - ax) * KM_LON, vy = (by - ay) * KM_LAT;
  const u = clamp((px * vx + py * vy) / (vx * vx + vy * vy || 1), 0, 1);
  return Math.hypot(px - u * vx, py - u * vy);
};

/** km to the nearest mapped river course (major rivers only). Reservoirs
 *  and lakes are left out on purpose: dammed shores are steep, their level
 *  is managed, and they raise no floodplain groundwater. */
export const riverKm = (lon: number, lat: number): number => {
  let best = Infinity;
  for (const r of RIVERS) {
    for (let k = 1; k < r.path.length; k++) {
      best = Math.min(best, segKm(lon, lat, r.path[k - 1], r.path[k]));
    }
  }
  return best;
};

/** Floodplain 0..1: next to a river (full ≤ 0.5 km, gone by 2.5 km) AND on a
 *  flat valley floor — hillsides above a river get no groundwater from it. */
export const floodplain = (km: number, t: Terrain): number =>
  (1 - smoothstep(0.5, 2.5, km)) *
  (1 - smoothstep(0.5, 1.5, t.slope)) *
  (1 - smoothstep(-20, 20, t.tpi));

/** −1 (steep north flank) … +1 (steep SSW flank, the warmest at 50° N). */
export const southness = (t: Terrain): number =>
  clamp(t.slope / 3, 0, 1) * Math.cos((t.aspect - 200) / DEG);

export const microclimate = (t: Terrain, canopy = 0, water = 0): Micro => {
  const sun = southness(t);
  return {
    dT: 2 * sun,
    dTmin: clamp(0.008 * t.tpi, -1.5, 0.8),
    // canopy shade slows topsoil drying
    wet: clamp(
      1 - 0.1 * sun - 0.0005 * t.tpi + 0.05 * canopy + 0.06 * water,
      0.85,
      1.3,
    ),
    canopy: clamp(canopy, 0, 1),
    // A closed stand keeps ~60 % of the 10 m wind off the forest floor.
    wind: (1 - 0.6 * clamp(canopy, 0, 1)) * clamp(1 + t.tpi / 300, 0.7, 1.4),
    dRh: 2 * clamp(water, 0, 1),
  };
};

/** Understorey temperatures for one day. A closed canopy insulates (De Frenne
 *  et al. 2019, Nat. Ecol. Evol.): it pulls both extremes toward the middle —
 *  maxima up to 3 °C cooler on hot days, minima 0.5 °C warmer on mild nights
 *  up to 1.5 °C on frosty ones. The mean moves by half of each. */
export const understorey = (
  m: Micro,
  tmax: number,
  tmin: number,
  tmean: number,
): { tmax: number; tmin: number; tmean: number } => {
  const day = m.dT - m.canopy * clamp((tmax - 15) / 5, 0, 3);
  const night = m.dTmin + m.canopy * clamp((10 - tmin) / 10, 0.5, 1.5);
  const hi = tmax + day;
  return {
    tmax: hi,
    tmin: Math.min(hi, tmin + night),
    tmean: tmean + (day + night) / 2,
  };
};

/** A forest is always moister than open land, most on dry days: canopy
 *  adds +12 % RH at 60 %, +6 % at 80 %, +2 % near saturation; a floodplain
 *  adds up to +2 % more (≤ 100). */
export const understoreyRh = (m: Micro, rh: number): number =>
  Math.min(
    100,
    rh + m.dRh + m.canopy * (2 + clamp(0.33 * (90 - rh), 0, 10)),
  );

/** A station-blended series as the forest floor at one cell feels it. */
export const localize = (d: Daily, m: Micro): Daily => {
  const u = d.time.map((_, k) =>
    understorey(m, d.tmax[k] ?? 0, d.tmin[k] ?? 0, d.tmean[k] ?? 0)
  );
  return {
    ...d,
    tmax: u.map((x) => x.tmax),
    tmin: u.map((x) => x.tmin),
    tmean: u.map((x) => x.tmean),
    rh: d.rh.map((v) => understoreyRh(m, v)),
    wind: d.wind.map((v) => v * m.wind),
    soil: d.soil.map((v) => v * m.wet), // 0 stays 0: "no reading"
  };
};

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Compass = (typeof COMPASS)[number];
/** Compass label, or null on flat ground where aspect means nothing. */
export const compass = (t: Terrain): Compass | null =>
  t.slope < 0.5 ? null : COMPASS[Math.round(t.aspect / 45) % 8];
