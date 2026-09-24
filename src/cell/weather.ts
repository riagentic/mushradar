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
/** Open-Meteo's per-minute cap clears within a minute: retry just after. */
export const MINUTE_RETRY_MS = 65_000;

/** A refusal that waiting a minute fixes (the daily cap is not one). */
export const isMinuteLimit = (msg: string): boolean => /minutely/i.test(msg);

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
  // Queue, never abort: an aborted fetch has already spent its quota, and a
  // queued call re-checks freshness (a new home then costs one point).
  concurrency: { refresh: "queue" },
  args: {
    setHome: [
      (v) => (isNum(v) && Math.abs(v) <= 90) || "lat out of range",
      (v) => (isNum(v) && Math.abs(v) <= 180) || "lon out of range",
      (v) => typeof v === "string" || "label must be a string",
    ],
    refresh: [(v) => v === undefined || (isNum(v) && v >= 0) || "maxAgeMs"],
  },
  methods: {
    /** Where "home" is. A change re-fetches on the next tick; the same
     *  place again (every boot re-locates) only renames it. */
    setHome(s, lat: number, lon: number, label: string) {
      const next = { lat, lon, label };
      if (s.home && homeKey(s.home) === homeKey(next)) {
        s.home.label = label;
        return;
      }
      s.home = next;
      s.$do(schedule.after("weather:home", 50, self("refresh")));
    },
    /** Fetch unless the stored batch is younger than `maxAgeMs` and was
     *  fetched for the current home. Fresh towns + a new home fetch only the
     *  home point. Returns whether it fetched. */
    async refresh(s, maxAgeMs: number = STALE_MS): Promise<boolean> {
      const home = s.home;
      const key = homeKey(home);
      const townsFresh = Date.now() - s.fetchedAt < maxAgeMs;
      if (s.fetchedFor === key && townsFresh) return false;
      s.busy = true;
      try {
        const io = await serverImport<Io>(
          "../server/openmeteo.server.ts",
          import.meta.url,
        );
        const own = home
          ? [{ id: "home", name: home.label, lat: home.lat, lon: home.lon }]
          : [];
        const got = await io.fetchStations(
          townsFresh ? own : [...own, ...TOWNS],
          s.$signal,
        );
        if (s.$signal.aborted) return false;
        if (townsFresh) {
          // Mutate, don't replace: one patch, not the whole station list.
          // aio-ok: the post-await list is the one to patch (refresh queues).
          const i = s.stations.findIndex((x) => x.id === "home");
          if (i >= 0) s.stations.splice(i, 1);
          if (got[0]) s.stations.unshift(got[0]);
        } else {
          s.stations = got;
          s.fetchedAt = Date.now();
        }
        s.fetchedFor = key;
        s.error = "";
        return true;
      } catch (e) {
        if (s.$signal.aborted) return false;
        const msg = e instanceof Error ? e.message : String(e);
        s.error = msg;
        if (isMinuteLimit(msg)) {
          s.$do(
            schedule.after("weather:retry", MINUTE_RETRY_MS, self("refresh")),
          );
        }
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
