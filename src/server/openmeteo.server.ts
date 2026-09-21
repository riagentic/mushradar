// Server-only: Open-Meteo forecast API → Station[] (PAST_DAYS back + today + 14 ahead).
import type { Current, Daily, Station } from "../model/weather.ts";
import { MAX_DAY_OFFSET } from "../model/time.ts";

export type Point = { id: string; name: string; lat: number; lon: number };

/** History the model reads: the longest rain lag (16 growth-days) stretches
 *  to ~28 calendar days in cool weather (growthRate ≈ 0.57 at 8 °C below). */
export const PAST_DAYS = 30;
/** Today + every offset the day picker can reach. */
export const FORECAST_DAYS = MAX_DAY_OFFSET + 1;

// The free tier is 10 000 calls/day, and one location costs
// (variables / 10) × (days / 14) calls. Every variable here is read by the UI
// or the model — add one only with its cost in mind.
const DAILY = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "temperature_2m_mean",
  "precipitation_sum",
  "wind_speed_10m_mean",
  "relative_humidity_2m_mean",
  "soil_moisture_0_to_10cm_mean",
].join(",");

const CURRENT = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "wind_speed_10m",
  "weather_code",
  "is_day",
].join(",");

type Series = (number | null)[] | string[];

type Raw = {
  latitude: number;
  longitude: number;
  elevation: number;
  current?: Record<string, number | string>;
  daily?: Record<string, Series>;
  error?: boolean;
  reason?: string;
};

/** Gaps → 0: right for sums (rain) and the soil "no reading" sentinel. */
const zeroed = (xs: Series | undefined): number[] =>
  ((xs ?? []) as readonly unknown[]).map((v) => typeof v === "number" ? v : 0);

/** Gaps → the nearest earlier reading (the first one for leading gaps):
 *  a missing day must not read as 0 °C, which the model treats as frost. */
const carried = (xs: Series | undefined): number[] => {
  const vs = (xs ?? []) as readonly unknown[];
  let last = vs.find((v): v is number => typeof v === "number") ?? 0;
  return vs.map((v) => typeof v === "number" ? (last = v) : last);
};

/** Raw API record → the app's Station shape. Pure; exported for tests. */
export const toStation = (p: Point, r: Raw): Station => {
  const d = r.daily;
  const c = r.current;
  const daily: Daily | null = d
    ? {
      time: (d.time as string[]) ?? [],
      tmax: carried(d.temperature_2m_max),
      tmin: carried(d.temperature_2m_min),
      tmean: carried(d.temperature_2m_mean),
      rain: zeroed(d.precipitation_sum),
      wind: carried(d.wind_speed_10m_mean),
      rh: carried(d.relative_humidity_2m_mean),
      soil: zeroed(d.soil_moisture_0_to_10cm_mean),
      code: carried(d.weather_code),
    }
    : null;
  const current: Current | null = c
    ? {
      time: String(c.time ?? ""),
      temp: Number(c.temperature_2m ?? 0),
      feels: Number(c.apparent_temperature ?? 0),
      rh: Number(c.relative_humidity_2m ?? 0),
      wind: Number(c.wind_speed_10m ?? 0),
      code: Number(c.weather_code ?? 0),
      isDay: Number(c.is_day ?? 1) === 1,
    }
    : null;
  return {
    id: p.id,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    elev: Number(r.elevation ?? 0),
    current,
    daily,
  };
};

export const buildUrl = (pts: readonly Point[]): string =>
  "https://api.open-meteo.com/v1/forecast" +
  `?latitude=${pts.map((p) => p.lat.toFixed(4)).join(",")}` +
  `&longitude=${pts.map((p) => p.lon.toFixed(4)).join(",")}` +
  `&daily=${DAILY}&current=${CURRENT}` +
  `&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}` +
  "&timezone=Europe%2FPrague";

/** Fetch every point, 12 per request. All or nothing: one failed chunk throws. */
export const fetchStations = async (
  pts: readonly Point[],
  signal?: AbortSignal,
): Promise<Station[]> => {
  const out: Station[] = [];
  for (let k = 0; k < pts.length; k += 12) {
    const chunk = pts.slice(k, k + 12);
    const res = await fetch(buildUrl(chunk), { signal });
    const body = await res.json().catch(() => null) as Raw | Raw[] | null;
    if (!body || (!Array.isArray(body) && body.error) || !res.ok) {
      const why = body && !Array.isArray(body) ? body.reason : undefined;
      throw new Error(`open-meteo: ${why ?? `HTTP ${res.status}`}`);
    }
    const rows = Array.isArray(body) ? body : [body];
    if (rows.length !== chunk.length) {
      throw new Error(
        `open-meteo: ${rows.length} rows for ${chunk.length} points`,
      );
    }
    rows.forEach((r, i) => out.push(toStation(chunk[i], r)));
  }
  return out;
};
