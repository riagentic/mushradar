// Entry — cells self-register on import; boot fetches location + weather + radar.
import { aio } from "aio";
import { geo, radar, weather } from "./cell.ts";

// No usable GPU → Chromium may fall back to SwiftShader (CPU WebGL; the map
// then shows "SW rendering"). A real GPU is still used first. macOS without
// Metal cannot run SwiftShader either — Map3D then draws the flat 2D map.
// An operator-set AIO_ELECTRON_ARGS wins.
if (!Deno.env.get("AIO_ELECTRON_ARGS")) {
  Deno.env.set("AIO_ELECTRON_ARGS", "--enable-unsafe-swiftshader");
}

// aio-ok: a local single-user app — every client may see every key.
await aio.run({
  appId: "mushradar", // data lives in ~/.mushradar — never rename
  ui: {
    theme: "auto", // the look lives in src/aio-theme.css (am theme adopt)
    title: "Mushradar",
    chrome: "themed",
    width: 1400,
    height: 900,
  },
  // Hourly checks; weather.refresh() itself skips data younger than STALE_MS,
  // so a restart or a tick never spends Open-Meteo quota on fresh data.
  schedules: [
    { id: "wx-hourly", every: 3_600_000, action: weather.refresh.action() },
    { id: "radar-hourly", every: 3_600_000, action: radar.refresh.action() },
  ],
  onStart: () => {
    void weather.refresh();
    void radar.refresh();
    void geo.locate();
  },
});
