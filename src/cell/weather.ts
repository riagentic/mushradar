// Weather cell — stations (major towns + home), each with PAST_DAYS back,
// 14 days ahead and the current reading. Server fetches; clients read.
import { cell, schedule, self, serverImport } from "aio";
import { TOWNS } from "../data/towns.ts";
import type { Station } from "../model/weather.ts";

export type Home = { lat: number; lon: number; label: string };
type Io = typeof import("../server/openmeteo.server.ts");

/** Data younger than this is fresh: ~8 fetches a day stay inside
 *  Open-Meteo's free 10 000 calls/day (one fetch ≈ 520 calls). */
export const STALE_MS = 3 * 3_600_000;
/** The floor for a manual refresh — a button must not burn the quota. */
export const MANUAL_MIN_AGE_MS = 10 * 60_000;

/** Which home a batch was fetched for; a new home makes any batch stale. */
export const homeKey = (h: Home | null): string =>
  h ? `${h.lat.toFixed(3)},${h.lon.toFixed(3)}` : "";

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** v2: + fetchedFor · v3: − todayIso (never read). Pure; exported for tests. */
export const migrateWeather = <S extends Record<string, unknown>>(
  s: S,
  from: number,
): S => {
  if (from >= 3) return s;
  const { todayIso: _, ...rest } = s;
  return {
    ...rest,
    fetchedFor: from < 2 ? "" : rest.fetchedFor,
  } as unknown as S;
};

export const weather = cell("weather", {
  version: 3,
  onMigrate: migrateWeather,
  state: {
    stations: [] as Station[],
    home: null as Home | null,
    fetchedAt: 0,
    /** homeKey(home) of the stored batch */
    fetchedFor: "",
    error: "",
    busy: false,
  },
  persist: { exclude: ["busy", "error"] },
  concurrency: { refresh: "newest" },
  args: {
    setHome: [
      (v) => (isNum(v) && Math.abs(v) <= 90) || "lat out of range",
      (v) => (isNum(v) && Math.abs(v) <= 180) || "lon out of range",
      (v) => typeof v === "string" || "label must be a string",
    ],
    refresh: [(v) => v === undefined || (isNum(v) && v >= 0) || "maxAgeMs"],
  },
  methods: {
    /** Where "home" is. A change re-fetches on the next tick. */
    setHome(s, lat: number, lon: number, label: string) {
      s.home = { lat, lon, label };
      s.$do(schedule.after("weather:home", 50, self("refresh")));
    },
    /** Fetch unless the stored batch is younger than `maxAgeMs` and was
     *  fetched for the current home. Returns whether it fetched. */
    async refresh(s, maxAgeMs: number = STALE_MS): Promise<boolean> {
      const home = s.home;
      const key = homeKey(home);
      if (s.fetchedFor === key && Date.now() - s.fetchedAt < maxAgeMs) {
        return false;
      }
      s.busy = true;
      try {
        const io = await serverImport<Io>(
          "../server/openmeteo.server.ts",
          import.meta.url,
        );
        const pts = [
          ...(home
            ? [{ id: "home", name: home.label, lat: home.lat, lon: home.lon }]
            : []),
          ...TOWNS,
        ];
        const stations = await io.fetchStations(pts, s.$signal);
        if (s.$signal.aborted) return false;
        s.stations = stations;
        s.fetchedAt = Date.now();
        s.fetchedFor = key;
        s.error = "";
        return true;
      } catch (e) {
        if (s.$signal.aborted) return false;
        s.error = e instanceof Error ? e.message : String(e);
        return false;
      } finally {
        // A superseding call owns `busy` now; clearing it would flicker.
        if (!s.$signal.aborted) s.busy = false;
      }
    },
  },
  selectors: {
    homeStation: (s) => s.stations.find((x) => x.id === "home") ?? null,
  },
});
