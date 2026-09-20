// Flat top-down map math — the fallback when no WebGL context exists (a macOS
// VM has no Metal device, and there even SwiftShader cannot start). Pure
// functions only; Map2D.tsx draws with them.
import { GRID } from "../data/grid.ts";

/** Screen transform: north up, east right, longitude shrunk by cos(mid-lat)
 *  so the country keeps its true shape. `zoom` 1 = the whole bbox fits. */
export type View2D = {
  w: number;
  h: number;
  zoom: number;
  /** geographic point at the canvas centre */
  lon: number;
  lat: number;
};

const MID_LAT = (GRID.lat0 + GRID.lat1) / 2;
const KX = Math.cos(MID_LAT * Math.PI / 180);
const SPAN_X = (GRID.lon1 - GRID.lon0) * KX;
const SPAN_Y = GRID.lat1 - GRID.lat0;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

export const homeView = (w: number, h: number): View2D => ({
  w,
  h,
  zoom: 1,
  lon: (GRID.lon0 + GRID.lon1) / 2,
  lat: MID_LAT,
});

/** Pixels per degree of latitude, 4 % margin at zoom 1. */
const pxPerDeg = (v: View2D): number =>
  Math.min(v.w / SPAN_X, v.h / SPAN_Y) * 0.96 * v.zoom;

export const project = (
  v: View2D,
  lon: number,
  lat: number,
): readonly [number, number] => {
  const k = pxPerDeg(v);
  return [v.w / 2 + (lon - v.lon) * KX * k, v.h / 2 - (lat - v.lat) * k];
};

export const unproject = (
  v: View2D,
  x: number,
  y: number,
): readonly [number, number] => {
  const k = pxPerDeg(v);
  return [v.lon + (x - v.w / 2) / (KX * k), v.lat - (y - v.h / 2) / k];
};

/** Keep the centre on the country so a drag cannot lose the map. */
const clampCentre = (v: View2D): View2D => ({
  ...v,
  lon: Math.max(GRID.lon0, Math.min(GRID.lon1, v.lon)),
  lat: Math.max(GRID.lat0, Math.min(GRID.lat1, v.lat)),
});

/** Zoom by `factor` keeping the point under (x, y) fixed. */
export const zoomAt = (
  v: View2D,
  x: number,
  y: number,
  factor: number,
): View2D => {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
  const [lon, lat] = unproject(v, x, y);
  const next = { ...v, zoom };
  const [nx, ny] = project(next, lon, lat);
  return panBy(next, nx - x, ny - y);
};

/** Move the view so the map follows a drag of (dx, dy) pixels. */
export const panBy = (v: View2D, dx: number, dy: number): View2D => {
  const k = pxPerDeg(v);
  return clampCentre({ ...v, lon: v.lon + dx / (KX * k), lat: v.lat - dy / k });
};

/** Index of the point nearest (x, y) within `radius` px, or -1. */
export const nearest = (
  pts: readonly (readonly [number, number])[],
  x: number,
  y: number,
  radius: number,
): number => {
  let best = -1;
  let bestD = radius * radius;
  pts.forEach(([px, py], i) => {
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d <= bestD) [best, bestD] = [i, d];
  });
  return best;
};

/** Km half-axes → degrees at a latitude (a lake's ellipse radii). */
export const kmToDeg = (
  km: number,
  lat: number,
): { lon: number; lat: number } => ({
  lon: km / (111.32 * Math.cos(lat * Math.PI / 180)),
  lat: km / 110.57,
});

/** How the map is drawn: a GPU, a CPU rasteriser behind WebGL, or no WebGL. */
export type RenderMode = "gpu" | "software" | "flat";

/** A WebGL renderer string that names a CPU rasteriser. SwiftShader
 *  (Chromium), llvmpipe/softpipe (Mesa), Microsoft Basic Render (Windows WARP). */
export const isSoftwareRenderer = (renderer: string): boolean =>
  /swiftshader|llvmpipe|softpipe|basic render|software/i.test(renderer);
