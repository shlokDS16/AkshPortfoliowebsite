import { describe, expect, it } from "vitest";
import { EXHIBIT } from "@/test/fixtures/desk-ui";
import { buildGeometry } from "./chart-geometry";

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
      series: [{ ...EXHIBIT.chart.series[0], points: EXHIBIT.chart.series[0].points.map((p, i) => (i === 4 ? { ...p, y: null, withheld: true } : p)) }],
    };
    const withheld = buildGeometry(data, 640, 240);
    expect(withheld.series[0].points).toHaveLength(4);
    expect(withheld.withheldFromX).toBe(withheld.xAt(4));
  });

  it("rule 3: a withheld point is dropped even when the data still carries its value", () => {
    const data = {
      ...EXHIBIT.chart,
      series: [{ ...EXHIBIT.chart.series[0], points: EXHIBIT.chart.series[0].points.map((p, i) => (i === 4 ? { ...p, withheld: true } : p)) }],
    };
    const leaked = buildGeometry(data, 640, 240);
    expect(leaked.series[0].points).toHaveLength(4);
    expect(leaked.series[0].points.map((p) => p.value)).not.toContain(142);
    expect(leaked.series[0].d).not.toContain(`${leaked.xAt(4).toFixed(1)} `);
  });
});
