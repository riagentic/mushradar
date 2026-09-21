// Flat 2D map (Canvas 2D, no GPU) — shown when WebGL cannot start. Same data
// and the same picks as the 3D map: terrain tint, rivers, lakes, towns,
// mushroom hotspots, home. Drag pans, wheel zooms, click picks.
import type { JSX } from "aio";
import { onCleanup, onMount, useRef } from "aio/air";
import { CZ_BORDER, ELEVATION, FOREST, GRID } from "../data/grid.ts";
import { LAKES } from "../data/lakes.ts";
import { TOWNS } from "../data/towns.ts";
import { RIVERS } from "../data/rivers.ts";
import { geo, view, weather } from "../cell.ts";
import { messages } from "../i18n.ts";
import { todayIso } from "../model/time.ts";
import { computeHotspots, type Placed, placeHotspots } from "./scores.ts";
import { elevColor, xToLon, zToLat } from "./mapMath.ts";
import { THREE } from "./three.ts";
import { resolveCourses } from "./rivers3d.ts";
import { MAJOR_TOWN_IDS } from "./townMarkers.ts";
import {
  homeView,
  kmToDeg,
  nearest,
  panBy,
  project,
  type View2D,
  zoomAt,
} from "./map2d.ts";

const MAJOR = new Set<string>(MAJOR_TOWN_IDS);
/** The list opens with the regional hubs; the rest get names once zoomed. */
const HUBS = new Set<string>(MAJOR_TOWN_IDS.slice(0, 23));
/** Which towns are drawn, and which are named, at a zoom level. */
const townShown = (id: string, zoom: number) => zoom >= 3 || MAJOR.has(id);
const townNamed = (id: string, zoom: number) =>
  HUBS.has(id) || (zoom >= 2 && MAJOR.has(id)) || zoom >= 4;
const PICK_PX = 12;

/** Terrain tint per source cell, as CSS colours — computed once. */
let tint: string[] | null = null;
const terrainTint = (): string[] =>
  tint ??= ELEVATION.map((alt, i) =>
    // The raw ramp values, as the 3D map's lit terrain shows them; getStyle()
    // would lift them to sRGB and wash the map out.
    `#${
      elevColor(alt, FOREST[i] ?? 0).getHexString(THREE.LinearSRGBColorSpace)
    }`
  );

/** River courses in lon/lat, tributary mouths snapped (shared with 3D). */
let courses: { order: number; pts: [number, number][] }[] | null = null;
const riverCourses = () => {
  if (courses) return courses;
  const resolved = resolveCourses();
  courses = RIVERS.map((r) => ({
    order: r.order,
    pts: (resolved.get(r.id) ?? []).map(({ p }) =>
      [xToLon(p.x), zToLat(p.z)] as [number, number]
    ),
  }));
  return courses;
};

