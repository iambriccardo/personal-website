/** Numeric helpers shared by the ASCII renderers and interface code. */

export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value))

export const mix = (a: number, b: number, amount: number) =>
  a + (b - a) * amount

/**
 * Deterministic pseudo-random value in [0, 1) derived from a numeric seed.
 * Every ASCII field, particle, and packet uses this so layouts are stable
 * across frames and rebuilds.
 */
export const random = (seed: number) => {
  const x = Math.sin(seed * 913.73) * 43758.5453
  return x - Math.floor(x)
}
