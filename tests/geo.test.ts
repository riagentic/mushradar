import { assertEquals, assertThrows } from "@std/assert";
import { bootCells } from "aio/testing";
import { geo } from "../src/cell/geo.ts";
import { weather } from "../src/cell/weather.ts";
import { type Fix, parseFix } from "../src/server/geoip.server.ts";

const IO = "../server/geoip.server.ts";
const noWeather = {
  "../server/openmeteo.server.ts": { fetchStations: () => Promise.resolve([]) },
};

const boot = (fetchIpFix: () => Promise<Fix>) =>
  bootCells([geo, weather], {
    stub: { [IO]: { fetchIpFix }, ...noWeather },
  });

Deno.test("geo: an IP fix moves the user and the weather home", async () => {
  await using _h = await boot(() =>
    Promise.resolve({ lat: 49.19, lon: 16.61, label: "Brno" })
  );
  assertEquals(geo.source, "default");
  await geo.locate();
  assertEquals([geo.lat, geo.lon, geo.label, geo.source], [
    49.19,
    16.61,
    "Brno",
    "ip",
  ]);
  assertEquals(weather.home, { lat: 49.19, lon: 16.61, label: "Brno" });
  assertEquals([geo.busy, geo.error], [false, ""]);
});

Deno.test("geo: a failed lookup keeps the old place and says why", async () => {
  await using _h = await boot(() => Promise.reject(new Error("offline")));
  await geo.locate();
  assertEquals([geo.label, geo.source], ["Praha", "default"]);
  assertEquals([geo.busy, geo.error], [false, "offline"]);
  assertEquals(weather.home, null);
});

Deno.test("ip-api: only a complete success is a fix", () => {
  assertEquals(
    parseFix({
      status: "success",
      lat: 50,
      lon: 14,
      city: "",
      regionName: "Kraj",
    }),
    { lat: 50, lon: 14, label: "Kraj" },
  );
  assertThrows(
    () => parseFix({ status: "fail", message: "reserved range" }),
    Error,
    "reserved range",
  );
  assertThrows(() => parseFix({ status: "success" }), Error, "failed");
});