const draw = (
  ctx: CanvasRenderingContext2D,
  v: View2D,
  spots: readonly Placed[],
): void => {
  const P = (lon: number, lat: number) => project(v, lon, lat);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, v.w, v.h);

  // Country outline as a path: it clips the terrain and is stroked on top.
  const border = new Path2D();
  CZ_BORDER.forEach(([lon, lat], i) => {
    const [x, y] = P(lon, lat);
    i ? border.lineTo(x, y) : border.moveTo(x, y);
  });
  border.closePath();

  ctx.save();
  ctx.clip(border);
  const colors = terrainTint();
  const dLon = (GRID.lon1 - GRID.lon0) / (GRID.cols - 1);
  const dLat = (GRID.lat1 - GRID.lat0) / (GRID.rows - 1);
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      const lon = GRID.lon0 + c * dLon, lat = GRID.lat0 + r * dLat;
      const [x0, y0] = P(lon - dLon / 2, lat + dLat / 2);
      const [x1, y1] = P(lon + dLon / 2, lat - dLat / 2);
      if (x1 < 0 || y1 < 0 || x0 > v.w || y0 > v.h) continue;
      ctx.fillStyle = colors[r * GRID.cols + c];
      // +0.5 px overlap hides hairline seams between neighbouring cells.
      ctx.fillRect(x0, y0, x1 - x0 + 0.5, y1 - y0 + 0.5);
    }
  }
  ctx.restore();

  ctx.strokeStyle = "#d8d8d2";
  ctx.lineWidth = 1.5;
  ctx.stroke(border);

  const water = "#4a90c8";
  if (view.showRivers) {
    ctx.strokeStyle = water;
    ctx.lineJoin = ctx.lineCap = "round";
    for (const { order, pts } of riverCourses()) {
      ctx.lineWidth = Math.max(0.8, (3 - order) * 0.9) * Math.sqrt(v.zoom);
      ctx.beginPath();
      pts.forEach(([lon, lat], i) => {
        const [x, y] = P(lon, lat);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
  }
  if (view.showLakes) {
    ctx.fillStyle = water;
    for (const l of LAKES) {
      const [x, y] = P(l.lon, l.lat);
      const d = kmToDeg(1, l.lat);
      const [ex] = P(l.lon + d.lon, l.lat);
      const [, ny] = P(l.lon, l.lat + d.lat);
      const pxPerKm = Math.abs(ex - x);
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        Math.max(1.5, l.lenKm * pxPerKm),
        Math.max(1, l.widKm * Math.abs(ny - y)),
        // Clockwise from east = clockwise on a y-down canvas.
        l.rotDeg * Math.PI / 180,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  if (view.showTowns) {
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (const t of TOWNS) {
      if (!townShown(t.id, v.zoom)) continue;
      const [x, y] = P(t.lon, t.lat);
      ctx.fillStyle = "#e8eef8";
      ctx.beginPath();
      ctx.arc(x, y, HUBS.has(t.id) ? 2.5 : 1.8, 0, Math.PI * 2);
      ctx.fill();
      if (!townNamed(t.id, v.zoom)) continue;
      // Dark halo keeps names readable over any terrain tint.
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(11,16,32,0.8)";
      ctx.strokeText(t.name, x + 5, y);
      ctx.fillText(t.name, x + 5, y);
    }
  }

  if (view.showMushrooms) {
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1;
    // Weakest first, so the best spots sit on top.
    for (const h of [...spots].reverse()) {
      const [x, y] = P(h.plotLon, h.plotLat);
      ctx.fillStyle = h.species.look.capColor;
      ctx.beginPath();
      ctx.arc(x, y, 3 + h.score.score * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (geo.lat && geo.lon) {
    const [x, y] = P(geo.lon, geo.lat);
    ctx.fillStyle = "#4fc3f7";
    ctx.strokeStyle = "#0288d1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
};

export default function Map2D(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null!);

  onMount(() => {
    if (typeof document === "undefined") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let v = homeView(1, 1);
    let spots: Placed[] = [];
    let spotsKey = "";
    let drawnKey = "";
    let drag: { x: number; y: number; moved: number } | null = null;

    const resize = () => {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || 800, h = parent?.clientHeight || 600;
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // First size: fit the country. Later: keep centre + zoom.
      v = v.w === 1 ? homeView(w, h) : { ...v, w, h };
      drawnKey = "";
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    // Cells are read in the frame loop (untracked), like the 3D map: redraw
    // only when something the picture depends on changed.
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // Today's date is in the key: past midnight "today" is a new day.
      const today = todayIso();
      const sk =
        `${today}|${view.day}|${view.species}|${weather.stations.length}|${weather.fetchedAt}`;
      if (sk !== spotsKey) {
        spots = placeHotspots(
          computeHotspots(weather.stations, view.day, view.species, { today }),
        );
        spotsKey = sk;
      }
      const key = [
        sk,
        v.w,
        v.h,
        v.zoom,
        v.lon,
        v.lat,
        view.showMushrooms,
        view.showTowns,
        view.showRivers,
        view.showLakes,
        geo.lat,
        geo.lon,
      ].join("|");
      if (key === drawnKey) return;
      drawnKey = key;
      draw(ctx, v, spots);
    };
    tick();

    const local = (e: MouseEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = local(e);
      v = zoomAt(v, x, y, e.deltaY > 0 ? 1 / 1.15 : 1.15);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.buttons === 0) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag = {
        x: e.clientX,
        y: e.clientY,
        moved: drag.moved + Math.hypot(dx, dy),
      };
      v = panBy(v, -dx, -dy);
    };
    const onUp = (e: PointerEvent) => {
      const d = drag;
      drag = null;
      if (!d || d.moved > 5) return;
      const [x, y] = local(e);
      const at = (lon: number, lat: number) => project(v, lon, lat);
      if (view.showMushrooms) {
        const i = nearest(
          spots.map((h) => at(h.plotLon, h.plotLat)),
          x,
          y,
          PICK_PX,
        );
        if (i >= 0) return view.pickCell(spots[i].index, spots[i].species.id);
      }
      if (view.showTowns) {
        const shown = TOWNS.filter((t) => townShown(t.id, v.zoom));
        const i = nearest(shown.map((t) => at(t.lon, t.lat)), x, y, PICK_PX);
        if (i >= 0) return view.pickTown(shown[i].id);
      }
      view.clearPick();
    };
    const onCancel = () => {
      drag = null;
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
    });
  });

  return (
    <canvas
      ref={canvasRef}
      t="map-2d"
      class="map-canvas"
      aria-label={messages(view.lang).mapAlt}
    />
  );
}
