// Town markers: vertical pole + floating name / weather icon (no banner plate).
import { THREE } from "./three.ts";
import { type Town, TOWNS } from "../data/towns.ts";
import { WMO_ICON } from "../model/weather.ts";
import type { Station } from "../model/weather.ts";
import { seriesIndexForDay } from "./scores.ts";
import { altToY, latToZ, lonToX } from "./mapMath.ts";
import { ELEVATION, GRID } from "../data/grid.ts";

/** Capitals / regional hubs — always marked on the map. */
export const MAJOR_TOWN_IDS = [
  "praha",
  "brno",
  "ostrava",
  "plzen",
  "liberec",
  "olomouc",
  "budejovice",
  "hradec",
  "usti",
  "pardubice",
  "zlin",
  "kvary",
  "jihlava",
  "teplice",
  "kladno",
  "most",
  "opava",
  "decin",
  "trutnov",
  "sumperk",
  "cheb",
  "pribram",
  "tabor",
  "znojmo",
  "trebic",
  "havirov",
  "karvina",
  "hodonin",
  "breclav",
  "jesenik",
  "ceskykrumlov",
  "marianske",
  "turnov",
  "kolin",
  "beroun",
  "sokolov",
  "svitavy",
  "vsetin",
  "frydek",
  "nachod",
  // —— second wave (2× markers) ——
  "chomutov",
  "jablonec",
  "boleslav",
  "prostejov",
  "prerov",
  "ceskalipa",
  "pisek",
  "hradiste",
  "klatovy",
  "zdar",
  "strakonice",
  "jhradec",
  "bruntal",
  "domazlice",
  "krnov",
  "vimperk",
  "spindl",
  "trinec",
  "novyjicin",
  "koprivnice",
  "kromeriz",
  "uhbrod",
  "vyskov",
  "blansko",
  "boskovice",
  "mkrumlov",
  "telc",
  "pelhrimov",
  "havlickuv",
  "chrudim",
  "kutnahora",
  "caslav",
  "nymburk",
  "podebrady",
  "brandys",
  "melnik",
  "roudnice",
  "louny",
  "zatec",
  "klasterec",
  // —— third wave (100 markers) ——
  "tachov",
  "rokycany",
  "susice",
  "prachatice",
  "kaplice",
  "sobeslav",
  "milevsko",
  "benesov",
  "sedlcany",
  "dobris",
  "rakovnik",
  "slany",
  "kralupy",
  "semily",
  "vrchlabi",
  "dvurkralove",
  "jaromer",
  "rychnov",
  "ustinadorlici",
  "ceskatrebova",
] as const;

export const majorTowns = (): Town[] =>
  MAJOR_TOWN_IDS
    .map((id) => TOWNS.find((t) => t.id === id))
    .filter((t): t is Town => !!t);

const sampleAlt = (lon: number, lat: number): number => {
  const u = (lon - GRID.lon0) / (GRID.lon1 - GRID.lon0);
  const v = (lat - GRID.lat0) / (GRID.lat1 - GRID.lat0);
  const c = Math.round(u * (GRID.cols - 1));
  const r = Math.round(v * (GRID.rows - 1));
  const idx = Math.max(0, Math.min(GRID.rows - 1, r)) * GRID.cols +
    Math.max(0, Math.min(GRID.cols - 1, c));
  return ELEVATION[idx] ?? 300;
};

const NAME_FONT = "600 28px IBM Plex Sans, Segoe UI, sans-serif";
const TEMP_FONT = "600 22px IBM Plex Sans, Segoe UI, sans-serif";
const ICON_FONT =
  "48px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif";
const TEXT_X = 70;
const PAD_RIGHT = 10;
const MIN_W = 256;
const LABEL_H = 96;
/** World width of a label whose canvas is `w` px, keeping the sprite square. */
const LABEL_WORLD_H = 1.2;

export type TownLabel = { texture: THREE.CanvasTexture; aspect: number };

/** Text + weather icon only — transparent canvas, no plate/banner. The canvas
 *  is sized to the text, so a long name ("České Budějovice") is never clipped;
 *  the sprite is scaled by the returned aspect so it is not stretched. */
