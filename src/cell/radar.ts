// Radar cell — the RainViewer frame catalogue (the header's radar status).
import { cell, serverImport } from "aio";
import type { Frame } from "../server/rainviewer.server.ts";

type Io = typeof import("../server/rainviewer.server.ts");

export const radar = cell("radar", {
  version: 1,
  onMigrate: (s) => s,
  state: {
    host: "https://tilecache.rainviewer.com",
    past: [] as Frame[],
    nowcast: [] as Frame[],
    fetchedAt: 0,
    error: "",
    busy: false,
  },
  persist: { exclude: ["busy", "error"] },
  concurrency: { refresh: "newest" },
  methods: {
    async refresh(s) {
      s.busy = true;
      try {
        const io = await serverImport<Io>(
          "../server/rainviewer.server.ts",
          import.meta.url,
        );
        const c = await io.fetchCatalogue(s.$signal);
        if (s.$signal.aborted) return;
        s.host = c.host;
        s.past = c.past;
        s.nowcast = c.nowcast;
        s.fetchedAt = Date.now();
        s.error = "";
      } catch (e) {
        if (s.$signal.aborted) return;
        s.error = e instanceof Error ? e.message : String(e);
      } finally {
        if (!s.$signal.aborted) s.busy = false;
      }
    },
  },
});
