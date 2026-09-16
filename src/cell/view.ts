// View cell — one tab's map controls: the day, the species filter, the pick.
import { cell } from "aio";
import { MAX_DAY_OFFSET } from "../model/time.ts";
import type { Lang } from "../i18n.ts";

export type Pick =
  | { kind: "cell"; index: number; species: string }
  | { kind: "town"; id: string };

export const view = cell("view", {
  scope: "client",
  args: {
    setDay: [(v) => (typeof v === "number" && Number.isFinite(v)) || "day"],
    pickCell: [
      (v) => (Number.isInteger(v) && (v as number) >= 0) || "index",
      (v) => typeof v === "string" || "species",
    ],
    pickTown: [(v) => typeof v === "string" || "town id"],
  },
  state: {
    day: 0,
    species: "" as string, // "" = every species
    pick: null as Pick | null,
    showMushrooms: true,
    showTowns: true,
    showForest: true,
    showRivers: true,
    showLakes: true,
    lang: "cz" as Lang,
  },
  methods: {
    setLang(s, lang: Lang) {
      s.lang = lang === "en" ? "en" : "cz";
    },
    nextDay(s) {
      s.day = Math.min(MAX_DAY_OFFSET, s.day + 1);
    },
    prevDay(s) {
      s.day = Math.max(0, s.day - 1);
    },
    setDay(s, day: number) {
      s.day = Math.max(0, Math.min(MAX_DAY_OFFSET, Math.round(day)));
    },
    selectSpecies(s, id: string) {
      s.species = s.species === id ? "" : id;
    },
    pickCell(s, index: number, species: string) {
      s.pick = { kind: "cell", index, species };
    },
    pickTown(s, id: string) {
      s.pick = { kind: "town", id };
    },
    clearPick(s) {
      s.pick = null;
    },
    toggleMushrooms(s) {
      s.showMushrooms = !s.showMushrooms;
    },
    toggleTowns(s) {
      s.showTowns = !s.showTowns;
    },
    toggleForest(s) {
      s.showForest = !s.showForest;
    },
    toggleRivers(s) {
      s.showRivers = !s.showRivers;
    },
    toggleLakes(s) {
      s.showLakes = !s.showLakes;
    },
  },
});
