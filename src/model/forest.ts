// Forest model — what kind of wood stands on a grid cell.
// Czech forestry in one line: spruce ~50 %, pine ~16 %, beech ~9 %, oak ~7 %;
// spruce climbs with altitude, oak stays low, pine owns the sandy basins.
import type { ForestKind } from "../data/species.ts";
import { clamp, smoothstep } from "./math.ts";

export type ForestMix = Record<ForestKind, number>;

/** Sandy lowland pine regions: [lon0, lon1, lat0, lat1]. */
const PINE_SANDS: readonly (readonly [number, number, number, number])[] = [
  [14.55, 15.15, 48.85, 49.2], // Třeboňsko
  [14.45, 14.95, 50.45, 50.7], // Ralsko / Doksy / Máchovo jezero
  [17.05, 17.45, 48.8, 49.05], // Bzenec / Hodonín sands
  [14.9, 15.55, 50.05, 50.35], // Polabí sands (Nymbursko)
  [12.9, 13.35, 49.9, 50.15], // Plzeňská pahorkatina pine
];

const inRect = (lon: number, lat: number) =>
  PINE_SANDS.some(([a, b, c, d]) =>
    lon >= a && lon <= b && lat >= c && lat <= d
  );

/** Tree cover % (Global Forest Watch, rendered) → 0..1 "this is real forest".
 *  The tile rendering over-represents scattered trees, so the curve is steep. */
export const forestness = (coverPct: number): number =>
  smoothstep(45, 85, coverPct);

/** Species mix on a cell, weights sum to 1. Pure. */
export const forestMix = (lon: number, lat: number, alt: number): ForestMix => {
  const hi = smoothstep(500, 950, alt); // montane share
  const lo = 1 - smoothstep(250, 600, alt); // lowland share
  const mid = clamp(1 - hi - lo, 0, 1);
  const sands = inRect(lon, lat) ? 1 : 0;
  const raw: ForestMix = {
    spruce: 0.25 * lo + 0.55 * mid + 0.85 * hi,
    pine: 0.3 * lo + 0.15 * mid + 0.03 * hi + 0.9 * sands,
    beech: 0.1 * lo + 0.2 * mid + 0.12 * hi,
    oak: 0.35 * lo + 0.1 * mid,
  };
  const sum = raw.spruce + raw.pine + raw.beech + raw.oak;
  return {
    spruce: raw.spruce / sum,
    pine: raw.pine / sum,
    beech: raw.beech / sum,
    oak: raw.oak / sum,
  };
};

export const dominantForest = (mix: ForestMix): ForestKind =>
  (Object.keys(mix) as ForestKind[]).reduce((a, b) => mix[a] >= mix[b] ? a : b);

export const FOREST_LABEL: Record<ForestKind, string> = {
  spruce: "spruce",
  pine: "pine",
  beech: "beech",
  oak: "oak",
};
