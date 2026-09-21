// 3D Czech terrain + mushroom markers (Three.js canvas).
import type { JSX } from "aio";
import { onCleanup, onGlobalKey, onMount, useLocal, useRef } from "aio/air";
import { THREE } from "./three.ts";
import { CZ_BORDER, ELEVATION, FOREST, GRID } from "../data/grid.ts";
import { geo, view, weather } from "../cell.ts";
import { computeHotspots, type Hotspot, placeHotspots } from "./scores.ts";
import { messages } from "../i18n.ts";
import { todayIso } from "../model/time.ts";
import { buildMushroom } from "./mushroomMesh.ts";
import {
  altToY,
  elevColor,
  FINE_COLS,
  FINE_ROWS,
  fineToSource,
  latToZ,
  lonToX,
  MAP_D,
  MAP_W,
  sampleBilinear,
} from "./mapMath.ts";
import {
  buildTownBillboards,
  refreshTownWeather,
  type TownBillboard,
} from "./townMarkers.ts";
import { buildForest } from "./forest3d.ts";
import { buildRivers } from "./rivers3d.ts";
import { buildLakes } from "./lakes3d.ts";
import Map2D from "./Map2D.tsx";
import { isSoftwareRenderer, type RenderMode } from "./map2d.ts";

/** Bottom of the solid slab the country is extruded down to (world Y).
 *  Measured, not guessed: the lowest terrain sample, so the skirt stops at the
 *  ground instead of hanging below it. */
const TERRAIN_BASE_Y = altToY(Math.min(...ELEVATION));

/** A hair of overlap so the wall top cannot sit visibly below the clipped
 *  ground edge under z-fighting. Invisible at any realistic zoom. */
const LIP = 0.02;

/** The exact border as a flat triangulated mesh, used as a STENCIL, not a
 *  texture. A raster alpha mask quantises the edge to its texel grid (~340 m)
 *  and can only ever approximate the polygon, which is why the ground edge and
 *  the extruded wall disagreed. The stencil is rasterised by the GPU from the
 *  very same vertices the wall is built from, so the two outlines are the same
 *  geometry by construction — the ground is cut exactly where the wall stands,
 *  at pixel resolution, however the polygon turns. */
const buildCzStencil = (): THREE.Mesh => {
  const border = CZ_BORDER.map(([lon, lat]) => ({
    x: lonToX(lon),
    y: fineSurfaceY(lon, lat),
    z: latToZ(lat),
  }));
  const contour = border.map((p) => new THREE.Vector2(p.x, p.z));
  // Ear-clip the (non-convex) outline; no holes. Reused for nothing else.
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = new Float32Array(tris.length * 9);
  for (let t = 0; t < tris.length; t++) {
    for (let k = 0; k < 3; k++) {
      const p = border[tris[t][k]];
      pos[t * 9 + k * 3] = p.x;
      // ON THE TERRAIN, not flat at y=0. The stencil is a screen-space mask,
      // so a polygon drawn at y=0 projects to a different place than the same
      // outline at 200–1400 m under perspective — the clip would sit a few
      // pixels off the wall. Putting the stencil on the surface makes the two
      // projections identical, so the ground is cut exactly where the wall is.
      pos[t * 9 + k * 3 + 1] = p.y;
      pos[t * 9 + k * 3 + 2] = p.z;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilRef: 1,
      stencilZPass: THREE.ReplaceStencilOp,
    }),
  );
  mesh.name = "cz-stencil";
  mesh.renderOrder = -1; // write the stencil before anything tests it
  mesh.frustumCulled = false;
  return mesh;
};

/** Height of the actual rendered terrain at a geographic point: the fine mesh
 *  is piecewise linear, so interpolate on its triangles (not a bilinear sample
 *  of the source grid — that is a different surface and leaves a seam). */
