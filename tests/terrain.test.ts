import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  compass,
  FLAT,
  floodplain,
  localize,
  microclimate,
  NO_MICRO,
  riverKm,
  southness,
  terrainAt,
  understorey,
  understoreyRh,
} from "../src/model/terrain.ts";
import { RIVERS } from "../src/data/rivers.ts";
import { orographic } from "../src/model/weather.ts";
import {
  confidence,
  FIELD_CAP,
  growthRate,
  rainWindow,
  soilCapacity,
  weatherFactors,
} from "../src/model/predict.ts";
import { SPECIES } from "../src/data/species.ts";
import { ELEVATION, GRID } from "../src/data/grid.ts";
import { station } from "./fixtures.ts";

const porcini = SPECIES.find((s) => s.id === "hrib-smrkovy")!;
const forest = microclimate(FLAT, 1);

Deno.test("terrain: every cell has a sane slope, aspect and relative height", () => {
  for (let i = 0; i < GRID.cols * GRID.rows; i++) {
    const t = terrainAt(i);
    assert(t.slope >= 0 && t.slope < 15, `slope ${t.slope} at ${i}`);
    assert(t.aspect >= 0 && t.aspect < 360, `aspect ${t.aspect} at ${i}`);
    assert(Number.isFinite(t.tpi));
  }
  // The highest cell is a summit: above its neighbours.
  const top = ELEVATION.indexOf(Math.max(...ELEVATION));
  assert(terrainAt(top).tpi > 0);
});

Deno.test("terrain: aspect points downhill, south flanks are sunny", () => {
  const s = { slope: 3, aspect: 200, tpi: 0 };
  const n = { slope: 3, aspect: 20, tpi: 0 };
  assertAlmostEquals(southness(s), 1);
  assertAlmostEquals(southness(n), -1);
  assertEquals(southness(FLAT), 0);
  assert(microclimate(s).dT > 0 && microclimate(n).dT < 0);
  assert(microclimate(s).wet < 1 && microclimate(n).wet > 1);
  assertEquals(compass(s), "S");
  assertEquals(compass(FLAT), null);
});

Deno.test("terrain: cold air pools in valleys, ridges stay milder at night", () => {
  const valley = microclimate({ ...FLAT, tpi: -150 });
  const ridge = microclimate({ ...FLAT, tpi: 80 });
  assert(valley.dTmin < -1 && ridge.dTmin > 0);
  assert(valley.wet > 1 && ridge.wet < 1);
});

Deno.test("canopy insulates: hot days cooler, cold nights warmer", () => {
  const hot = understorey(forest, 30, 15, 22);
  assertEquals(hot.tmax, 27);
  assertEquals(hot.tmin, 15.5);
  const frosty = understorey(forest, 5, -5, 0);
  assertEquals(frosty.tmax, 5);
  assertEquals(frosty.tmin, -3.5);
  // Open ground is untouched.
  assertEquals(understorey(NO_MICRO, 30, 15, 22), {
    tmax: 30,
    tmin: 15,
    tmean: 22,
  });
});

Deno.test("canopy always adds humidity, most on dry days, never past 100 %", () => {
  const gain = (rh: number) => understoreyRh(forest, rh) - rh;
  assert(gain(60) > gain(80) && gain(80) > gain(95) && gain(95) > 0);
  assertEquals(understoreyRh(forest, 99.5), 100);
  assertEquals(understoreyRh(NO_MICRO, 60), 60);
});

Deno.test("localize keeps the soil 'no reading' sentinel", () => {
  const d = { ...station("x", 50, 15).daily!, soil: [0, 0.2] };
  assertEquals(localize(d, forest).soil[0], 0);
  assert(localize(d, forest).soil[1] > 0.2);
});

Deno.test("orographic rain grows with height above the station, bounded", () => {
  assertEquals(orographic(0), 1);
  assertAlmostEquals(orographic(500), 1.3);
  assertEquals(orographic(5000), 1.8);
  assertEquals(orographic(-5000), 0.6);
});

Deno.test("a hard frost keeps hurting for days, then fades", () => {
  const d = station("x", 50, 15).daily!;
  const after = (days: number) =>
    weatherFactors(porcini, {
      ...d,
      tmin: d.tmin.map((v, i) => i === 20 - days ? -8 : v),
    }, 20).frost;
  assertAlmostEquals(after(0), 0.1);
  assertAlmostEquals(after(2), 0.1);
  assert(after(3) > after(2) && after(5) > after(3));
  assertEquals(after(7), 1);
});

Deno.test("drizzle under a canopy never reaches the soil", () => {
  const d = { ...station("x", 50, 15).daily!, soil: [] as number[] };
  const drizzle = { ...d, rain: d.rain.map(() => 1.5) };
  assert(weatherFactors(porcini, drizzle, 20, 0).moist > 0);
  assertEquals(weatherFactors(porcini, drizzle, 20, 1).moist, 0);
});

