import { describe, expect, it } from "vitest";
import { CORE_LINES, classifyRow, normaliseLabel } from "./relevance";

const none = new Set<string>();
const keyOf = (label: string) => CORE_LINES.find((c) => c.match.test(normaliseLabel(label)))?.key;

describe("CORE_LINES", () => {
  it.each([
    ["Revenue from Operations", "revenue"],
    ["Total Income", "total-income"],
    ["Finance Costs", "finance-costs"],
    ["Finance cost", "finance-costs"],
    ["Depreciation and amortisation expense", "depreciation"],
    ["Depreciation & Amortization Expenses", "depreciation"],
    ["Profit before tax", "pbt"],
    ["Profit before exceptional items and tax", "pbt"],
    ["Profit for the year", "pat"],
    ["Net Profit after tax", "pat"],
    ["Net cash generated from operating activities", "cfo"],
    ["Net cash used in operating activities", "cfo"],
    ["Purchase of property, plant and equipment", "capex"],
    ["Acquisition of Property Plant and Equipment and intangibles", "capex"],
    ["Total borrowings", "borrowings"],
    ["Cash and cash equivalents", "cash"],
    ["Total Equity", "equity"],
    ["Trade Receivables", "receivables"],
    ["Inventories", "inventories"],
    ["Total trade payables", "payables"],
    ["Segment revenue", "segment-revenue"],
  ])("%s is the core line %s", (label, key) => {
    expect(keyOf(label)).toBe(key);
  });

  it("does not match a longer or different line", () => {
    expect(keyOf("Other income")).toBeUndefined();
    expect(keyOf("Revenue from operations (net of GST)")).toBeUndefined();
    expect(keyOf("Profit before tax from discontinued operations")).toBeUndefined();
  });
});

describe("normaliseLabel", () => {
  it.each([
    ["(a) Revenue from operations", "revenue from operations"],
    ["ii. Finance Costs", "finance costs"],
    ["1) Trade receivables", "trade receivables"],
    ["Revenue  from\u00a0operations ", "revenue from operations"],
    ["Cost of materials consumed*", "cost of materials consumed"],
  ])("%j -> %j", (label, want) => {
    expect(normaliseLabel(label)).toBe(want);
  });
});

describe("classifyRow", () => {
  it("calls a core line core, with its own topic whatever page it is on", () => {
    expect(classifyRow({ label: "Trade Receivables", current: 210.4, prior: 188.1 }, "bs", none)).toEqual({ reason: "core", topic: "Working capital", movedPct: null });
    expect(classifyRow({ label: "Finance costs", current: 41.7, prior: 38.9 }, "notes", none)).toEqual({ reason: "core", topic: "P&L", movedPct: null });
  });

  it("calls a label the case file already tracks label_match, under the page kind's topic", () => {
    const labels = new Set(["other income"]);
    expect(classifyRow({ label: "(b) Other Income", current: 5, prior: 5 }, "pl", labels)).toEqual({ reason: "label_match", topic: "P&L", movedPct: null });
    expect(classifyRow({ label: "Other income", current: 5, prior: 5 }, "mdna", labels)?.topic).toBe("Other figures");
  });

  it("proposes a non-core line that moved 25%, with the percentage", () => {
    expect(classifyRow({ label: "Legal fees", current: 125, prior: 100 }, "pl", none)).toEqual({ reason: "moved", topic: "P&L", movedPct: 25 });
    expect(classifyRow({ label: "Legal fees", current: 75, prior: 100 }, "pl", none)).toEqual({ reason: "moved", topic: "P&L", movedPct: -25 });
  });

  it("leaves a line that moved 10% alone, and one at exactly 20% is in", () => {
    expect(classifyRow({ label: "Legal fees", current: 110, prior: 100 }, "pl", none)).toBeNull();
    expect(classifyRow({ label: "Legal fees", current: 120, prior: 100 }, "pl", none)?.reason).toBe("moved");
  });

  it("is never moved when there is no prior or the prior is 0", () => {
    expect(classifyRow({ label: "Legal fees", current: 125, prior: 0 }, "pl", none)).toBeNull();
    expect(classifyRow({ label: "Legal fees", current: 125, prior: null }, "pl", none)).toBeNull();
  });

  it("measures the move against the size of a negative prior", () => {
    expect(classifyRow({ label: "Exchange loss", current: -50, prior: -100 }, "pl", none)?.movedPct).toBe(50);
  });
});