const drawLabel = (
  name: string,
  icon: string,
  tempLabel: string,
): TownLabel => {
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = NAME_FONT;
  const nameW = measure.measureText(name).width;
  measure.font = TEMP_FONT;
  const tempW = measure.measureText(tempLabel).width;
  const textW = Math.max(nameW, tempW, measureText(measure, icon, ICON_FONT));
  const w = Math.ceil(Math.max(MIN_W, TEXT_X + textW + PAD_RIGHT));
  const h = LABEL_H;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  const mid = h / 2;
  // A solid dark outline (not a translucent blur) keeps the fully-opaque text
  // legible over bright terrain without making it look washed out.
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(8, 14, 26, 0.95)";
  ctx.fillStyle = "#ffffff";

  ctx.font = ICON_FONT;
  ctx.strokeText(icon, 14, mid);
  ctx.fillText(icon, 14, mid);

  ctx.font = NAME_FONT;
  ctx.strokeText(name, TEXT_X, mid - 14);
  ctx.fillText(name, TEXT_X, mid - 14);

  ctx.font = TEMP_FONT;
  ctx.strokeText(tempLabel, TEXT_X, mid + 16);
  ctx.fillText(tempLabel, TEXT_X, mid + 16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return { texture: tex, aspect: w / h };
};

const measureText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
): number => {
  const prev = ctx.font;
  ctx.font = font;
  const v = ctx.measureText(text).width;
  ctx.font = prev;
  return v;
};

export type TownBillboard = {
  id: string;
  group: THREE.Group;
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  /** world height of one label; sprite width follows the text aspect */
  labelHeight: number;
};

export const buildTownBillboards = (): TownBillboard[] => {
  const out: TownBillboard[] = [];
  for (const t of majorTowns()) {
    const group = new THREE.Group();
    const y = altToY(sampleAlt(t.lon, t.lat));
    group.position.set(lonToX(t.lon), y, latToZ(t.lat));

    // Vertical line only (no ball / banner)
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.03, 3.2, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    pole.position.y = 1.6;
    pole.userData = { kind: "town", id: t.id, name: t.name };
    group.add(pole);

    const label = drawLabel(t.name, "·", "…");
    const mat = new THREE.SpriteMaterial({
      map: label.texture,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(LABEL_WORLD_H * label.aspect, LABEL_WORLD_H, 1);
    sprite.position.y = 3.6;
    sprite.center.set(0.5, 0);
    sprite.userData = { kind: "town", id: t.id, name: t.name };
    group.add(sprite);

    group.userData = { kind: "town", id: t.id, name: t.name };
    out.push({
      id: t.id,
      group,
      sprite,
      material: mat,
      labelHeight: LABEL_WORLD_H,
    });
  }
  return out;
};

export const refreshTownWeather = (
  boards: readonly TownBillboard[],
  stations: readonly Station[],
  dayOffset: number,
): void => {
  for (const b of boards) {
    const town = TOWNS.find((x) => x.id === b.id);
    if (!town) continue;
    const st = stations.find((s) => s.id === b.id);
    const tIdx = seriesIndexForDay(st?.daily?.time ?? [], dayOffset);
    let icon = "🏙";
    let tempLabel = "—°";
    if (st?.daily && tIdx >= 0 && tIdx < st.daily.tmax.length) {
      const code = st.daily.code[tIdx] ?? 0;
      const tmax = st.daily.tmax[tIdx];
      const tmin = st.daily.tmin[tIdx];
      icon = WMO_ICON(code, true);
      if (Number.isFinite(tmax) && Number.isFinite(tmin)) {
        tempLabel = `${Math.round(tmin)}–${Math.round(tmax)}°`;
      } else if (Number.isFinite(tmax)) {
        tempLabel = `${Math.round(tmax)}°`;
      }
    } else if (st?.current && dayOffset === 0) {
      icon = WMO_ICON(st.current.code, st.current.isDay);
      tempLabel = `${Math.round(st.current.temp)}°`;
    }
    const label = drawLabel(town.name, icon, tempLabel);
    const old = b.material.map;
    b.material.map = label.texture;
    b.material.transparent = true;
    b.material.needsUpdate = true;
    // Keep the sprite unstretched as the text width changes with the weather.
    b.sprite.scale.set(b.labelHeight * label.aspect, b.labelHeight, 1);
    old?.dispose();
  }
};
