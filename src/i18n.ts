// UI language — every visible string lives here, keyed by Lang.
import type { Level } from "./model/predict.ts";
import type { WmoKey } from "./model/weather.ts";
import type { Species } from "./data/species.ts";

export type Lang = "cz" | "en";

/** Czech counts in three forms: 1, 2–4, 5+. */
const czCount = (n: number, forms: readonly [string, string, string]): string =>
  `${n} ${n === 1 ? forms[0] : n >= 2 && n <= 4 ? forms[1] : forms[2]}`;

const enCount = (n: number, one: string, many: string): string =>
  n === 1 ? `${n} ${one}` : `${n} ${many}`;

export type Messages = {
  subtitle: string;
  forecastDay: string;
  prevDay: string;
  nextDay: string;
  today: string;
  yourLocation: string;
  stationsTitle: string;
  radarTitle: string;
  loading: string;
  stations: (n: number) => string;
  radarBusy: string;
  frames: (n: number) => string;
  noRadar: string;
  speciesTitle: string;
  all: string;
  layersTitle: string;
  mushrooms: string;
  towns: string;
  forest: string;
  rivers: string;
  lakes: string;
  locating: string;
  locateMe: string;
  refreshWeather: string;
  conditions: string;
  waitingWeather: string;
  feels: string;
  rh: string;
  wind: string;
  rain: string;
  hint: string;
  conf: string;
  factors: Record<
    "habitat" | "season" | "temp" | "moist" | "frost" | "wind",
    string
  >;
  cell: string;
  close: string;
  noReading: string;
  pickMushroom: string;
  emptyBody: (date: string) => string;
  mapAlt: string;
  language: string;
  updated: string;
  renderSoftware: string;
  renderSoftwareHint: string;
  renderFlat: string;
  renderFlatHint: string;
  wmo: Record<WmoKey, string>;
  level: Record<Level, string>;
};

