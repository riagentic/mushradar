// Shared test data: a synthetic weather station on a real date axis.
import type { Station } from "../src/model/weather.ts";
import { addDays, todayIso } from "../src/model/time.ts";

/** A station whose series starts `past` days before today and runs `len` days. */
export const station = (
  id: string,
  lat: number,
  lon: number,
  { past = 20, len = 35, tmean = 14, rain = 4, soil = 0.28 } = {},
): Station => {
  const first = addDays(todayIso(), -past);
  const fill = (v: number) => Array.from({ length: len }, () => v);
  return {
    id,
    name: id,
    lat,
    lon,
    elev: 400,
    current: {
      time: "",
      temp: tmean,
      feels: tmean,
      rh: 80,
      wind: 5,
      code: 3,
      isDay: true,
    },
    daily: {
      time: Array.from({ length: len }, (_, i) => addDays(first, i)),
      tmax: fill(tmean + 5),
      tmin: fill(tmean - 5),
      tmean: fill(tmean),
      rain: fill(rain),
      wind: fill(5),
      rh: fill(80),
      soil: fill(soil),
      code: fill(3),
    },
  };
};
