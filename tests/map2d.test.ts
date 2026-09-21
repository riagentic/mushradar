import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { GRID } from "../src/data/grid.ts";
import {
  homeView,
  isSoftwareRenderer,
  kmToDeg,
  MAX_ZOOM,
  nearest,
  panBy,
  project,
  unproject,
  zoomAt,
} from "../src/ui/map2d.ts";
import {
  clusterOffset,
  computeHotspots,
  placeHotspots,
} from "../src/ui/scores.ts";
import { todayIso } from "../src/model/time.ts";
import { station } from "./fixtures.ts";

const v = homeView(800, 500);

Deno.test("map2d: the whole country fits, north up, east right", () => {
  const [x0, y0] = project(v, GRID.lon0, GRID.lat1); // north-west corner
  const [x1, y1] = project(v, GRID.lon1, GRID.lat0); // south-east corner
  for (const [x, y] of [[x0, y0], [x1, y1]]) {
    assert(x >= 0 && x <= v.w && y >= 0 && y <= v.h, `${x},${y} off canvas`);
  }
  assert(x1 > x0, "east is right");
  assert(y1 > y0, "south is down");
});

Deno.test("map2d: unproject inverts project", () => {
  const [x, y] = project(v, 14.44, 50.08); // Praha
  const [lon, lat] = unproject(v, x, y);
  assertAlmostEquals(lon, 14.44, 1e-9);
  assertAlmostEquals(lat, 50.08, 1e-9);
});

Deno.test("map2d: zoom keeps the point under the cursor and is clamped", () => {
  const [x, y] = project(v, 16.61, 49.2); // Brno
  const z = zoomAt(v, x, y, 2);
  const [zx, zy] = project(z, 16.61, 49.2);
  assertAlmostEquals(zx, x, 1e-6);
  assertAlmostEquals(zy, y, 1e-6);
  assertEquals(zoomAt(v, x, y, 0.1).zoom, 1);
  assertEquals(zoomAt(v, x, y, 100).zoom, MAX_ZOOM);
});

Deno.test("map2d: the map follows a drag and cannot leave the country", () => {
  const z = zoomAt(v, 400, 250, 4);
  const [x, y] = project(z, 15, 50);
  const p = panBy(z, -30, 20); // drag right + up → the view moves left + down
  const [px, py] = project(p, 15, 50);
  assertAlmostEquals(px - x, 30, 1e-6);
  assertAlmostEquals(py - y, -20, 1e-6);
  const far = panBy(z, 1e7, -1e7);
  assertEquals([far.lon, far.lat], [GRID.lon1, GRID.lat1]);
});

Deno.test("map2d: nearest pick respects the radius", () => {
  const pts = [[0, 0], [10, 0], [100, 100]] as const;
  assertEquals(nearest(pts, 8, 1, 12), 1);
  assertEquals(nearest(pts, 50, 50, 12), -1);
  assertEquals(nearest([], 0, 0, 12), -1);
});

Deno.test("map2d: km → degrees shrinks longitude with latitude", () => {
  const d = kmToDeg(10, 50);
  assert(d.lon > d.lat);
  assertAlmostEquals(d.lat, 10 / 110.57, 1e-12);
});

Deno.test("map2d: software WebGL renderers are recognised", () => {
  for (
    const s of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)",
    ]
  ) assert(isSoftwareRenderer(s), s);
  for (
    const s of [
      "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    ]
  ) assert(!isSoftwareRenderer(s), s);
});

Deno.test("markers sharing a cell spread apart, stay inside it, and are stable", () => {
  const today = todayIso();
  const stations = [
    station("praha", 50.08, 14.44),
    station("brno", 49.2, 16.61),
    station("budejovice", 48.97, 14.47),
  ];
  const spots = computeHotspots(stations, 1, "", { today });
  const placed = placeHotspots(spots);
  assertEquals(placed.length, spots.length);
  const cellW = (GRID.lon1 - GRID.lon0) / (GRID.cols - 1);
  const cellH = (GRID.lat1 - GRID.lat0) / (GRID.rows - 1);
  const byCell = Map.groupBy(placed, (p) => p.index);
  assert(
    [...byCell.values()].some((g) => g.length > 1),
    "fixture has shared cells",
  );
  for (const g of byCell.values()) {
    const keys = new Set(g.map((p) => `${p.plotLon},${p.plotLat}`));
    assertEquals(keys.size, g.length, "no two markers on one point");
    for (const p of g) {
      assert(Math.abs(p.plotLon - p.lon) < cellW / 2);
      assert(Math.abs(p.plotLat - p.lat) < cellH / 2);
      if (g.length === 1) assertEquals([p.plotLon, p.plotLat], [p.lon, p.lat]);
    }
  }
  assertEquals(placeHotspots(spots), placed, "same input, same layout");
});

Deno.test("cluster layout: centre for one, ring for a few, best-in-centre for many", () => {
  assertEquals(clusterOffset(1, 0, 3), [0, 0]);
  const two = [clusterOffset(2, 0, 3), clusterOffset(2, 1, 3)];
  assertAlmostEquals(two[0][0], -two[1][0]);
  assertAlmostEquals(two[0][1], -two[1][1]);
  assertEquals(clusterOffset(6, 0, 3), [0, 0]);
  assertAlmostEquals(Math.hypot(...clusterOffset(6, 2, 3)), 0.42);
});
