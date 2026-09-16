import { assert, assertEquals } from "@std/assert";
import { level, seasonFactor } from "../src/model/predict.ts";
import { SPECIES } from "../src/data/species.ts";
import { CZ_BORDER, CZ_MASK, GRID } from "../src/data/grid.ts";
import { addDays, todayIso } from "../src/model/time.ts";
import { insideCz, sampleBilinear } from "../src/ui/mapMath.ts";
import {
  computeHotspots,
  hotspotAt,
  seriesIndexForDay,
} from "../src/ui/scores.ts";
import { station } from "./fixtures.ts";
import { RIVERS } from "../src/data/rivers.ts";
import { LAKES } from "../src/data/lakes.ts";

Deno.test("river courses stay inside the Czech border and carry a name", () => {
  assertEquals(RIVERS.length > 10, true);
  for (const r of RIVERS) {
    assertEquals(r.name.length > 0, true);
    assertEquals(r.path.length >= 2, true);
    for (const [lon, lat] of r.path) {
      assertEquals(insideCz(lon, lat), true, `${r.id} at ${lon},${lat}`);
    }
  }
});

Deno.test("lakes sit inside the country with sane shapes", () => {
  assertEquals(LAKES.length > 20, true);
  for (const l of LAKES) {
    assertEquals(l.name.length > 0, true);
    assertEquals(insideCz(l.lon, l.lat), true, `${l.id} centroid`);
    assertEquals(l.lenKm > 0 && l.widKm > 0, true, `${l.id} extents`);
    assertEquals(l.order >= 1 && l.order <= 3, true, `${l.id} order`);
  }
});

Deno.test("predict level thresholds", () => {
  assertEquals(level(0.6), "high");
  assertEquals(level(0.35), "medium");
  assertEquals(level(0.15), "low");
  assertEquals(level(0.05), "none");
});

Deno.test("CZ border polygon agrees with the CZ_MASK grid", () => {
  // The smooth terrain edge is cut from CZ_BORDER, while mushrooms/forest are
  // gated by CZ_MASK. If the two disagree, a marker floats off the map or the
  // map grows foreign land. Measured exactly: every masked cell is inside the
  // polygon and the polygon contains no extra cell.
  let agree = 0;
  let mismatched = 0;
  for (let i = 0; i < GRID.cols * GRID.rows; i++) {
    const lon = GRID.lon0 +
      (GRID.lon1 - GRID.lon0) * (i % GRID.cols) / (GRID.cols - 1);
    const lat = GRID.lat0 +
      (GRID.lat1 - GRID.lat0) * Math.floor(i / GRID.cols) / (GRID.rows - 1);
    if (insideCz(lon, lat) === (CZ_MASK[i] === 1)) agree++;
    else mismatched++;
  }
  assertEquals(agree > 0, true);
  assertEquals(mismatched, 0);
  assertEquals(CZ_BORDER.length > 100, true);
});

Deno.test("bilinear sampler is exact on grid nodes and bounded between", () => {
  const vals = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110];
  // On an exact node the sample reproduces it.
  assertEquals(sampleBilinear(vals, 0, 0), 0);
  assertEquals(sampleBilinear(vals, 1, 1), vals[1 * GRID.cols + 1] ?? 0);
  // A midpoint between two nodes is their average, never an overshoot.
  const a = vals[0], b = vals[1];
  const mid = sampleBilinear(vals, 0.5, 0);
  assertEquals(mid, (a + b) / 2);
});

Deno.test("series index follows the real date, not a hard-coded offset", () => {
  const today = "2026-09-16";
  const series = (from: string, n: number) =>
    Array.from({ length: n }, (_, i) => addDays(from, i));
  // Fresh: 20 past days → today at 20.
  const fresh = series("2026-08-27", 35);
  assertEquals(seriesIndexForDay(fresh, 0, today), 20);
  assertEquals(fresh[seriesIndexForDay(fresh, 2, today)], "2026-09-18");
  // A day old (the stored batch is from yesterday): today moves to 21.
  const old = series("2026-08-26", 35);
  assertEquals(old[seriesIndexForDay(old, 0, today)], today);
  // Too old to contain today: the index falls past the end, never onto
  // another day's weather.
  const stale = series("2026-08-01", 35);
  assert(seriesIndexForDay(stale, 0, today) >= stale.length);
  assertEquals(seriesIndexForDay([], 0, today), -1);
});

Deno.test("hotspot detail agrees with the map and follows the day", () => {
  const stations = [
    station("praha", 50.08, 14.44),
    station("brno", 49.2, 16.61),
    station("budejovice", 48.97, 14.47),
    station("ostrava", 49.82, 18.26),
  ];
  const today = todayIso();
  const spots = computeHotspots(stations, 1, "", { today });
  assert(spots.length > 0, "a wet, mild month yields hotspots");
  for (let k = 1; k < spots.length; k++) {
    assert(spots[k - 1].score.score >= spots[k].score.score, "sorted");
  }
  const top = spots[0];
  const same = hotspotAt(stations, 1, top.index, top.species.id, today);
  assertEquals(same?.score, top.score);
  const later = hotspotAt(stations, 9, top.index, top.species.id, today);
  assert(later && later.score.confidence < top.score.confidence);
  assertEquals(
    hotspotAt(stations, 1, top.index, "no-such-species", today),
    null,
  );
  assertEquals(hotspotAt([], 1, top.index, top.species.id, today), null);
  // A filter keeps only that species.
  const one = computeHotspots(stations, 1, top.species.id, { today });
  assert(one.every((h) => h.species.id === top.species.id));
});

Deno.test("season factor peaks in window", () => {
  const sp = SPECIES[0];
  const mid = Math.round((sp.season[0] + sp.season[1]) / 2);
  // approx ISO for day-of-year mid
  const iso = new Date(Date.UTC(2024, 0, mid)).toISOString().slice(0, 10);
  const peak = seasonFactor(sp, iso);
  const winter = seasonFactor(sp, "2024-01-15");
  assertEquals(peak > winter, true);
});
