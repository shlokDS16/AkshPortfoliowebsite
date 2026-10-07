import { describe, expect, it } from "vitest";
import extractionFixtures from "@/lib/providers/fixtures/extraction.json";
import { extractionSchema, type Extraction } from "./prompts";
import { machineFactSchema } from "./proposed-fact";
import { buildProposals } from "./proposals";
import { normaliseLabel } from "./relevance";

// The page text is what pdf_text stores for the fixture annual report (scripts/make-fixture-pdf.mjs).
const PL_TEXT = [
  "Consolidated Statement of Profit and Loss for the year ended March 31, 2026",
  "(Rs. in crore)",
  "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
  "Revenue from operations 1,284.00 1,102.00",
  "Finance costs 41.20 38.90",
  "Profit for the year 152.60 118.30",
].join("\n");
const BS_TEXT = [
  "Consolidated Balance Sheet as at March 31, 2026",
  "(Rs. in crore)",
  "Particulars As at March 31, 2026 As at March 31, 2025",
  "Trade receivables 210.40 188.10",
  "Inventories 305.00 251.70",
].join("\n");

const fixture = (when: string): Extraction => {
  const entry = (extractionFixtures as { when: string; output: unknown }[]).find((e) => e.when.includes(when));
  return extractionSchema.parse(entry?.output);
};
const none = new Set<string>();
const base = { docBasis: "consolidated" as const, pageBasis: null, fileLabels: none };
const pl = (over: Partial<Extraction> = {}, text = PL_TEXT) =>
  buildProposals({ ...base, extraction: { ...fixture("Profit and Loss"), ...over }, pageNo: 4, pageText: text, pageKind: "pl" });

describe("buildProposals on the fixture pages", () => {
  const p4 = pl();
  const p5 = buildProposals({ ...base, extraction: fixture("Balance Sheet"), pageNo: 5, pageText: BS_TEXT, pageKind: "bs" });

  it("makes five proposals across the two pages", () => {
    expect(p4.map((p) => p.machineValue.label)).toEqual(["Revenue from operations", "Finance costs", "Profit for the year"]);
    expect(p5.map((p) => p.machineValue.label)).toEqual(["Trade receivables", "Inventories"]);
  });

  it("takes period, as-of date and unit from the printed headings, with the prior year", () => {
    for (const p of [...p4, ...p5]) {
      expect(p.machineValue).toMatchObject({ unit: "₹ cr", period: "FY26", asOf: "2026-03-31", basis: "consolidated" });
      expect(p.machineValue.prior).toMatchObject({ label: "FY25" });
      expect(machineFactSchema.safeParse(p.machineValue).success).toBe(true);
    }
    expect(p4[0].machineValue).toMatchObject({
      value: 1284, valueText: "1,284.00", locator: "p. 4", page: 4, topic: "P&L", statement: "pl", quote: "Revenue from operations 1,284.00 1,102.00",
      prior: { label: "FY25", value: 1102, valueText: "1,102.00" },
    });
    expect(p5[0].machineValue).toMatchObject({ locator: "p. 5", topic: "Working capital", statement: "bs" });
  });

  it("flags only the misread: finance costs says 41.70 where the page prints 41.20", () => {
    expect(p4.map((p) => [p.machineValue.label, p.flags])).toEqual([
      ["Revenue from operations", []],
      ["Finance costs", ["value_not_on_page"]],
      ["Profit for the year", []],
    ]);
    expect(p5.every((p) => p.flags.length === 0)).toBe(true);
  });

  it("keys a proposal by label, period and basis", () => {
    expect(p4[0].dedupeKey).toBe("revenue from operations|FY26|consolidated");
    expect(p4.every((p) => p.reason === "core" && p.movedPct === null)).toBe(true);
  });
});

