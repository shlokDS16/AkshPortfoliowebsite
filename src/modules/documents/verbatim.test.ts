import { describe, expect, it } from "vitest";
import { normaliseText, onPage, parsePrinted, valueOnPage } from "./verbatim";

const PAGE = "Revenue from operations 1,284.00 1,102.00";

describe("onPage", () => {
  it("finds a printed figure, with or without its separators", () => {
    expect(onPage("1,284.00", PAGE)).toBe(true);
    expect(onPage("1284.00", PAGE)).toBe(true);
  });
  it("needs a figure to stand alone", () => {
    expect(onPage("1284", PAGE)).toBe(false);
    expect(onPage("284.00", PAGE)).toBe(false);
    expect(onPage("41.70", "Finance costs 41.20 38.90")).toBe(false);
    expect(onPage("41.2", "Finance costs 41.20 38.90")).toBe(false);
  });
  it("matches a bracketed loss as printed", () => {
    expect(onPage("(1,234.50)", "Loss (1,234.50) (980.00)")).toBe(true);
    expect(onPage("(1,234.50)", "Loss 1,234.50 (980.00)")).toBe(false);
  });
  it("ignores double spaces, NBSP, case and dash style in text", () => {
    expect(onPage("Revenue from operations", "REVENUE  from operations 1,284.00")).toBe(true);
    expect(onPage("Revenue – total", "revenue - total")).toBe(true);
    expect(onPage("Revenue from operations 1,284.00 1,102.00", "Revenue from operations  1,284.00 1,102.00")).toBe(true);
  });
  it("treats an empty needle as not found", () => {
    expect(onPage("   ", PAGE)).toBe(false);
  });
  it("finds a phrase only when it is there", () => {
    expect(onPage("Gross margin", PAGE)).toBe(false);
  });
});

describe("normaliseText", () => {
  it("folds quotes, dashes and spacing", () => {
    expect(normaliseText("  “It’s” − 5  ")).toBe('"it\'s" - 5');
  });
});

describe("parsePrinted", () => {
  it("reads Indian grouping, brackets, true minus and a rupee sign", () => {
    expect(parsePrinted("1,28,400")).toBe(128400);
    expect(parsePrinted("(1,234.50)")).toBe(-1234.5);
    expect(parsePrinted("−12.5")).toBe(-12.5);
    expect(parsePrinted("₹ 45")).toBe(45);
  });
  it("gives null for a dash, Nil or words", () => {
    expect(parsePrinted("-")).toBeNull();
    expect(parsePrinted("Nil")).toBeNull();
    expect(parsePrinted("")).toBeNull();
    expect(parsePrinted("n/a")).toBeNull();
  });
});

describe("valueOnPage", () => {
  it("matches the same number in other print", () => {
    expect(valueOnPage("1284", PAGE)).toBe(true);
    expect(valueOnPage("1102", PAGE)).toBe(true);
    expect(valueOnPage("-1234.5", "Loss (1,234.50) (980.00)")).toBe(true);
  });
  it("does not match a different number, a sign flip or nothing", () => {
    expect(valueOnPage("1285", PAGE)).toBe(false);
    expect(valueOnPage("1234.5", "Loss (1,234.50)")).toBe(false);
    expect(valueOnPage("", PAGE)).toBe(false);
    expect(valueOnPage("n/a", PAGE)).toBe(false);
  });
});