const MESSAGES: Record<Lang, Messages> = {
  en: {
    subtitle: "Czech edible-mushroom forecast",
    forecastDay: "Forecast day",
    prevDay: "Previous day",
    nextDay: "Next day",
    today: "Today",
    yourLocation: "Your location",
    stationsTitle: "Weather stations",
    radarTitle: "RainViewer radar",
    loading: "loading…",
    stations: (n) => enCount(n, "station", "stations"),
    radarBusy: "radar…",
    frames: (n) => enCount(n, "frame", "frames"),
    noRadar: "no radar",
    speciesTitle: "Species",
    all: "All",
    layersTitle: "Layers",
    mushrooms: "Mushrooms",
    towns: "Towns",
    forest: "Forest",
    rivers: "Rivers",
    lakes: "Lakes & dams",
    locating: "Locating…",
    locateMe: "Locate me",
    refreshWeather: "Refresh weather",
    conditions: "Conditions",
    waitingWeather: "Waiting for weather…",
    feels: "Feels",
    rh: "RH",
    wind: "wind",
    rain: "Rain",
    hint:
      "Left-drag pans · middle-drag orbits · wheel zooms to cursor · ← → change day · click a mushroom for details",
    conf: "conf",
    factors: {
      habitat: "habitat",
      season: "season",
      temp: "temp",
      moist: "moisture",
      frost: "frost",
      wind: "wind",
    },
    cell: "Cell #",
    close: "Close",
    noReading: "No station reading yet.",
    pickMushroom: "Pick a mushroom",
    emptyBody: (date) =>
      `3D markers show where edible species are most likely for ${date}. Scores blend forest, altitude, season, and the last month of weather plus the forecast.`,
    mapAlt: "Czech mushroom map",
    language: "Language",
    updated: "Updated",
    renderSoftware: "SW rendering",
    renderSoftwareHint:
      "No graphics card available — the 3D map is drawn by the CPU and may be slow.",
    renderFlat: "SW rendering · 2D",
    renderFlatHint:
      "3D graphics (WebGL) are not available here, so a flat 2D map is shown instead.",
    wmo: {
      clear: "Clear",
      partlyCloudy: "Partly cloudy",
      overcast: "Overcast",
      fog: "Fog",
      drizzle: "Drizzle",
      rain: "Rain",
      snow: "Snow",
      showers: "Showers",
      snowShowers: "Snow showers",
      thunder: "Thunderstorm",
    },
    level: {
      none: "unlikely",
      low: "possible",
      medium: "likely",
      high: "very likely",
    },
  },
  cz: {
    subtitle: "Předpověď jedlých hub v Česku",
    forecastDay: "Den předpovědi",
    prevDay: "Předchozí den",
    nextDay: "Další den",
    today: "Dnes",
    yourLocation: "Vaše poloha",
    stationsTitle: "Meteostanice",
    radarTitle: "Radar RainViewer",
    loading: "načítání…",
    stations: (n) => czCount(n, ["stanice", "stanice", "stanic"]),
    radarBusy: "radar…",
    frames: (n) => czCount(n, ["snímek", "snímky", "snímků"]),
    noRadar: "bez radaru",
    speciesTitle: "Druhy",
    all: "Všechny",
    layersTitle: "Vrstvy",
    mushrooms: "Houby",
    towns: "Města",
    forest: "Les",
    rivers: "Řeky",
    lakes: "Jezera a přehrady",
    locating: "Zjišťuji polohu…",
    locateMe: "Najdi mě",
    refreshWeather: "Obnovit počasí",
    conditions: "Podmínky",
    waitingWeather: "Čekám na počasí…",
    feels: "Pocitově",
    rh: "Vlhkost",
    wind: "vítr",
    rain: "Srážky",
    hint:
      "Levým tlačítkem posouváte · prostředním otáčíte · kolečko zoomuje k kurzoru · ← → mění den · klikněte na houbu",
    conf: "jistota",
    factors: {
      habitat: "biotop",
      season: "sezóna",
      temp: "teplota",
      moist: "vlhkost",
      frost: "mráz",
      wind: "vítr",
    },
    cell: "Buňka #",
    close: "Zavřít",
    noReading: "Stanice zatím nemá data.",
    pickMushroom: "Vyberte houbu",
    emptyBody: (date) =>
      `3D značky ukazují, kde jsou jedlé druhy pro ${date} nejpravděpodobnější. Skóre kombinuje les, nadmořskou výšku, sezónu a počasí za poslední měsíc i předpověď.`,
    mapAlt: "Mapa hub v Česku",
    language: "Jazyk",
    updated: "Aktualizováno",
    renderSoftware: "SW vykreslování",
    renderSoftwareHint:
      "Grafická karta není k dispozici — 3D mapu kreslí procesor a může být pomalá.",
    renderFlat: "SW vykreslování · 2D",
    renderFlatHint:
      "3D grafika (WebGL) tu není k dispozici, proto se zobrazuje plochá 2D mapa.",
    wmo: {
      clear: "Jasno",
      partlyCloudy: "Polojasno",
      overcast: "Zataženo",
      fog: "Mlha",
      drizzle: "Mrholení",
      rain: "Déšť",
      snow: "Sněžení",
      showers: "Přeháňky",
      snowShowers: "Sněhové přeháňky",
      thunder: "Bouřky",
    },
    level: {
      none: "nepravděpodobné",
      low: "možné",
      medium: "pravděpodobné",
      high: "velmi pravděpodobné",
    },
  },
};

export const messages = (lang: Lang): Messages => MESSAGES[lang];

/** BCP-47 locale for date formatting. */
export const dateLocale = (lang: Lang): string =>
  lang === "cz" ? "cs-CZ" : "en-GB";

/** Species name in the active language. */
export const speciesName = (sp: Species, lang: Lang): string =>
  lang === "cz" ? sp.cz : sp.en;

/** Species description in the active language. */
export const speciesInfo = (sp: Species, lang: Lang): string =>
  lang === "cz" ? sp.infoCz : sp.info;
