// Tiny pure helpers shared by the model and the map.
export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

/** 0 below `a`, 1 above `b`, smooth in between. */
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Trapezoid: 0 at `z0`, 1 between `lo`..`hi`, 0 at `z1`. */
export const trapezoid = (
  v: number,
  [z0, lo, hi, z1]: readonly [number, number, number, number],
): number =>
  v <= z0 || v >= z1
    ? 0
    : v < lo
    ? (v - z0) / (lo - z0)
    : v <= hi
    ? 1
    : (z1 - v) / (z1 - hi);

/** Deterministic 0..1 hash of an integer — jitter without Math.random. */
export const hash01 = (n: number, salt = 0): number => {
  let x = (n * 374761393 + salt * 668265263) | 0;
  x = ((x ^ (x >>> 13)) * 1274126177) | 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

export const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