Deno.test("scorching days and dry air cut the score", () => {
  const d = station("x", 50, 15).daily!;
  const base = weatherFactors(porcini, d, 20);
  const hot = weatherFactors(porcini, { ...d, tmax: d.tmax.map(() => 36) }, 20);
  const dry = weatherFactors(porcini, { ...d, rh: d.rh.map(() => 45) }, 20);
  assert(hot.temp < base.temp);
  assertEquals(dry.air, 0.5);
  assertEquals(base.air, 1);
});

Deno.test("confidence: rain that already fell is trusted, forecast rain less", () => {
  const d = station("x", 50, 15).daily!;
  // Day +5 at index 25: porcini's lag window 11..19 is all in the past.
  const fell = confidence(porcini, d, 25, 5);
  // Day +12 at index 32: window 18..26, mostly forecast.
  const later = confidence(porcini, d, 32, 12);
  assertAlmostEquals(fell, 0.9);
  assert(later < fell && later >= 0.3);
  assertEquals(confidence(porcini, d, 20, 0), 1);
});

Deno.test("wind always dries: canopy shelters, ridges are exposed", () => {
  const d = station("x", 50, 15).daily!;
  const at = (w: number) =>
    weatherFactors(porcini, { ...d, wind: d.wind.map(() => w) }, 20).wind;
  assert(at(10) < at(5) && at(20) < at(10) && at(40) < at(20));
  assertEquals(at(0), 1);
  assert(microclimate(FLAT, 1).wind < microclimate(FLAT, 0).wind);
  assert(
    microclimate({ ...FLAT, tpi: 100 }).wind >
      microclimate({ ...FLAT, tpi: -100 }).wind,
  );
});

Deno.test("growth time: lag holds at the optimum, cold slows it, heat speeds it", () => {
  const ref = (porcini.temp[1] + porcini.temp[2]) / 2;
  assertAlmostEquals(growthRate(porcini, ref), 1);
  assertAlmostEquals(growthRate(porcini, ref - 10), 0.5);
  assert(growthRate(porcini, ref + 5) > 1);
  // One rain day, 8 calendar days back, porcini lag 6..14.
  const d = station("x", 50, 15, { rain: 0, tmean: ref }).daily!;
  const rain = { ...d, rain: d.rain.map((_, i) => i === 12 ? 30 : 0) };
  const hit = (tm: number, t: number) =>
    rainWindow(porcini, { ...rain, tmean: rain.tmean.map(() => tm) }, t, 0)
      .find((x) => x.k === 12)?.w ?? 0;
  // At the reference temperature the window is exactly lag days.
  assertEquals(hit(ref, 12 + 5), 0);
  assertEquals(hit(ref, 12 + 6), 1);
  assertEquals(hit(ref, 12 + 14), 1);
  // Cold: 6 calendar days is not yet enough growth.
  assertEquals(hit(ref - 10, 12 + 6), 0);
  // Warm: the flush arrives earlier.
  assert(hit(ref + 8, 12 + 4) > 0);
});

Deno.test("parasols fruit in the open: less rain lost to the canopy", () => {
  const bedla = SPECIES.find((s) => s.id === "bedla")!;
  assert(bedla.cover < 0.5);
  assert(SPECIES.every((s) => s.cover > 0 && s.cover <= 1));
});

Deno.test("floodplain: only flat valley floors right next to a river", () => {
  const morava = RIVERS.find((r) => r.id === "morava")!;
  const [lon, lat] = morava.path[Math.floor(morava.path.length / 2)];
  assertAlmostEquals(riverKm(lon, lat), 0);
  const floor = { slope: 0.2, aspect: 180, tpi: -40 };
  assertEquals(floodplain(0, floor), 1);
  assertEquals(floodplain(3, floor), 0);
  assertEquals(floodplain(0, { ...floor, slope: 2 }), 0, "a hillside");
  assertEquals(floodplain(0, { ...floor, tpi: 40 }), 0, "a ridge");
  const wet = microclimate(FLAT, 0, 1), dry = microclimate(FLAT, 0, 0);
  assertAlmostEquals(wet.wet - dry.wet, 0.06);
  assertEquals(understoreyRh(wet, 60), 62);
  assertEquals(understoreyRh(dry, 60), 60);
});

Deno.test("soil is judged against how wet this ground gets, not one scale", () => {
  const bedla = SPECIES.find((s) => s.id === "bedla")!;
  const d = { ...station("x", 50, 15).daily!, soil: [] as number[] };
  const at = (soil: number, cap: number) =>
    weatherFactors(
      bedla,
      { ...d, soil: d.soil.concat(d.time.map(() => soil)) },
      20,
      0,
      cap,
    ).moist;
  // Sand gets half the texture correction: wetter than on the loam scale,
  // but a dry region is not rewritten as a wet one.
  const sand = at(0.17, 0.2);
  assert(sand > at(0.17, FIELD_CAP));
  assert(sand < at(0.272, FIELD_CAP));
  assertAlmostEquals(sand, at(0.17 * Math.sqrt(FIELD_CAP / 0.2), FIELD_CAP));
  // Capacity: wettest observed reading, never a forecast, floored for droughts.
  assertEquals(soilCapacity([0.1, 0.25, 0.2, 0.4], 2), 0.25);
  assertEquals(soilCapacity([0.05, 0.06], 1), 0.18);
});