describe("buildProposals: headings, units and what is dropped", () => {
  it("adds period_unknown and a page-scoped key when the heading names no period", () => {
    const out = pl({ current_header: "Particulars", prior_header: null });
    expect(out[0].flags).toContain("period_unknown");
    expect(out[0].machineValue).toMatchObject({ period: null, asOf: null });
    expect(out[0].dedupeKey).toBe("revenue from operations|?p4|consolidated");
    expect(machineFactSchema.safeParse(out[0].machineValue).success).toBe(true);
  });

  it("adds period_unknown when only the prior heading is unreadable, and keeps the prior with no label", () => {
    const out = pl({ prior_header: "Previous" });
    expect(out[0].flags).toEqual(["period_unknown"]);
    expect(out[0].machineValue.prior).toMatchObject({ label: null, value: 1102 });
  });

  it("adds unit_unknown, with no unit, when the unit line is not a rupee unit", () => {
    const out = pl({ unit_header: "(₹ in thousands)" });
    expect(out[0].flags).toEqual(["unit_unknown"]);
    expect(out[0].machineValue.unit).toBeNull();
  });

  it("drops a row whose current figure does not parse", () => {
    const rows = [{ label: "Total income", current_text: "n/a", prior_text: null, line: "Total income n/a" }, ...fixture("Profit and Loss").rows];
    expect(pl({ rows }).map((p) => p.machineValue.label)).not.toContain("Total income");
    expect(pl({ rows })).toHaveLength(3);
  });

  it("flags a quote that is not a printed line, and a prior that is not printed", () => {
    const rows = [{ label: "Revenue from operations", current_text: "1,284.00", prior_text: "1,100.00", line: "Revenue from operations (net) 1,284.00" }];
    expect(pl({ rows })[0].flags).toEqual(["quote_not_on_page", "prior_not_on_page"]);
  });

  it("proposes without a prior when there is no prior column or it prints a dash", () => {
    const rows = [
      { label: "Revenue from operations", current_text: "1,284.00", prior_text: null, line: "Revenue from operations 1,284.00 1,102.00" },
      { label: "Finance costs", current_text: "41.20", prior_text: "-", line: "Finance costs 41.20 38.90" },
    ];
    const out = pl({ rows });
    expect(out.map((p) => p.machineValue.prior)).toEqual([null, null]);
    expect(out.every((p) => p.flags.length === 0)).toBe(true);
  });

  it("reads brackets as negative", () => {
    const rows = [{ label: "Profit for the year", current_text: "(12.50)", prior_text: "3.00", line: "Profit for the year (12.50) 3.00" }];
    const text = `${PL_TEXT}\nProfit for the year (12.50) 3.00`;
    expect(pl({ rows }, text)[0].machineValue.value).toBe(-12.5);
  });

  it("cuts a label to 80 characters and a quote to 600 (labels are not verbatim-checked; the quote is)", () => {
    const label = `Finance costs ${"x".repeat(100)}`;
    const line = `Finance costs 41.20 38.90 ${"y".repeat(700)}`;
    const out = buildProposals({
      ...base,
      extraction: { ...fixture("Profit and Loss"), rows: [{ label, current_text: "41.20", prior_text: "38.90", line }] },
      pageNo: 4,
      pageText: `${PL_TEXT}\n${line}`,
      pageKind: "pl",
      fileLabels: new Set([normaliseLabel(label.slice(0, 80))]),
    });
    expect(out).toHaveLength(1);
    expect(out[0].machineValue.label).toHaveLength(80);
    expect(out[0].machineValue.quote).toHaveLength(600);
    expect(out[0].flags).not.toContain("quote_not_on_page"); // checked on the full line, before the cut
  });

  it("keeps one proposal per key on a page", () => {
    const row = fixture("Profit and Loss").rows[0];
    expect(pl({ rows: [row, { ...row }] })).toHaveLength(1);
  });

  it("falls back from the page's own basis to the selector's verdict to the document's", () => {
    expect(pl({ basis: "standalone" })[0].machineValue.basis).toBe("standalone");
    const unknown = { ...fixture("Profit and Loss"), basis: "unknown" as const };
    const at = (pageBasis: "standalone" | null) =>
      buildProposals({ ...base, extraction: unknown, pageNo: 4, pageText: PL_TEXT, pageKind: "pl", pageBasis })[0].machineValue.basis;
    expect(at("standalone")).toBe("standalone");
    expect(at(null)).toBe("consolidated");
  });
});

describe("buildProposals: the relevance filter", () => {
  const moved = (label: string, current: string, prior: string) => ({ label, current_text: current, prior_text: prior, line: `${label} ${current} ${prior}` });
  const rows = [
    moved("Legal fees", "125.00", "100.00"), // +25
    moved("Travel", "170.00", "100.00"), // +70
    moved("Rent", "40.00", "100.00"), // -60
    moved("Repairs", "130.00", "100.00"), // +30
    moved("Rates and taxes", "105.00", "100.00"), // +5: not moved enough
    moved("Revenue from operations", "1,284.00", "1,102.00"), // core
  ];
  const text = rows.map((r) => r.line).join("\n");

  it("keeps every core line and only the three biggest movers of a page", () => {
    const out = buildProposals({ ...base, extraction: { ...fixture("Profit and Loss"), rows }, pageNo: 4, pageText: text, pageKind: "pl" });
    expect(out.map((p) => p.machineValue.label)).toEqual(["Travel", "Rent", "Repairs", "Revenue from operations"]);
    expect(out.filter((p) => p.reason === "moved").map((p) => p.movedPct)).toEqual([70, -60, 30]);
  });

  it("keeps a line the case file already tracks, whatever it did", () => {
    const out = buildProposals({
      ...base,
      extraction: { ...fixture("Profit and Loss"), rows },
      pageNo: 4,
      pageText: text,
      pageKind: "pl",
      fileLabels: new Set(["rates and taxes"]),
    });
    expect(out.find((p) => p.machineValue.label === "Rates and taxes")?.reason).toBe("label_match");
  });
});
