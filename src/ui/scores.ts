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
import { type Level, level, predict, type Score } from "../model/predict.ts";
import { addDays, daysBetween, todayIso } from "../model/time.ts";

export type Hotspot = {
  index: number;
  lon: number;
  lat: number;
  alt: number;
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
  const daily = blendSeries(stations, weights, alt);
  if (!daily) return null;
  const t = seriesIndexForDay(daily.time, dayOffset, today);
  if (t < 0 || t >= daily.time.length) return null;
  const habitat = { mix: forestMix(lon, lat, alt), forestness: fness, alt };
  return speciesList.map((sp) => {
    const score = predict(sp, habitat, daily, t, dayOffset);
    return {
      index: i,
      lon,
      lat,
      alt,
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

export const dayIso = (today: string, dayOffset: number): string =>
  addDays(today, dayOffset);
