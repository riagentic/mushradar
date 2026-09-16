// Server-only: RainViewer public radar catalogue (frames, not pixels).
export type Frame = { time: number; path: string };
export type Catalogue = { host: string; past: Frame[]; nowcast: Frame[] };

type Raw = {
  host?: string;
  radar?: { past?: Frame[]; nowcast?: Frame[] };
};

export const parseCatalogue = (r: Raw): Catalogue => ({
  host: r.host ?? "https://tilecache.rainviewer.com",
  past: (r.radar?.past ?? []).map((f) => ({ time: f.time, path: f.path })),
  nowcast: (r.radar?.nowcast ?? []).map((f) => ({
    time: f.time,
    path: f.path,
  })),
});

export const fetchCatalogue = async (
  signal?: AbortSignal,
): Promise<Catalogue> => {
  const res = await fetch(
    "https://api.rainviewer.com/public/weather-maps.json",
    {
      signal,
    },
  );
  if (!res.ok) throw new Error(`rainviewer: HTTP ${res.status}`);
  return parseCatalogue(await res.json());
};
