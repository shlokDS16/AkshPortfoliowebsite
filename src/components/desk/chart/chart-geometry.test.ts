import { describe, expect, it } from "vitest";
import { EXHIBIT } from "@/test/fixtures/desk-ui";
import type { ChartPoint } from "@/lib/view-types";
import { buildGeometry, CAPTION_PX, chartLabel, LABEL_HEADROOM, PAD, thresholdLabelY } from "./chart-geometry";

describe("buildGeometry", () => {
  const g = buildGeometry(EXHIBIT.chart, 640, 240);

  it("spaces categories evenly inside the plot and maps the tick domain to the plot height", () => {
    expect(g.xs).toEqual(["FY22", "FY23", "FY24", "FY25", "FY26"]);
    expect(g.xAt(0)).toBe(g.plot.left);
    expect(g.xAt(4)).toBe(g.plot.right);
    expect(g.yAt(60)).toBe(g.plot.bottom);
    expect(g.yAt(180)).toBe(g.plot.top);
  });

  it("draws one subject path through every real point and places the threshold and the data cap", () => {
    const subject = g.series.find((s) => s.kind === "subject")!;
    expect(subject.points).toHaveLength(5);
    expect(subject.d.startsWith("M")).toBe(true);
    expect(subject.d.match(/L/g)).toHaveLength(4);
    expect(g.thresholds[0].y).toBeCloseTo(g.yAt(150));
    expect(g.capX).toBe(g.xAt(4));
  });

  it("breaks the line at withheld points and marks where the hatch starts", () => {
    const data = {
      ...EXHIBIT.chart,
      series: [{ ...EXHIBIT.chart.series[0], points: EXHIBIT.chart.series[0].points.map((p, i): ChartPoint => (i === 4 ? { x: p.x, y: null, withheld: true, withheldUntil: "2026-07-30" } : p)) }],
    };
    const withheld = buildGeometry(data, 640, 240);
    expect(withheld.series[0].points).toHaveLength(4);
    expect(withheld.withheldFromX).toBe(withheld.xAt(4));
  });

  it("the type forbids a withheld point that carries a number", () => {
    // @ts-expect-error rule 3: withheld: true requires y: null
    const bad: ChartPoint = { x: "FY26", y: 142, withheld: true, withheldUntil: "2026-07-30" };
    expect(bad.withheld).toBe(true);
  });

  it("hatch starts at the leftmost withheld x across series", () => {
    const base = EXHIBIT.chart.series[0];
    const hold = (index: number) => ({
      ...base,
      points: base.points.map((p, i): ChartPoint => (i === index ? { x: p.x, y: null, withheld: true, withheldUntil: "2026-07-30" } : p)),
    });
    const both = buildGeometry({ ...EXHIBIT.chart, series: [hold(4), { ...hold(3), kind: "benchmark", label: "Peer" }] }, 640, 240);
    expect(both.withheldFromX).toBe(both.xAt(3));
    const flipped = buildGeometry({ ...EXHIBIT.chart, series: [{ ...hold(3), kind: "benchmark", label: "Peer" }, hold(4)] }, 640, 240);
    expect(flipped.withheldFromX).toBe(flipped.xAt(3));
  });

  it("rule 3, second line of defence: a withheld point is dropped even if a number slips through the type", () => {
    const leaky = { x: "FY26", y: 142, withheld: true, withheldUntil: "2026-07-30" } as unknown as ChartPoint;
    const data = { ...EXHIBIT.chart, series: [{ ...EXHIBIT.chart.series[0], points: [...EXHIBIT.chart.series[0].points.slice(0, 4), leaky] }] };
    const leaked = buildGeometry(data, 640, 240);
    expect(leaked.series[0].points).toHaveLength(4);
    expect(leaked.series[0].points.map((p) => p.value)).not.toContain(142);
    expect(leaked.series[0].d).not.toContain(`${leaked.xAt(4).toFixed(1)} `);
  });
});

describe("chartLabel", () => {
  it("keeps the author's summary when nothing is withheld", () => {
    expect(chartLabel(EXHIBIT.chart)).toBe(EXHIBIT.chart.summary);
  });

  it("replaces the summary with fixed copy and the earliest clearing date when any point is withheld", () => {
    const base = EXHIBIT.chart.series[0];
    const hold = (index: number, until: string): ChartPoint[] =>
      base.points.map((p, i) => (i === index ? { x: p.x, y: null, withheld: true, withheldUntil: until } : p));
    const label = chartLabel({ ...EXHIBIT.chart, series: [{ ...base, points: hold(4, "2026-08-15") }, { ...base, kind: "benchmark", label: "Peer", points: hold(3, "2026-07-30") }] });
    expect(label).toBe("Receivable days: some values withheld until 30 Jul 2026");
    expect(label).not.toContain("142");
  });
});

describe("thresholdLabelY", () => {
  it("sits the label above its line, or below it when the line is the top tick (the label would clip)", () => {
    expect(thresholdLabelY(80)).toBe(75);
    expect(thresholdLabelY(LABEL_HEADROOM)).toBe(LABEL_HEADROOM - 5);
    expect(thresholdLabelY(LABEL_HEADROOM - 1)).toBe(LABEL_HEADROOM - 1 + 5 + CAPTION_PX);
    expect(thresholdLabelY(PAD.top)).toBeGreaterThan(PAD.top + CAPTION_PX);
    expect(LABEL_HEADROOM).toBeGreaterThan(PAD.top);
  });
});