const fineSurfaceY = (lon: number, lat: number): number => {
  const fc = (lon - GRID.lon0) / (GRID.lon1 - GRID.lon0) *
    (FINE_COLS - 1);
  const fr = (lat - GRID.lat0) / (GRID.lat1 - GRID.lat0) *
    (FINE_ROWS - 1);
  const c0 = Math.max(0, Math.min(FINE_COLS - 2, Math.floor(fc)));
  const r0 = Math.max(0, Math.min(FINE_ROWS - 2, Math.floor(fr)));
  const u = Math.max(0, Math.min(1, fc - c0));
  const v = Math.max(0, Math.min(1, fr - r0));
  const yAt = (r: number, c: number): number => {
    const [sc, sr] = fineToSource(r, c);
    return altToY(sampleBilinear(ELEVATION, sc, sr));
  };
  const y00 = yAt(r0, c0), y01 = yAt(r0, c0 + 1);
  const y10 = yAt(r0 + 1, c0), y11 = yAt(r0 + 1, c0 + 1);
  // Triangles (a,b,cc)=(y00,y01,y10) and (b,d,cc)=(y01,y11,y10); the shared
  // diagonal runs y01→y10, i.e. u+v = 1.
  return u + v <= 1
    ? y00 + (y01 - y00) * u + (y10 - y00) * v
    : y11 + (y01 - y11) * (1 - v) + (y10 - y11) * (1 - u);
};

const buildTerrain = (): THREE.Group => {
  // A mesh finer than the 96×60 source, with bilinearly sampled elevation:
  // the source steps shrink by TERRAIN_SUBDIV and elevations stop being
  // blocky. The border itself is cut by the polygon mask, so it is smooth at
  // any zoom; a skirt extruded along the true border closes the solid.
  const root = new THREE.Group();
  root.name = "terrain";

  const cols = FINE_COLS;
  const rows = FINE_ROWS;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [sc, sr] = fineToSource(r, c);
      const lon = GRID.lon0 + (GRID.lon1 - GRID.lon0) * sc / (GRID.cols - 1);
      const lat = GRID.lat0 + (GRID.lat1 - GRID.lat0) * sr / (GRID.rows - 1);
      const alt = sampleBilinear(ELEVATION, sc, sr);
      const forest = sampleBilinear(FOREST, sc, sr);
      positions.push(lonToX(lon), altToY(alt), latToZ(lat));
      const cl = elevColor(alt, forest);
      colors.push(cl.r, cl.g, cl.b);
      uvs.push(
        (lon - GRID.lon0) / (GRID.lon1 - GRID.lon0),
        (lat - GRID.lat0) / (GRID.lat1 - GRID.lat0),
      );
    }
  }
  const index: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const cc = a + cols;
      const d = cc + 1;
      // Winding that faces +Y given west→+X (lonToX mirrored) and north→+Z.
      index.push(a, b, cc, b, d, cc);
    }
  }

  const surface = new THREE.BufferGeometry();
  surface.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  surface.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  surface.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  surface.setIndex(index);
  surface.computeVertexNormals();
  const ground = new THREE.Mesh(
    surface,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.04,
      side: THREE.FrontSide,
      // Clip the ground to the COUNTRY using the stencil written by the exact
      // border mesh, so its edge is the same polygon geometry the wall uses —
      // not a 340 m raster step and not a dial-out "guess". See buildCzStencil.
      stencilWrite: true,
      stencilFunc: THREE.EqualStencilFunc,
      stencilRef: 1,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
      // Lift the surface a hair off the coincident skirt edge.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  ground.receiveShadow = true;
  ground.name = "terrain-surface";
  root.add(ground);

  root.add(buildCzStencil());

  // Solid edge: extrude the exact border down to TERRAIN_BASE_Y. The top of
  // the wall is sampled from the RENDERED fine mesh (fineSurfaceY), so it
  // meets the clipped ground edge to within floating point; no outward dial,
  // no inward tuck, no lip — the two surfaces are cut from one outline.
  const wallPositions: number[] = [];
  const wallIndex: number[] = [];
  const n = CZ_BORDER.length;
  for (let i = 0; i < n; i++) {
    const [lon0, lat0] = CZ_BORDER[i];
    const [lon1, lat1] = CZ_BORDER[(i + 1) % n];
    const x0 = lonToX(lon0), z0 = latToZ(lat0);
    const x1 = lonToX(lon1), z1 = latToZ(lat1);
    const y0 = fineSurfaceY(lon0, lat0) + LIP;
    const y1 = fineSurfaceY(lon1, lat1) + LIP;
    const base = wallPositions.length / 3;
    wallPositions.push(
      x0,
      y0,
      z0, // top, exactly on the terrain edge
      x1,
      y1,
      z1,
      x1,
      TERRAIN_BASE_Y,
      z1, // straight down
      x0,
      TERRAIN_BASE_Y,
      z0,
    );
    wallIndex.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wallPositions, 3),
  );
  walls.setIndex(wallIndex);
  walls.computeVertexNormals();
  const skirt = new THREE.Mesh(
    walls,
    new THREE.MeshStandardMaterial({
      color: 0xd8d8d2,
      roughness: 0.9,
      metalness: 0,
      // A concave outline has segments whose winding flips; DoubleSide makes
      // the thin wall correct for all of them without per-segment bookkeeping.
      side: THREE.DoubleSide,
    }),
  );
  skirt.receiveShadow = true;
  skirt.name = "terrain-skirt";
  root.add(skirt);

  return root;
};

