import { describe, expect, it } from "vitest";
import { FIXTURE_CHART } from "@/test/fixtures/case-record";
import { buildCaseChartGeometry } from "./chart-geometry";

const coords = (attr: string) => attr.split(" ").map((p) => p.split(",").map(Number) as [number, number]);

describe("the rebased chart's geometry", () => {
  const g = buildCaseChartGeometry(FIXTURE_CHART.points);

  it("one vertex per point, x by calendar days, y inverted so a higher value is higher on the page", () => {
    const share = coords(g.share);
    const index = coords(g.index);
    expect(share).toHaveLength(3);
    expect(index).toHaveLength(3);
    expect(share[0][0]).toBeLessThan(share[1][0]);
    expect(share[1][0]).toBeLessThan(share[2][0]);
    // 13 Jan to 2 Mar is 48 of 154 days
    expect((share[1][0] - share[0][0]) / (share[2][0] - share[0][0])).toBeCloseTo(48 / 154, 2);
    expect(share[2][1]).toBeGreaterThan(share[0][1]); // 90.1 is below 100
    expect(index[2][1]).toBeLessThan(index[0][1]); // 104.7 is above 100
  });

  it("the 100 baseline sits where both series start, and the drawing stays inside its box", () => {
    expect(coords(g.share)[0][1]).toBeCloseTo(g.baselineY, 1);
    expect(coords(g.index)[0][1]).toBeCloseTo(g.baselineY, 1);
    expect(g.baselineTop).toBeCloseTo((g.baselineY / g.height) * 100, 1);
    for (const [x, y] of [...coords(g.share), ...coords(g.index)]) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(g.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(g.height);
    }
  });

  it("gridlines are plain y positions, evenly spaced, with no value attached", () => {
    expect(g.grid).toHaveLength(3);
    expect(Object.keys(g).sort()).toEqual(["baselineTop", "baselineY", "grid", "height", "index", "share", "width"]);
  });

  it("copes with a flat series and a single span of one day", () => {
    const flat = buildCaseChartGeometry([{ d: "2026-01-13", share: 100, index: 100 }, { d: "2026-01-14", share: 100, index: 100 }]);
    expect(flat.share.split(" ")).toHaveLength(2);
    expect(Number.isFinite(flat.baselineY)).toBe(true);
    expect(flat.share).not.toMatch(/NaN|Infinity/);
  });
});
