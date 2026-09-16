// Rivers as smooth ribbon meshes that follow the terrain.
//
// Two things make a river network read as a network rather than as loose
// strokes: the course is a Catmull-Rom curve (not a polyline), and every
// tributary's mouth is SNAPPED onto its parent's curve, so confluences meet
// exactly instead of approximately.
import { THREE } from "./three.ts";
import { type River, RIVERS } from "../data/rivers.ts";
import { ELEVATION, GRID } from "../data/grid.ts";
import {
  altToY,
  insideCz,
  latToZ,
  lonToX,
  sampleBilinear,
  xToLon,
  zToLat,
} from "./mapMath.ts";

const BASE_HALF_WIDTH = 0.045;
const LIFT = 0.06;
/** Per-order width multiplier: trunk rivers ~2.9× a minor tributary. */
const ORDER_WIDTH: readonly number[] = [1.0, 2.6, 1.0, 0.55];
const widthForOrder = (order: number): number =>
  BASE_HALF_WIDTH *
  (ORDER_WIDTH[Math.max(0, Math.min(ORDER_WIDTH.length - 1, order))] ?? 1);

const altAt = (lon: number, lat: number): number => {
  const sc = (lon - GRID.lon0) / (GRID.lon1 - GRID.lon0) * (GRID.cols - 1);
  const sr = (lat - GRID.lat0) / (GRID.lat1 - GRID.lat0) * (GRID.rows - 1);
  return sampleBilinear(ELEVATION, sc, sr);
};

/** World-space point on a river. */
type P = { x: number; z: number; lon: number; lat: number };

const toWorld = (lon: number, lat: number): P => ({
  x: lonToX(lon),
  z: latToZ(lat),
  lon,
  lat,
});

/** Nearest point on segment a→b, as a fraction t∈[0,1]. */
const nearestOnSegment = (p: P, a: P, b: P): { t: number; d: number } => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0
    ? 0
    : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  const cx = a.x + dx * t;
  const cz = a.z + dz * t;
  return { t, d: Math.hypot(p.x - cx, p.z - cz) };
};

/** Project a point onto a course's longest segment — the trunk it flows into
 *  is what a mouth should touch, never a random vertex. */
const snapToCourse = (p: P, course: readonly P[]): P => {
  let best = { t: 0, d: Infinity, i: 0 };
  for (let i = 0; i < course.length - 1; i++) {
    const r = nearestOnSegment(p, course[i], course[i + 1]);
    if (r.d < best.d) best = { t: r.t, d: r.d, i };
  }
  const a = course[best.i];
  const b = course[best.i + 1];
  return {
    x: a.x + (b.x - a.x) * best.t,
    z: a.z + (b.z - a.z) * best.t,
    lon: a.lon + (b.lon - a.lon) * best.t,
    lat: a.lat + (b.lat - a.lat) * best.t,
  };
};

/** Chaikin corner-cutting: each segment is replaced by the two points at
 *  1/4 and 3/4, iterated. Every generated point is a convex combination of
 *  its neighbours, so the curve can never overshoot the control polygon —
 *  which is what a Catmull-Rom does at a sharp turn, pushing the course
 *  through the border. */
const chaikin = (controls: readonly P[], iters = 3): P[] => {
  let cur = controls.slice();
  for (let k = 0; k < iters; k++) {
    const next: P[] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i], b = cur[i + 1];
      next.push(lerpP(a, b, 0.25));
      next.push(lerpP(a, b, 0.75));
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
};

const lerpP = (a: P, b: P, u: number): P => ({
  x: a.x + (b.x - a.x) * u,
  z: a.z + (b.z - a.z) * u,
  lon: a.lon + (b.lon - a.lon) * u,
  lat: a.lat + (b.lat - a.lat) * u,
});

/** Pull a point that fell outside the border back to the last legal spot.
 *  Guarantees the visible course never draws foreign land. */
const clampInside = (pts: readonly P[]): P[] => {
  const out: P[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const q = out[out.length - 1];
    if (insideCz(p.lon, p.lat) || !insideCz(q.lon, q.lat)) {
      out.push(p);
      continue;
    }
    let lo = 0, hi = 1;
    for (let it = 0; it < 24; it++) {
      const mid = (lo + hi) / 2;
      if (insideCz(lerpP(q, p, mid).lon, lerpP(q, p, mid).lat)) lo = mid;
      else hi = mid;
    }
    out.push(lerpP(q, p, lo));
  }
  return out;
};

