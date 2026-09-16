// Weather types + pure interpolation from stations to any point.
import { GRID } from "../data/grid.ts";

export type Daily = {
  time: string[];
  tmax: number[];
  tmin: number[];
  tmean: number[];
  rain: number[];
  wind: number[];
  rh: number[];
  soil: number[];
  code: number[];
};

export type Current = {
  time: string;
  temp: number;
  feels: number;
  rh: number;
  wind: number;
  code: number;
  isDay: boolean;
};

export type Station = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elev: number;
  current: Current | null;
  daily: Daily | null;
};

export type Weight = { i: number; w: number };

const KM_PER_LAT = 111;
const KM_PER_LON = 71.5; // at ~50° N

export const distKm = (
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number => Math.hypot((lon1 - lon2) * KM_PER_LON, (lat1 - lat2) * KM_PER_LAT);

/** Inverse-distance weights of the `k` nearest stations that have data. */
export const nearestWeights = (
  stations: readonly Station[],
  lon: number,
  lat: number,
  k = 3,
): Weight[] => {
  const ds = stations
    .map((s, i) => ({
      i,
      d: s.daily ? distKm(lon, lat, s.lon, s.lat) : Infinity,
    }))
    .filter((x) => x.d !== Infinity)
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
  if (ds.length === 0) return [];
  if (ds[0].d < 0.5) return [{ i: ds[0].i, w: 1 }];
  const inv = ds.map((x) => ({ i: x.i, w: 1 / (x.d * x.d) }));
  const sum = inv.reduce((a, b) => a + b.w, 0);
  return inv.map((x) => ({ i: x.i, w: x.w / sum }));
};

const LAPSE = 0.0065; // °C per metre

/** Blend station series into one series at `alt` metres. Temperatures get a
 *  lapse-rate correction; rain, wind, soil are weighted averages. */
export const blendSeries = (
  stations: readonly Station[],
  weights: readonly Weight[],
  alt: number,
): Daily | null => {
  const first = weights[0] && stations[weights[0].i].daily;
  if (!first) return null;
  const n = first.time.length;
  const z = (): number[] => new Array(n).fill(0);
  const out: Daily = {
    time: first.time.slice(),
    tmax: z(),
    tmin: z(),
    tmean: z(),
    rain: z(),
    wind: z(),
    rh: z(),
    soil: z(),
    code: z(),
  };
  let codeW = -1;
  for (const { i, w } of weights) {
    const st = stations[i];
    const d = st.daily;
    if (!d) continue;
    const dt = -LAPSE * (alt - st.elev);
    if (w > codeW) {
      codeW = w;
      out.code = d.code.slice(0, n);
    }
    for (let t = 0; t < n; t++) {
      out.tmax[t] += w * ((d.tmax[t] ?? 0) + dt);
      out.tmin[t] += w * ((d.tmin[t] ?? 0) + dt);
      out.tmean[t] += w * ((d.tmean[t] ?? 0) + dt);
      out.rain[t] += w * (d.rain[t] ?? 0);
      out.wind[t] += w * (d.wind[t] ?? 0);
      out.rh[t] += w * (d.rh[t] ?? 0);
      out.soil[t] += w * (d.soil[t] ?? 0);
    }
  }
  return out;
};

/** Grid helpers — index ↔ lon/lat. */
export const cellLon = (i: number): number =>
  GRID.lon0 + (GRID.lon1 - GRID.lon0) * (i % GRID.cols) / (GRID.cols - 1);
export const cellLat = (i: number): number =>
  GRID.lat0 +
  (GRID.lat1 - GRID.lat0) * Math.floor(i / GRID.cols) / (GRID.rows - 1);

/** Language-neutral weather class for a WMO code (see i18n `wmo` map). */
export type WmoKey =
  | "clear"
  | "partlyCloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "showers"
  | "snowShowers"
  | "thunder";

export const wmoKey = (code: number): WmoKey =>
  code === 0
    ? "clear"
    : code <= 2
    ? "partlyCloudy"
    : code === 3
    ? "overcast"
    : code <= 49
    ? "fog"
    : code <= 57
    ? "drizzle"
    : code <= 67
    ? "rain"
    : code <= 77
    ? "snow"
    : code <= 82
    ? "showers"
    : code <= 86
    ? "snowShowers"
    : "thunder";

export const WMO_ICON = (code: number, isDay = true): string =>
  code === 0
    ? (isDay ? "☀️" : "🌙")
    : code <= 2
    ? "⛅"
    : code === 3
    ? "☁️"
    : code <= 49
    ? "🌫️"
    : code <= 67
    ? "🌧️"
    : code <= 77
    ? "🌨️"
    : code <= 82
    ? "🌦️"
    : code <= 86
    ? "🌨️"
    : "⛈️";
