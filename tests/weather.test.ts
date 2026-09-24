import { assert, assertEquals } from "@std/assert";
import { until } from "aio";
import { bootCells, testCell } from "aio/testing";
import {
  homeKey,
  isMinuteLimit,
  MANUAL_MIN_AGE_MS,
  migrateWeather,
  MINUTE_RETRY_MS,
  STALE_MS,
  weather,
} from "../src/cell/weather.ts";
import {
  buildUrl,
  FORECAST_DAYS,
  PAST_DAYS,
  type Point,
  toStation,
} from "../src/server/openmeteo.server.ts";
import { TOWNS } from "../src/data/towns.ts";
import { station } from "./fixtures.ts";

const IO = "../server/openmeteo.server.ts";

/** A fake Open-Meteo module that records every batch it was asked for. */
const fakeIo = (fail = "") => {
  const calls: Point[][] = [];
  const fetchStations = (pts: readonly Point[]) => {
    calls.push([...pts]);
    return fail ? Promise.reject(new Error(fail)) : Promise.resolve(
      pts.map((p) => ({ ...station(p.id, p.lat, p.lon), name: p.name })),
    );
  };
  return { calls, io: { fetchStations } };
};

Deno.test("weather: fetches once, then serves fresh data without the API", async () => {
  const { calls, io } = fakeIo();
  await using _h = await bootCells([weather], { stub: { [IO]: io } });
  assertEquals(await weather.refresh(), true);
  assertEquals(weather.stations.length, TOWNS.length);
  assertEquals(await weather.refresh(), false, "fresh data is not refetched");
  assertEquals(await weather.refresh(MANUAL_MIN_AGE_MS), false);
  assertEquals(await weather.refresh(0), true, "maxAge 0 forces a fetch");
  assertEquals(calls.length, 2);
  assertEquals(weather.busy, false);
});

Deno.test("weather: a new home makes fresh data stale and adds its station", async () => {
  const { calls, io } = fakeIo();
  await using h = await bootCells([weather], { stub: { [IO]: io } });
  await weather.refresh();
  await weather.setHome(49.2, 16.6, "Brno");
  await h.advance(50);
  assertEquals(calls.length, 2);
  assertEquals(
    calls[1].map((p) => p.id),
    ["home"],
    "fresh towns not refetched",
  );
  assertEquals(weather.stations.length, TOWNS.length + 1);
  assertEquals(weather.homeStation()?.name, "Brno");
  assertEquals(
    weather.fetchedFor,
    homeKey({ lat: 49.2, lon: 16.6, label: "" }),
  );
  // The same home again (every boot re-locates) costs nothing.
  await weather.setHome(49.2, 16.6, "Brno-město");
  await h.advance(50);
  assertEquals(calls.length, 2);
  assertEquals(weather.home?.label, "Brno-město");
});

Deno.test("weather: a boot relocate never aborts the running fetch", async () => {
  const calls: Point[][] = [];
  let release = () => {};
  const gate = new Promise<void>((r) => release = r);
  const io = {
    fetchStations: async (pts: readonly Point[]) => {
      calls.push([...pts]);
      if (calls.length === 1) await gate;
      return pts.map((p) => ({ ...station(p.id, p.lat, p.lon), name: p.name }));
    },
  };
  await using h = await bootCells([weather], { stub: { [IO]: io } });
  const boot = weather.refresh();
  await until(() => calls.length === 1, { timeoutMs: 2000 }); // in flight
  await weather.setHome(49.2, 16.6, "Brno");
  await h.advance(50);
  release();
  assertEquals(await boot, true, "the boot fetch completes");
  await until(() => calls.length === 2 && !weather.busy, { timeoutMs: 2000 });
  assertEquals(calls[0].length, TOWNS.length, "boot: towns only");
  assertEquals(calls[1].map((p) => p.id), ["home"], "then: home only");
  assertEquals(weather.fetchedFor, homeKey(weather.home));
  assertEquals(weather.error, "");
});

