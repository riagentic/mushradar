// The mushroom model — pure. score = habitat × season × temp × moisture ×
// frost × wind, each 0..1, from a blended daily series at one grid cell.
import type { Species } from "../data/species.ts";
import type { Daily } from "./weather.ts";
import type { ForestMix } from "./forest.ts";
import { clamp, mean, smoothstep, trapezoid } from "./math.ts";
import { dayOfYear } from "./time.ts";

export type Factors = {
  habitat: number;
  season: number;
  temp: number;
  moist: number;
  frost: number;
  wind: number;
};

export type Score = {
  score: number;
  factors: Factors;
  /** 1 today, shrinking with forecast distance */
  confidence: number;
};

export type Habitat = { mix: ForestMix; forestness: number; alt: number };

const slice = (xs: readonly number[], from: number, to: number): number[] =>
  xs.slice(Math.max(0, from), Math.max(0, to + 1));

/** Habitat suitability: forest kind affinity × how much forest × altitude. */
export const habitatFactor = (sp: Species, h: Habitat): number => {
  const affinity = h.mix.spruce * sp.forest.spruce +
    h.mix.pine * sp.forest.pine +
    h.mix.beech * sp.forest.beech +
    h.mix.oak * sp.forest.oak;
  const [a0, a1] = sp.alt;
  const altF = smoothstep(a0 - 150, a0, h.alt) *
    (1 - smoothstep(a1, a1 + 150, h.alt));
  return clamp(affinity * h.forestness * altF, 0, 1);
};

export const seasonFactor = (sp: Species, iso: string): number => {
  const doy = dayOfYear(iso);
  const [s0, s1] = sp.season;
  return smoothstep(s0 - 15, s0, doy) * (1 - smoothstep(s1, s1 + 15, doy));
};

/** Everything that depends on the weather series, for day index `t`. */
export const weatherFactors = (
  sp: Species,
  d: Daily,
  t: number,
): Pick<Factors, "temp" | "moist" | "frost" | "wind"> => {
  const temp = trapezoid(mean(slice(d.tmean, t - 4, t)), sp.temp);
  const rainLag = slice(d.rain, t - sp.lag[1], t - sp.lag[0]).reduce(
    (a, b) => a + b,
    0,
  );
  const rainF = smoothstep(sp.rainNeed * 0.3, sp.rainNeed, rainLag);
  const soilNow = d.soil[t] ?? 0;
  const soilF = soilNow > 0
    ? smoothstep(sp.soil[0], sp.soil[1], soilNow)
    : rainF;
  const moist = 0.55 * rainF + 0.45 * soilF;
  const coldest = Math.min(...slice(d.tmin, t - 2, t));
  const frost = coldest < sp.frost ? 0.1 : coldest < sp.frost + 3 ? 0.55 : 1;
  const windAvg = mean(slice(d.wind, t - 2, t));
  const wind = 1 - 0.7 * smoothstep(18, 40, windAvg);
  return { temp, moist, frost, wind };
};

export const predict = (
  sp: Species,
  h: Habitat,
  d: Daily,
  t: number,
  dayOffset: number,
): Score => {
  const habitat = habitatFactor(sp, h);
  const season = seasonFactor(sp, d.time[t] ?? d.time[d.time.length - 1]);
  const w = weatherFactors(sp, d, t);
  const factors: Factors = { habitat, season, ...w };
  const score = clamp(
    habitat * season * w.temp * w.moist * w.frost * w.wind,
    0,
    1,
  );
  return { score, factors, confidence: clamp(1 - 0.05 * dayOffset, 0.3, 1) };
};

export type Level = "none" | "low" | "medium" | "high";
export const level = (score: number): Level =>
  score >= 0.55
    ? "high"
    : score >= 0.3
    ? "medium"
    : score >= 0.12
    ? "low"
    : "none";
