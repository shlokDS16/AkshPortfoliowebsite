import type { CasePoint } from "@/modules/casefile/client";

// The drawing's own coordinate box. The SVG stretches to its container (preserveAspectRatio none) with non-scaling strokes, so
// nothing here is a font size and the lines keep their weight on a 375 px screen. No value is ever turned into text.
const W = 1000;
const H = 400;
const PAD_X = 8;
const PAD_Y = 24;
const DAY = 86_400_000;

export type CaseChartGeometry = {
  width: number; height: number; share: string; index: string; baselineY: number; baselineTop: number; grid: number[];
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Two polylines on a shared scale: x by calendar days, y by value with some air above and below. The 100 baseline is where both start. */
export function buildCaseChartGeometry(points: readonly CasePoint[]): CaseChartGeometry {
  const t0 = Date.parse(points[0].d);
  const span = Math.max(1, (Date.parse(points[points.length - 1].d) - t0) / DAY);
  const values = [100, ...points.flatMap((p) => [p.share, p.index])];
  const [min, max] = [Math.min(...values), Math.max(...values)];
  const air = Math.max((max - min) * 0.12, 2);
  const [lo, hi] = [min - air, max + air];
  const x = (d: string) => PAD_X + (((Date.parse(d) - t0) / DAY) / span) * (W - 2 * PAD_X);
  const y = (v: number) => PAD_Y + ((hi - v) / (hi - lo)) * (H - 2 * PAD_Y);
  const line = (pick: (p: CasePoint) => number) => points.map((p) => `${round(x(p.d))},${round(y(pick(p)))}`).join(" ");
  const baselineY = round(y(100));
  return {
    width: W, height: H, share: line((p) => p.share), index: line((p) => p.index), baselineY, baselineTop: round((baselineY / H) * 100),
    grid: [0.25, 0.5, 0.75].map((f) => round(PAD_Y + f * (H - 2 * PAD_Y))),
  };
}
