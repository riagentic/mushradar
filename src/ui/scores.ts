// Derive mushroom hotspots for one forecast day from cells + grid + model.
import { SPECIES, type Species } from "../data/species.ts";
import { CZ_MASK, ELEVATION, FOREST, GRID } from "../data/grid.ts";
import { forestMix, forestness } from "../model/forest.ts";
import {
  blendSeries,
  cellLat,
  cellLon,
  nearestWeights,
  type Station,
} from "../model/weather.ts";
import {
  type Level,
  level,
  predict,
  type Score,
  soilCapacity,
} from "../model/predict.ts";
import {
  floodplain,
  localize,
  microclimate,
  riverKm,
  type Terrain,
  terrainAt,
} from "../model/terrain.ts";
import { addDays, daysBetween, todayIso } from "../model/time.ts";
import { hash01 } from "../model/math.ts";

export type Hotspot = {
  index: number;
  lon: number;
  lat: number;
  alt: number;
  terrain: Terrain;
  species: Species;
  score: Score;
  lvl: Level;
};

/** Cells whose canopy is too thin to host any species. */
const MIN_FORESTNESS = 0.25;

/** Index in a daily series for `dayOffset` days after `today`, by DATE.
 *  Stored data can be days old, so the position of "today" is computed from
 *  the series' first date, never assumed. The result may fall outside the
 *  series (data too old or too short) — callers bounds-check it. */
export const seriesIndexForDay = (
  dailyTime: readonly string[],
  dayOffset: number,
  today: string = todayIso(),
): number =>
  dailyTime.length === 0 ? -1 : daysBetween(dailyTime[0], today) + dayOffset;

/** River distance per cell, computed once: it never changes. */
let riverCache: Float32Array | null = null;
const riverKmAt = (i: number): number => {
  if (!riverCache) {
    riverCache = new Float32Array(GRID.cols * GRID.rows);
    for (let j = 0; j < riverCache.length; j++) {
      riverCache[j] = riverKm(cellLon(j), cellLat(j));
    }
  }
  return riverCache[i];
};

/** Every species' score on one grid cell, or null when the cell has no
 *  forest, no weather, or no series entry for the day. */
const scoreCell = (
  stations: readonly Station[],
  i: number,
  dayOffset: number,
  speciesList: readonly Species[],
  today: string,
): Hotspot[] | null => {
  if (!CZ_MASK[i]) return null;
  const fness = forestness(FOREST[i] ?? 0);
  if (fness < MIN_FORESTNESS) return null;
  const lon = cellLon(i);
  const lat = cellLat(i);
  const alt = ELEVATION[i] ?? 300;
  const weights = nearestWeights(stations, lon, lat, 4);
  if (weights.length === 0) return null;
  const blended = blendSeries(stations, weights, alt);
  if (!blended) return null;
  const terrain = terrainAt(i);
  const micro = microclimate(
    terrain,
    fness,
    floodplain(riverKmAt(i), terrain),
  );
  const daily = localize(blended, micro);
  const t = seriesIndexForDay(daily.time, dayOffset, today);
  if (t < 0 || t >= daily.time.length) return null;
  const habitat = {
    mix: forestMix(lon, lat, alt),
    forestness: fness,
    alt,
    // From the station blend: the cell's own wet/dry shift stays visible.
    soilCap: soilCapacity(blended.soil, t - dayOffset),
  };
  return speciesList.map((sp) => {
    const score = predict(sp, habitat, daily, t, dayOffset);
    return {
      index: i,
      lon,
      lat,
      alt,
      terrain,
      species: sp,
      score,
      lvl: level(score.score),
    };
  });
};

export const computeHotspots = (
  stations: readonly Station[],
  dayOffset: number,
  speciesFilter: string,
  opts: { minScore?: number; maxPerSpecies?: number; today?: string } = {},
): Hotspot[] => {
  const minScore = opts.minScore ?? 0.12;
  const maxPerSpecies = opts.maxPerSpecies ?? 36;
  const today = opts.today ?? todayIso();
  const speciesList = speciesFilter
    ? SPECIES.filter((s) => s.id === speciesFilter)
    : SPECIES;
  if (stations.length === 0 || speciesList.length === 0) return [];

  const bySpecies = new Map<string, Hotspot[]>(
    speciesList.map((sp) => [sp.id, []]),
  );
  for (let i = 0; i < GRID.cols * GRID.rows; i++) {
    for (
      const h of scoreCell(stations, i, dayOffset, speciesList, today) ?? []
    ) {
      if (h.score.score >= minScore) bySpecies.get(h.species.id)!.push(h);
    }
  }
  const byScore = (a: Hotspot, b: Hotspot) => b.score.score - a.score.score;
  return [...bySpecies.values()]
    .flatMap((bucket) => bucket.sort(byScore).slice(0, maxPerSpecies))
    .sort(byScore);
};

/** One species on one cell for `dayOffset` — the detail panel's source, so
 *  the numbers follow the day picker instead of freezing at click time. */
export const hotspotAt = (
  stations: readonly Station[],
  dayOffset: number,
  index: number,
  speciesId: string,
  today: string = todayIso(),
): Hotspot | null => {
  const sp = SPECIES.find((s) => s.id === speciesId);
  if (!sp) return null;
  return scoreCell(stations, index, dayOffset, [sp], today)?.[0] ?? null;
};

/** A hotspot with where to draw it (degrees). The score stays the cell's. */
export type Placed = Hotspot & { plotLon: number; plotLat: number };

const CELL_LON = (GRID.lon1 - GRID.lon0) / (GRID.cols - 1);
const CELL_LAT = (GRID.lat1 - GRID.lat0) / (GRID.rows - 1);

/** Offset (in cells) of the `k`-th of `n` markers sharing one cell: alone →
 *  centre; 2–4 → a ring; 5+ → the best in the centre, the rest around it.
 *  The ring's turn comes from the cell, so the layout never jumps. Radius
 *  stays < 0.5 cell so a cluster never reaches its neighbour's. */
export const clusterOffset = (
  n: number,
  k: number,
  seed: number,
): [number, number] => {
  if (n <= 1) return [0, 0];
  const centred = n >= 5;
  if (centred && k === 0) return [0, 0];
  const ring = centred ? n - 1 : n;
  const j = centred ? k - 1 : k;
  const r = centred ? 0.42 : 0.3;
  const a = 2 * Math.PI * (hash01(seed, 7) + j / ring);
  return [r * Math.cos(a), r * Math.sin(a)];
};

/** Spread hotspots that share a cell so their markers don't overlap. Keeps
 *  the input order (callers sort by score). Pure. */
export const placeHotspots = (spots: readonly Hotspot[]): Placed[] => {
  const byCell = new Map<number, Hotspot[]>();
  for (const h of spots) {
    const g = byCell.get(h.index);
    if (g) g.push(h);
    else byCell.set(h.index, [h]);
  }
  return spots.map((h) => {
    const g = byCell.get(h.index)!;
    const best = [...g].sort((a, b) => b.score.score - a.score.score);
    const [dx, dy] = clusterOffset(g.length, best.indexOf(h), h.index);
    return {
      ...h,
      plotLon: h.lon + dx * CELL_LON,
      plotLat: h.lat + dy * CELL_LAT,
    };
  });
};

export const dayIso = (today: string, dayOffset: number): string =>
  addDays(today, dayOffset);
