// Geo cell — where the user is. Default Prague; IP fix on boot and on demand.
import { cell, serverImport } from "aio";
import { weather } from "./weather.ts";

export type Source = "default" | "ip";
type Io = typeof import("../server/geoip.server.ts");

export const geo = cell("geo", {
  version: 1,
  onMigrate: (s) => s,
  state: {
    lat: 50.0755,
    lon: 14.4378,
    label: "Praha",
    source: "default" as Source,
    busy: false,
    error: "",
  },
  persist: { exclude: ["busy", "error"] },
  // A second click joins the running lookup instead of starting another.
  concurrency: { locate: "first" },
  methods: {
    /** IP geolocation on the server, then hand the fix to the weather cell. */
    async locate(s) {
      s.busy = true;
      s.error = "";
      try {
        const io = await serverImport<Io>(
          "../server/geoip.server.ts",
          import.meta.url,
        );
        const fix = await io.fetchIpFix(s.$signal);
        if (s.$signal.aborted) return;
        s.lat = fix.lat;
        s.lon = fix.lon;
        s.label = fix.label;
        s.source = "ip";
        await weather.setHome(fix.lat, fix.lon, fix.label);
      } catch (e) {
        if (s.$signal.aborted) return;
        s.error = e instanceof Error ? e.message : String(e);
      } finally {
        if (!s.$signal.aborted) s.busy = false;
      }
    },
  },
});
