// Calendar helpers — pure, timezone passed in so tests are deterministic.
export const MAX_DAY_OFFSET = 14;

/** ISO date (YYYY-MM-DD) of `ms` in Prague. */
export const isoDate = (ms: number, tz = "Europe/Prague"): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));

/** Today's ISO date in Prague, from the wall clock. */
export const todayIso = (tz = "Europe/Prague"): string =>
  isoDate(Date.now(), tz);

/** Whole days from `a` to `b` (both ISO dates); negative when `b` precedes. */
export const daysBetween = (a: string, b: string): number =>
  Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000,
  );

/** ISO date `days` after an ISO date. */
export const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Day of year 1..366 for an ISO date. */
export const dayOfYear = (iso: string): number => {
  const d = new Date(`${iso}T12:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000) + 1;
};

/** "Mon 14 Sep" / "po 14. 9." style label. */
export const prettyDate = (iso: string, locale = "en-GB"): string =>
  new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));

export const weekday = (iso: string, locale = "en-GB"): string =>
  new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" })
    .format(new Date(`${iso}T12:00:00Z`));
