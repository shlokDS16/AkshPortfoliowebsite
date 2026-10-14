import { describe, expect, it } from "vitest";
import { axisValues, defaultStep, gridPoints, gridSize } from "./sensitivity";

describe("defaultStep: 0.5 percentage point for a percent cell, else 5% of the value", () => {
  it("percent", () => {
    expect(defaultStep(0.115, "0.0%")).toBe(0.005);
    expect(defaultStep(0.4, "0%")).toBe(0.005);
  });

  it("5 percent of the value, whatever its sign, without floating dust", () => {
    expect(defaultStep(200, "#,##0")).toBe(10);
    expect(defaultStep(-80, null)).toBe(4);
    expect(defaultStep(0.7, "0.00")).toBe(0.035);
  });

  it("a value of zero falls back to a step of 1", () => {
    expect(defaultStep(0, "0.00")).toBe(1);
  });
});

describe("gridSize: 5 x 5, or 3 x 3 on a phone", () => {
  it("switches below 480 px", () => {
    expect(gridSize(479)).toBe(3);
    expect(gridSize(480)).toBe(5);
    expect(gridSize(1280)).toBe(5);
    expect(gridSize(0)).toBe(3);
  });
});

describe("axisValues: centred on the current value", () => {
  it("five values around 0.115 in half-point steps", () => {
    expect(axisValues(0.115, 0.005, 5)).toEqual([0.105, 0.11, 0.115, 0.12, 0.125]);
  });

  it("three values", () => {
    expect(axisValues(100, 5, 3)).toEqual([95, 100, 105]);
  });

  it("a step Aksh typed replaces the default", () => {
    expect(axisValues(1, 0.25, 3)).toEqual([0.75, 1, 1.25]);
  });
});

describe("gridPoints: the cells of the grid, row by row", () => {
  it("5 x 5 is 25 points with the current scenario in the middle", () => {
    const points = gridPoints({ value: 0.115, step: 0.005 }, { value: 100, step: 5 }, 5);
    expect(points).toHaveLength(25);
    expect(points[12]).toEqual({ row: 2, col: 2, a: 0.115, b: 100 });
    expect(points[0]).toEqual({ row: 0, col: 0, a: 0.105, b: 90 });
    expect(points[24]).toEqual({ row: 4, col: 4, a: 0.125, b: 110 });
  });

  it("3 x 3 is 9 points", () => {
    expect(gridPoints({ value: 1, step: 1 }, { value: 2, step: 1 }, 3)).toHaveLength(9);
  });
});