Deno.test("weather: the per-minute cap retries after a minute", async () => {
  let fail = "open-meteo: Minutely API request limit exceeded.";
  const calls: Point[][] = [];
  const io = {
    fetchStations: (pts: readonly Point[]) => {
      calls.push([...pts]);
      return fail ? Promise.reject(new Error(fail)) : Promise.resolve(
        pts.map((p) => ({ ...station(p.id, p.lat, p.lon), name: p.name })),
      );
    },
  };
  await using h = await bootCells([weather], { stub: { [IO]: io } });
  assertEquals(await weather.refresh(), false);
  fail = "";
  await h.advance(MINUTE_RETRY_MS);
  await until(() => calls.length === 2 && !weather.busy);
  assertEquals(weather.stations.length, TOWNS.length);
  assertEquals(weather.error, "");
  assert(isMinuteLimit("Minutely API request limit exceeded"));
  assert(!isMinuteLimit("Daily API request limit exceeded"), "daily: no retry");
});

Deno.test("weather: a failed fetch keeps the last good batch", async () => {
  const ok = fakeIo();
  {
    await using _h = await bootCells([weather], { stub: { [IO]: ok.io } });
    await weather.refresh();
  }
  const bad = fakeIo("open-meteo: Daily API request limit exceeded");
  await using _h = await bootCells([weather], { stub: { [IO]: bad.io } });
  assertEquals(await weather.refresh(0), false);
  assert(weather.error.includes("limit exceeded"));
  assertEquals(weather.busy, false);
});

testCell(
  weather,
  "setHome refuses bad coordinates and schedules a refresh",
  async (t) => {
    await t.expect.rejects(() => t.send.setHome(91, 0, "x"), /lat/);
    await t.expect.rejects(() => t.send.setHome(0, Number.NaN, "x"), /lon/);
    await t.expect.rejects(() => t.send.refresh(-1), /maxAgeMs/);
    t.send.setHome(50, 14, "Praha");
    t.expect.state((s) => s.home?.label === "Praha");
    t.expect.effects(["__schedule"]); // schedule.after → self("refresh")
  },
);

Deno.test("open-meteo: gaps never read as 0 °C, rain gaps read as dry", () => {
  const p = { id: "x", name: "X", lat: 50, lon: 14 };
  const st = toStation(p, {
    latitude: 50,
    longitude: 14,
    elevation: 250,
    daily: {
      time: ["2026-09-01", "2026-09-02", "2026-09-03"],
      temperature_2m_mean: [null, 12, null],
      temperature_2m_min: [5, null, 7],
      precipitation_sum: [null, 3, null],
    },
  });
  assertEquals(st.daily?.tmean, [12, 12, 12]);
  assertEquals(st.daily?.tmin, [5, 5, 7]);
  assertEquals(st.daily?.rain, [0, 3, 0]);
  assertEquals(st.elev, 250);
  assertEquals(st.current, null);
});

Deno.test("open-meteo: the request covers exactly the window the app reads", () => {
  const url = new URL(buildUrl([{ id: "a", name: "A", lat: 50, lon: 14 }]));
  assertEquals(url.searchParams.get("past_days"), String(PAST_DAYS));
  assertEquals(url.searchParams.get("forecast_days"), String(FORECAST_DAYS));
  // Quota: every point, every STALE_MS, a day long, keeps under 60 % of
  // Open-Meteo's free 10 000 calls/day.
  const vars = url.searchParams.get("daily")!.split(",").length +
    url.searchParams.get("current")!.split(",").length;
  const perPoint = (vars / 10) * ((PAST_DAYS + FORECAST_DAYS) / 14);
  const perDay = (TOWNS.length + 1) * perPoint * (86_400_000 / STALE_MS);
  assert(perDay < 6_000, `${Math.round(perDay)} calls/day`);
});

Deno.test("weather: stored v1 and v2 slices migrate to the v3 shape", () => {
  const v1: Record<string, unknown> = {
    stations: [],
    home: null,
    fetchedAt: 5,
    todayIso: "2026-09-15",
  };
  assertEquals(migrateWeather(v1, 1), {
    stations: [],
    home: null,
    fetchedAt: 5,
    fetchedFor: "",
  });
  const v2 = { ...v1, fetchedFor: "50.000,14.000" };
  assertEquals(migrateWeather(v2, 2).fetchedFor, "50.000,14.000");
  assertEquals("todayIso" in migrateWeather(v2, 2), false);
  const v3: Record<string, unknown> = { stations: [], fetchedFor: "x" };
  assertEquals(migrateWeather(v3, 3), v3);
});
