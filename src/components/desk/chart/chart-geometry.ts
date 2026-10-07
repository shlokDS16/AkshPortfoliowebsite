import { formatDate } from "@/lib/format";
import type { LineChartData } from "@/lib/view-types";

export const PAD = { left: 40, right: 16, top: 12, bottom: 24 } as const;

export type GeometryPoint = { x: number; y: number; label: string; value: number };
export type Geometry = {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  xs: string[];
  xAt(i: number): number;
  yAt(v: number): number;
  series: { kind: "subject" | "projection" | "benchmark"; label: string; d: string; points: GeometryPoint[] }[];
  withheldFromX: number | null;
  thresholds: { y: number; label: string }[];
  capX: number | null;
};

// A caption label (12 px) set 5 px above its line needs 16 px of headroom inside the viewBox.
const LABEL_HEADROOM = 16;

/** Threshold label baseline: above the line, or below it when the line sits too near the top to fit the label. */
export function thresholdLabelY(y: number): number {
  return y < LABEL_HEADROOM ? y + 15 : y - 5;
}

/** Even category spacing; the first and last y tick set the domain. Withheld or missing points break the line. */
export function buildGeometry(data: LineChartData, width: number, height: number): Geometry {
  const plot = { left: PAD.left, right: width - PAD.right, top: PAD.top, bottom: height - PAD.bottom };
  const xs = data.series[0]?.points.map((p) => p.x) ?? [];
  const [min, max] = [data.yTicks[0] ?? 0, data.yTicks[data.yTicks.length - 1] ?? 1];
  const step = xs.length > 1 ? (plot.right - plot.left) / (xs.length - 1) : 0;
  const xAt = (i: number) => plot.left + i * step;
  const yAt = (v: number) => plot.bottom - ((v - min) / (max - min || 1)) * (plot.bottom - plot.top);
  let withheldFromX: number | null = null;
  const series = data.series.map((s) => {
    const points: GeometryPoint[] = [];
    let d = "";
    let pen = false;
    s.points.forEach((p, i) => {
      if (p.withheld) withheldFromX = withheldFromX === null ? xAt(i) : Math.min(withheldFromX, xAt(i));
      if (p.y === null || p.withheld) {
        pen = false;
        return;
      }
      const pt = { x: xAt(i), y: yAt(p.y), label: p.x, value: p.y };
      points.push(pt);
      d += `${pen ? "L" : "M"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)} `;
      pen = true;
    });
    return { kind: s.kind, label: s.label, d: d.trim(), points };
  });
  const capIndex = data.dataCap ? xs.indexOf(data.dataCap.x) : -1;
  return {
    width,
    height,
    plot,
    xs,
    xAt,
    yAt,
    series,
    withheldFromX,
    thresholds: data.thresholds.map((t) => ({ y: yAt(t.y), label: t.label })),
    capX: capIndex >= 0 ? xAt(capIndex) : null,
  };
}

/**
 * The chart's accessible name. The author's summary may state a withheld figure, so when any point is withheld
 * it is replaced by fixed copy built from metadata only (rule 3).
 */
export function chartLabel(data: LineChartData): string {
  const dates = data.series.flatMap((s) => s.points.flatMap((p) => (p.withheld ? [p.withheldUntil] : [])));
  if (dates.length === 0) return data.summary;
  const earliest = dates.reduce((a, b) => (a <= b ? a : b));
  return `${data.series[0]?.label ?? "Chart"}: some values withheld until ${formatDate(earliest)}`;
}