const sampleAlt = (lon: number, lat: number): number => {
  const u = (lon - GRID.lon0) / (GRID.lon1 - GRID.lon0);
  const v = (lat - GRID.lat0) / (GRID.lat1 - GRID.lat0);
  const c = Math.round(u * (GRID.cols - 1));
  const r = Math.round(v * (GRID.rows - 1));
  const idx = Math.max(0, Math.min(GRID.rows - 1, r)) * GRID.cols +
    Math.max(0, Math.min(GRID.cols - 1, c));
  return ELEVATION[idx] ?? 300;
};

export default function Map3D(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const [mode, setMode] = useLocal<RenderMode>("gpu");
  const api = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    mushRoot?: THREE.Group;
    townRoot?: THREE.Group;
    forestRoot?: THREE.Group;
    riverRoot?: THREE.Group;
    lakeRoot?: THREE.Group;
    townBoards?: TownBillboard[];
    home?: THREE.Mesh;
    hotspots: Hotspot[];
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    drag: {
      on: boolean;
      pan: boolean;
      x: number;
      y: number;
      az: number;
      pol: number;
      target: THREE.Vector3;
      /** ground point under the cursor when a pan began; the target follows
       *  the cursor so the map is grabbed, not nudged along a camera axis */
      anchor: THREE.Vector3 | null;
      /** camera frozen at drag start: the cursor→ground map must NOT be
       *  recomputed from the moving camera, or the target chases its own
       *  output and the view flickers */
      cam: THREE.PerspectiveCamera | null;
      /** plane height the grab is pinned to (the target's Y at drag start) */
      planeY: number;
    };
    orbit: { az: number; pol: number; dist: number; target: THREE.Vector3 };
    lastKey: string;
  }>({
    hotspots: [],
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    drag: {
      on: false,
      pan: false,
      x: 0,
      y: 0,
      az: 0,
      pol: 0,
      target: new THREE.Vector3(),
      anchor: null,
      cam: null,
      planeY: 0,
    },
    orbit: {
      // South looking north. With west→+X, west is screen-left (Praha west of Svitavy).
      az: Math.PI,
      pol: 0.85,
      dist: 48,
      target: new THREE.Vector3(0, 1.5, 0),
    },
    lastKey: "",
  });

  onGlobalKey("ArrowRight", (e) => {
    e.preventDefault();
    view.nextDay();
  });
  onGlobalKey("ArrowLeft", (e) => {
    e.preventDefault();
    view.prevDay();
  });

  onMount(() => {
    if (typeof document === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        // The country's ground is clipped to the exact border with a stencil.
        // Three r170 allocates NO stencil buffer unless asked, and a stencil
        // test against a missing buffer silently passes — the clip would be a
        // no-op. Ask for it explicitly.
        stencil: true,
      });
    } catch {
      // No WebGL at all (a macOS VM: no Metal, so not even SwiftShader).
      // Fall back to the flat 2D map instead of an empty box.
      setMode("flat");
      return;
    }
    // A CPU rasteriser behind WebGL works but is slow — label it, so a tester
    // knows which path they are looking at.
    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const glName = String(
      gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "",
    );
    if (isSoftwareRenderer(glName)) setMode("software");
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x0b1020, 1);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b1020, 0.006);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 250);
    // Bright sky / ground fill so MeshStandard materials read clearly
    const hemi = new THREE.HemisphereLight(0xddeeff, 0x3a2a1a, 0.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.0);
    sun.position.set(-15, 70, -40); // above + south (toward default camera at −Z)
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    scene.add(sun);
    scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0x88aacc, 0.3);
    fill.position.set(25, 40, 30);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0x6a7a90, 0.3));

    const terrain = buildTerrain();
    scene.add(terrain);
    const forestRoot = buildForest();
    scene.add(forestRoot);

    const riverRoot = buildRivers();
    scene.add(riverRoot);

    const lakeRoot = buildLakes();
    scene.add(lakeRoot);

    const mushRoot = new THREE.Group();
    mushRoot.name = "mushrooms";
    scene.add(mushRoot);

    const townRoot = new THREE.Group();
    townRoot.name = "towns";
    const townBoards = buildTownBillboards();
    for (const b of townBoards) townRoot.add(b.group);
    scene.add(townRoot);
    refreshTownWeather(townBoards, weather.stations, view.day);

    const home = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0x4fc3f7,
        emissive: 0x0288d1,
        emissiveIntensity: 0.6,
      }),
    );
    home.visible = false;
    scene.add(home);

    const st = api.current;
    st.renderer = renderer;
    st.scene = scene;
    st.camera = camera;
    st.mushRoot = mushRoot;
    st.townRoot = townRoot;
    st.forestRoot = forestRoot;
    st.riverRoot = riverRoot;
    st.lakeRoot = lakeRoot;
    st.townBoards = townBoards;
    st.home = home;

    const resize = () => {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || canvas.clientWidth || 800;
      const h = parent?.clientHeight || canvas.clientHeight || 600;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const applyOrbit = () => {
      const o = st.orbit;
      const x = o.target.x + o.dist * Math.sin(o.pol) * Math.sin(o.az);
      const y = o.target.y + o.dist * Math.cos(o.pol);
      const z = o.target.z + o.dist * Math.sin(o.pol) * Math.cos(o.az);
      camera.position.set(x, y, z);
      camera.lookAt(o.target);
    };
    applyOrbit();

    // The key carries today's date: past midnight "today" is a new day even
    // when nothing else changed.
    const mushKey = (today: string) =>
      `${today}|${view.day}|${view.species}|${weather.stations.length}|${weather.fetchedAt}`;
    const rebuildMushrooms = (today: string) => {
      const spots = computeHotspots(weather.stations, view.day, view.species, {
        today,
      });
      st.hotspots = spots;
      while (mushRoot.children.length) {
        const c = mushRoot.children[0];
        mushRoot.remove(c);
        c.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const m = o.material;
            if (Array.isArray(m)) m.forEach((x) => x.dispose());
            else m.dispose();
          }
        });
      }
      for (const p of placeHotspots(spots)) {
        const { plotLon: lon, plotLat: lat, ...h } = p;
        const scale = (0.35 + h.score.score * 0.7) * 0.9375; // −50% vs prior
        const m = buildMushroom(h.species, scale);
        // Off-centre markers stand on the terrain surface, not the node height.
        const ground = sampleBilinear(
          ELEVATION,
          (lon - GRID.lon0) / (GRID.lon1 - GRID.lon0) * (GRID.cols - 1),
          (lat - GRID.lat0) / (GRID.lat1 - GRID.lat0) * (GRID.rows - 1),
        );
        m.position.set(lonToX(lon), altToY(ground) + 0.05, latToZ(lat));
        m.userData = {
          kind: "mush",
          index: h.index,
          species: h.species.id,
          hotspot: h,
        };
        // slight face camera jitter via hash
        m.rotation.y = (h.index % 17) * 0.37;
        mushRoot.add(m);
      }
      st.lastKey = mushKey(today);
    };

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // live cell reads
      const today = todayIso();
      if (mushKey(today) !== st.lastKey) rebuildMushrooms(today);

      townRoot.visible = view.showTowns;
      mushRoot.visible = view.showMushrooms;
      if (st.forestRoot) st.forestRoot.visible = view.showForest;
      if (st.riverRoot) st.riverRoot.visible = view.showRivers;
      if (st.lakeRoot) st.lakeRoot.visible = view.showLakes;
      if (st.townBoards) {
        const tk =
          `${view.day}|${weather.fetchedAt}|${weather.stations.length}`;
        if ((st as { townKey?: string }).townKey !== tk) {
          refreshTownWeather(st.townBoards, weather.stations, view.day);
          (st as { townKey?: string }).townKey = tk;
        }
      }
      if (geo.lat && geo.lon) {
        home.visible = true;
        home.position.set(
          lonToX(geo.lon),
          altToY(sampleAlt(geo.lon, geo.lat)) + 0.25,
          latToZ(geo.lat),
        );
      }

      applyOrbit();
      renderer.render(scene, camera);
    };
    rebuildMushrooms(todayIso());
    tick();

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      st.raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      if (st.raycaster.ray.intersectPlane(plane, hit)) {
        const before = st.orbit.dist;
        st.orbit.dist = Math.max(
          8,
          Math.min(90, st.orbit.dist * (e.deltaY > 0 ? 1.08 : 0.92)),
        );
        const k = 1 - st.orbit.dist / before;
        st.orbit.target.lerp(hit, k * 0.35);
      } else {
        st.orbit.dist = Math.max(
          8,
          Math.min(90, st.orbit.dist * (e.deltaY > 0 ? 1.08 : 0.92)),
        );
      }
    };

    /** Ground point under a screen position, on the horizontal plane at
     *  `planeY`, cast from `cam`. Null when the ray is parallel to that plane
     *  (near-horizontal view).
     *
     *  `cam` is passed in because a pan must cast from the camera FROZEN at
     *  drag start. Casting from the live camera — which has already translated
     *  with the target — makes the target depend on its own result: it chases
     *  the cursor's ray and the view oscillates. The frozen camera makes the
     *  cursor→ground map a pure function, so the pan is exact and stable. */
    const groundAt = (
      cam: THREE.PerspectiveCamera,
      clientX: number,
      clientY: number,
      planeY: number,
    ): THREE.Vector3 | null => {
      const rect = canvas.getBoundingClientRect();
      st.pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      cam.updateMatrixWorld();
      st.raycaster.setFromCamera(st.pointer, cam);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const hit = new THREE.Vector3();
      return st.raycaster.ray.intersectPlane(plane, hit) ? hit : null;
    };

    const onDown = (e: PointerEvent) => {
      const pan = e.button === 0;
      const planeY = st.orbit.target.y;
      // Freeze the camera for the whole gesture. A camera looking parallel to
      // the ground cannot hit its plane; then there is no anchor and the pan
      // falls back to a horizontal slide, so the drag never dies.
      const frozen = pan ? camera.clone() : null;
      st.drag = {
        on: true,
        // Left button pans; middle button orbits. No modifier needed.
        pan,
        x: e.clientX,
        y: e.clientY,
        az: st.orbit.az,
        pol: st.orbit.pol,
        target: st.orbit.target.clone(),
        anchor: frozen ? groundAt(frozen, e.clientX, e.clientY, planeY) : null,
        cam: frozen,
        planeY,
      };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!st.drag.on || e.buttons === 0) return;
      const dx = e.clientX - st.drag.x;
      const dy = e.clientY - st.drag.y;
      if (st.drag.pan) {
        // Grab-pan: keep the ground point under the cursor. target = start +
        // (anchor - hit), where `hit` is where the cursor's ray meets the
        // ground from the FROZEN camera. Because the camera translates rigidly
        // with the target, this is exactly the translation that pins the
        // grabbed point to the cursor at any azimuth and any fold — and it is
        // a pure function of the cursor, so it cannot flicker. A folded view
        // covers ground fast, which is the "flying" feel a tilted map needs.
        const { cam, anchor, planeY, target } = st.drag;
        const hit = cam ? groundAt(cam, e.clientX, e.clientY, planeY) : null;
        if (hit && anchor) {
          st.orbit.target.copy(target).add(anchor).sub(hit);
          // A folded view flies far per pixel; keep the target on the map
          // (plus a margin) so a drag cannot launch the camera off to sea.
          const mx = MAP_W * 0.75, mz = MAP_D * 0.75;
          st.orbit.target.x = Math.max(-mx, Math.min(mx, st.orbit.target.x));
          st.orbit.target.z = Math.max(-mz, Math.min(mz, st.orbit.target.z));
        } else {
          camera.updateMatrixWorld();
          const right = new THREE.Vector3().setFromMatrixColumn(
            camera.matrixWorld,
            0,
          );
          right.y = 0;
          right.normalize();
          const k = st.orbit.dist * 0.0016;
          st.orbit.target.copy(target).addScaledVector(right, -dx * k);
        }
        return;
      }
      st.orbit.az = st.drag.az - dx * 0.005;
      st.orbit.pol = Math.max(0.2, Math.min(1.35, st.drag.pol - dy * 0.005));
    };
    const onUp = (e: PointerEvent) => {
      // A release that did not start on the canvas is nobody's click.
      if (!st.drag.on) return;
      const moved = Math.hypot(e.clientX - st.drag.x, e.clientY - st.drag.y);
      st.drag.on = false;
      // Pick only on a left click that did not turn into a drag (pans are
      // left-drags now, so a still left press must still select); a middle
      // button press never selects.
      if (moved > 5 || e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      st.pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      st.raycaster.setFromCamera(st.pointer, camera);
      // The raycaster ignores `visible`: a hidden layer must not be pickable.
      const hits = mushRoot.visible
        ? st.raycaster.intersectObjects(mushRoot.children, true)
        : [];
      if (hits.length) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.hotspot) obj = obj.parent;
        if (obj?.userData?.hotspot) {
          const h = obj.userData.hotspot as Hotspot;
          view.pickCell(h.index, h.species.id);
          return;
        }
      }
      const townHits = townRoot.visible
        ? st.raycaster.intersectObjects(townRoot.children, true)
        : [];
      if (townHits.length && townHits[0].object.userData?.kind === "town") {
        view.pickTown(townHits[0].object.userData.id as string);
        return;
      }
      view.clearPick();
    };
    // Lost capture (alt-tab, touch cancel): end the gesture, never pick.
    const onCancel = () => {
      st.drag.on = false;
    };

    // Middle-click on a canvas otherwise starts the browser's autoscroll
    // (the four-arrow widget), which fights the pan. Suppress it.
    const onAux = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("auxclick", onAux);
    canvas.addEventListener("mousedown", onAux);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("auxclick", onAux);
      canvas.removeEventListener("mousedown", onAux);
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite)) return;
        o.geometry.dispose();
        for (const m of [o.material].flat()) {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
    });
  });

  const m = messages(view.lang);
  return (
    <>
      {mode === "flat" ? <Map2D /> : (
        <canvas
          ref={canvasRef}
          t="map"
          class="map-canvas"
          aria-label={m.mapAlt}
        />
      )}
      {mode !== "gpu" && (
        <span
          class="render-badge"
          t="render-mode"
          title={mode === "flat" ? m.renderFlatHint : m.renderSoftwareHint}
        >
          {mode === "flat" ? m.renderFlat : m.renderSoftware}
        </span>
      )}
    </>
  );
}
