import { assertEquals } from "@std/assert";
import { bootCells } from "aio/testing";
import { radar } from "../src/cell/radar.ts";
import {
  type Catalogue,
  parseCatalogue,
} from "../src/server/rainviewer.server.ts";

const IO = "../server/rainviewer.server.ts";

const boot = (fetchCatalogue: () => Promise<Catalogue>) =>
  bootCells([radar], { stub: { [IO]: { fetchCatalogue } } });

Deno.test("radar: a catalogue replaces the frames", async () => {
  await using _h = await boot(() =>
    Promise.resolve({
      host: "https://h",
      past: [{ time: 1, path: "/a" }, { time: 2, path: "/b" }],
      nowcast: [{ time: 3, path: "/c" }],
    })
  );
  await radar.refresh();
  assertEquals(radar.host, "https://h");
  assertEquals(radar.past.map((f) => f.path), ["/a", "/b"]);
  assertEquals(radar.nowcast.length, 1);
  assertEquals([radar.busy, radar.error], [false, ""]);
  assertEquals(radar.fetchedAt > 0, true);
});

Deno.test("radar: a failure keeps the frames and reports", async () => {
  await using _h = await boot(() => Promise.reject(new Error("HTTP 503")));
  await radar.refresh();
  assertEquals(radar.past, []);
  assertEquals([radar.busy, radar.error], [false, "HTTP 503"]);
});

Deno.test("rainviewer: parse keeps only time + path", () => {
  const c = parseCatalogue({
    radar: {
      past: [{ time: 1, path: "/a", extra: 1 } as never],
    },
  });
  assertEquals(c, {
    host: "https://tilecache.rainviewer.com",
    past: [{ time: 1, path: "/a" }],
    nowcast: [],
  });
});
