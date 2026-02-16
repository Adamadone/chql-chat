/** Cubic ease-out: fast start, smooth deceleration. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
