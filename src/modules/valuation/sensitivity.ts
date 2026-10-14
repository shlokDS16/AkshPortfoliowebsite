import { isPercentFormat } from "./format";

// The sensitivity grid (spec s7.3): one result, two inputs, a square of values around the current scenario. Pure and browser-safe.

const clean = (n: number): number => Number(n.toPrecision(12));

/** 0.5 percentage point for a percent-formatted cell, else 5% of the value (1 when the value is zero). */
export function defaultStep(value: number, z: string | null): number {
  if (isPercentFormat(z)) return 0.005;
  return value === 0 ? 1 : clean(Math.abs(value) * 0.05);
}

/** 5 x 5, or 3 x 3 below 480 px. */
export const gridSize = (viewportWidth: number): 3 | 5 => (viewportWidth < 480 ? 3 : 5);

/** `size` values centred on `center`, `step` apart. */
export function axisValues(center: number, step: number, size: number): number[] {
  const mid = (size - 1) / 2;
  return Array.from({ length: size }, (_, i) => clean(center + (i - mid) * step));
}

export type GridPoint = { row: number; col: number; a: number; b: number };

/** Every point of the grid, row by row: `a` varies along the rows, `b` along the columns. 25 points (or 9) for the engine to evaluate. */
export function gridPoints(a: { value: number; step: number }, b: { value: number; step: number }, size: number): GridPoint[] {
  const as = axisValues(a.value, a.step, size);
  const bs = axisValues(b.value, b.step, size);
  return as.flatMap((av, row) => bs.map((bv, col) => ({ row, col, a: av, b: bv })));
}
