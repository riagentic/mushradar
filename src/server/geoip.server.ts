// Server-only: where is this machine? IP geolocation, no key needed.
export type Fix = { lat: number; lon: number; label: string };

type Raw = {
  status?: string;
  message?: string;
  lat?: number;
  lon?: number;
  city?: string;
  regionName?: string;
};

/** Raw ip-api record → a fix, or a reason. Pure; exported for tests. */
export const parseFix = (r: Raw): Fix => {
  if (
    r.status !== "success" || !Number.isFinite(r.lat) ||
    !Number.isFinite(r.lon)
  ) {
    throw new Error(
      `ip geolocation failed${r.message ? `: ${r.message}` : ""}`,
    );
  }
  return { lat: r.lat!, lon: r.lon!, label: r.city || r.regionName || "?" };
};

export const fetchIpFix = async (signal?: AbortSignal): Promise<Fix> => {
  // ip-api's free tier is HTTP only; nothing sensitive is sent or trusted.
  const res = await fetch(
    "http://ip-api.com/json/?fields=status,message,lat,lon,city,regionName",
    { signal },
  );
  if (!res.ok) throw new Error(`ip geolocation: HTTP ${res.status}`);
  return parseFix(await res.json());
};
