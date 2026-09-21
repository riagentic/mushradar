// The mushroom model — pure. score = habitat × season × temp × moisture ×
// air × night × frost × wind, each 0..1, from the understorey daily series at
// one grid cell (station blend → elevation → terrain + canopy, see terrain.ts).
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
  air: number;
  night: number;
  frost: number;
  wind: number;
};

export type Score = {
  score: number;
  factors: Factors;
  /** 1 today, shrinking with forecast distance */
  confidence: number;
};

export type Habitat = {
  mix: ForestMix;
  forestness: number;
  alt: number;
  /** wettest topsoil reading here lately (m³/m³), see soilCapacity */
  soilCap?: number;
};

/** Loam topsoil at field capacity — what species' `soil` ranges assume. */
export const FIELD_CAP = 0.32;

/** How wet this ground gets: the wettest observed reading (never forecast),
 *  floored so a long drought doesn't make dry soil look "full". Sand holds
 *  ~0.2, loam ~0.32 — judging both on one absolute scale calls sand dry. */
export const soilCapacity = (soil: readonly number[], today: number): number =>
  Math.max(0.18, ...soil.slice(0, Math.max(0, today + 1)));

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

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** Rain the canopy catches per day and re-evaporates (mm): ~0.5 in the open,
 *  ~2 under closed spruce. Drizzle below it never reaches the soil. */
export const interception = (canopy: number): number => 0.5 + 1.5 * canopy;

/** Fungal growth speeds up ~2× per 10 °C (Q10 ≈ 2). */
const Q10 = 2;

/** Growth speed on a day at `tmean`, in days-at-the-reference-temperature per
 *  day: 1 at the middle of the species' optimum, ½ ten degrees below it. */
export const growthRate = (sp: Species, tmean: number): number =>
  clamp(Q10 ** ((tmean - (sp.temp[1] + sp.temp[2]) / 2) / 10), 0.35, 1.6);

/** Rain days that feed the flush at day `t`, each with its weight 0..1 and
 *  effective rain (mm, minus interception `cut`). A rain's age is growth time
 *  since it fell, not calendar days, so a cold spell delays the flush and a
 *  warm one brings it forward; `lag` holds at the reference temperature.
 *  Window edges ramp over one growth-day. */
export const rainWindow = (
  sp: Species,
  d: Daily,
  t: number,
  cut: number,
): { k: number; w: number; mm: number }[] => {
  const [lo, hi] = sp.lag;
  const out: { k: number; w: number; mm: number }[] = [];
  let age = 0;
  for (let k = t - 1; k >= 0 && age <= hi + 1; k--) {
    age += growthRate(sp, d.tmean[k + 1] ?? 0);
    const w = clamp(age - lo + 1, 0, 1) * clamp(hi + 1 - age, 0, 1);
    if (w > 0) out.push({ k, w, mm: Math.max(0, (d.rain[k] ?? 0) - cut) });
  }
  return out;
};

/** Days a hard frost keeps suppressing new caps: full for 3, gone after 7. */
const FROST_MEMORY = 7;

/** Everything that depends on the (understorey) weather series at day `t`. */
export const weatherFactors = (
  sp: Species,
  d: Daily,
  t: number,
  canopy = 0,
  soilCap = FIELD_CAP,
): Pick<Factors, "temp" | "moist" | "air" | "night" | "frost" | "wind"> => {
  const [, , , hot] = sp.temp;
  // Warmth over the last 5 days; a scorching day dries caps on top of that.
  const heat = 1 -
    0.6 * smoothstep(hot + 2, hot + 8, Math.max(...slice(d.tmax, t - 2, t)));
  const temp = trapezoid(mean(slice(d.tmean, t - 4, t)), sp.temp) * heat;
  // Soaking rain inside the fruiting-lag window triggers the flush.
  const rainLag = sum(
    rainWindow(sp, d, t, interception(canopy)).map((x) => x.w * x.mm),
  );
  const rainF = smoothstep(sp.rainNeed * 0.3, sp.rainNeed, rainLag);
  // Topsoil now, half-corrected for how wet this ground gets: sand reads
  // drier than loam at the same wetness, but a dry region is also truly
  // drier — a full correction would erase that. The model soil already
  // integrates rain and evaporation.
  const soilNow = d.soil[t] ?? 0;
  const rel = Math.sqrt(FIELD_CAP / soilCap);
  const soilF = soilNow > 0
    ? smoothstep(sp.soil[0], sp.soil[1], soilNow * rel)
    : rainF;
  const moist = 0.55 * rainF + 0.45 * soilF;
  // Dry air shrivels young caps.
  const air = 0.5 + 0.5 * smoothstep(50, 75, mean(slice(d.rh, t - 2, t)));
  // Cold nights slow fruiting even when the daily mean looks fine.
  const night = 0.2 +
    0.8 * smoothstep(sp.night - 8, sp.night, mean(slice(d.tmin, t - 2, t)));
  // A hard frost kills the flush: 0.1 at the limit, 1 from 3 °C above it,
  // and the damage fades over FROST_MEMORY days.
  const frost = Math.min(
    1,
    ...slice(d.tmin, t - FROST_MEMORY + 1, t).map((v, k, xs) => {
      const age = xs.length - 1 - k;
      const hit = 0.9 * (1 - smoothstep(sp.frost, sp.frost + 3, v));
      return 1 - hit * clamp((FROST_MEMORY - 1 - age) / 4, 0, 1);
    }),
  );
  // Wind always dries the floor and the caps — a breeze a little, a gale a lot.
  const wind = 1 - 0.6 * smoothstep(3, 30, mean(slice(d.wind, t - 2, t)));
  return { temp, moist, air, night, frost, wind };
};

/** How far to trust a score: forecast lead time, weighted by how much of the
 *  triggering rain is still only forecast (rain that fell is certain). */
export const confidence = (
  sp: Species,
  d: Daily,
  t: number,
  dayOffset: number,
): number => {
  const today = t - dayOffset;
  const win = rainWindow(sp, d, t, 0);
  const total = sum(win.map((x) => x.w * x.mm));
  const ahead = sum(win.filter((x) => x.k > today).map((x) => x.w * x.mm));
  const share = total > 0 ? ahead / total : Math.min(1, dayOffset / sp.lag[0]);
  return clamp(1 - dayOffset * (0.02 + 0.04 * share), 0.3, 1);
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
  // Canopy over the spot itself: parasols fruit in clearings, not under it.
  const w = weatherFactors(sp, d, t, h.forestness * sp.cover, h.soilCap);
  const factors: Factors = { habitat, season, ...w };
  const score = clamp(
    Object.values(factors).reduce((a, b) => a * b, 1),
    0,
    1,
  );
  return { score, factors, confidence: confidence(sp, d, t, dayOffset) };
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