/** Smooth course with a monotone parameter t along the way (for width taper). */
const smoothCourse = (
  controls: readonly P[],
  iters = 3,
): { p: P; t: number }[] => {
  const pts = clampInside(chaikin(controls, iters));
  return pts.map((p, i) => ({
    p,
    t: pts.length > 1 ? i / (pts.length - 1) : 1,
  }));
};

/** Course in world space, tributary mouths already snapped to their parent. */
const resolveCourses = (): Map<string, { p: P; t: number }[]> => {
  const byId = new Map<string, River>();
  for (const r of RIVERS) byId.set(r.id, r);

  const rawCache = new Map<string, P[]>();
  const rawCourse = (r: River): P[] => {
    const hit = rawCache.get(r.id);
    if (hit) return hit;
    const pts = r.path.map(([lon, lat]) => toWorld(lon, lat));
    rawCache.set(r.id, pts);
    return pts;
  };

  // Resolve deepest-first so a parent's mouth is final before its child snaps.
  const resolved = new Map<string, { p: P; t: number }[]>();
  const visiting = new Set<string>();
  const resolve = (r: River): { p: P; t: number }[] => {
    const hit = resolved.get(r.id);
    if (hit) return hit;
    if (visiting.has(r.id)) return smoothCourse(rawCourse(r));
    visiting.add(r.id);
    const pts = rawCourse(r).slice();
    const parent = r.joins ? byId.get(r.joins) : undefined;
    if (parent && pts.length >= 2) {
      const parentCourse = resolve(parent).map((s) => s.p);
      const mouth = pts[pts.length - 1];
      const snapped = snapToCourse(mouth, parentCourse);
      // Keep the pre-mouth vertex, replace the mouth so it lands on the trunk.
      pts[pts.length - 1] = snapped;
    }
    const smooth = smoothCourse(pts);
    visiting.delete(r.id);
    resolved.set(r.id, smooth);
    return smooth;
  };
  for (const r of RIVERS) resolve(r);
  return resolved;
};

export const buildRivers = (): THREE.Group => {
  const root = new THREE.Group();
  root.name = "rivers";

  const material = new THREE.MeshStandardMaterial({
    color: 0x1f6fa8, // sea blue — saturated mid-tone water
    emissive: 0x0d3d63,
    emissiveIntensity: 0.4,
    roughness: 0.28,
    metalness: 0.15,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
  });

  const courses = resolveCourses();

  for (const river of RIVERS) {
    const pts = courses.get(river.id)!;
    const width = widthForOrder(river.order);
    const positions: number[] = [];
    const index: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i].p;
      const prev = pts[Math.max(0, i - 1)].p;
      const next = pts[Math.min(pts.length - 1, i + 1)].p;
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      // Taper: a spring starts as a trickle and grows downstream. The power
      // keeps the upper course genuinely thin and most of the widening in the
      // lower third, the way a real river gains its water.
      const full = width * (0.05 + 0.95 * Math.pow(pts[i].t, 1.8));
      const y = altToY(altAt(p.lon, p.lat)) + LIFT;
      // A ribbon is wider than its centerline, so an edge can cross the border
      // even when the course does not. Shrink the half-width until both edge
      // points are legal; the centerline is already clamped, so this converges.
      const ok = (h: number): boolean =>
        insideCz(xToLon(p.x + px * h), zToLat(p.z + pz * h)) &&
        insideCz(xToLon(p.x - px * h), zToLat(p.z - pz * h));
      let half = full;
      if (!ok(half)) {
        let lo = 0, hi = 1;
        for (let it = 0; it < 16; it++) {
          const mid = (lo + hi) / 2;
          if (ok(full * mid)) lo = mid;
          else hi = mid;
        }
        half = full * lo;
      }
      positions.push(p.x + px * half, y, p.z + pz * half);
      positions.push(p.x - px * half, y, p.z - pz * half);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `river-${river.id}`;
    mesh.userData = { kind: "river", id: river.id, name: river.name };
    root.add(mesh);
  }

  return root;
};
