import { describe, expect, it } from "vitest";
import { DOUBTFUL_MAX_PAGES } from "./limits";
import { classifyPages, doubtfulPages, modelVerdict, selectPages } from "./selector";

// The pages the rules could not place (ruling R16) and what a model verdict on one of them is worth.

type Page = { pageNo: number; text: string; isScan: boolean };
const page = (pageNo: number, text: string): Page => ({ pageNo, text, isScan: text.trim().length < 50 });
const TABLE = "Particulars 1,284.00 1,102.00\nOther income 41.20 38.90\nTotal 1,325.20 1,140.90\nTax 12.10 9.80";
const PROSE = "The directors are pleased to present the annual report together with the audited accounts for the year under review, as set out below.";
const doubtful = (pages: Page[]) => doubtfulPages(pages, classifyPages(pages));

describe("doubtfulPages (R16)", () => {
  it("is a page the rules call 'other' that is mostly numbers", () => {
    expect(doubtful([page(1, PROSE), page(2, TABLE)])).toEqual([2]);
  });

  it("leaves out prose, a statement the rules already placed, a scan and a contents page", () => {
    const pl = page(3, `Consolidated Statement of Profit and Loss for the year ended March 31, 2026\n${TABLE}`);
    const scan = page(4, "");
    const contents = page(
      5,
      "Contents 12 14 16 18 20\nConsolidated Statement of Profit and Loss 120\nConsolidated Balance Sheet as at March 31, 2026 122\nConsolidated Statement of Cash Flows 124",
    );
    expect(doubtful([page(1, PROSE), pl, scan, contents])).toEqual([]);
  });

  it("needs number density above 0.15 (3 numbers in 19 words is in, 3 in 21 is out)", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(doubtful([page(1, `${words(16)} 1,234 5,678 9,012`)])).toEqual([1]);
    expect(doubtful([page(1, `${words(18)} 1,234 5,678 9,012`)])).toEqual([]);
  });

  it("keeps the densest 30 pages and returns them in page order", () => {
    const pages = Array.from({ length: 40 }, (_, i) => page(i + 1, i < 10 ? `${TABLE}\nnote text` : TABLE));
    const out = doubtful(pages);
    expect(out).toHaveLength(DOUBTFUL_MAX_PAGES);
    expect(out).toEqual([...out].sort((a, b) => a - b));
    expect(out.slice(0, 1)).toEqual([11]); // the ten pages with an extra line of prose are the least dense
    expect(out).not.toContain(1);
  });
});

describe("modelVerdict (R16)", () => {
  it("scores 20 + 20 x confidence, so it ranks below any heading page, and reads the basis from the head", () => {
    const text = `Standalone figures\n${TABLE}`;
    expect(modelVerdict({ pageNo: 7, text }, "notes", 0.6)).toEqual({ pageNo: 7, kind: "notes", basis: "standalone", score: 32 });
    expect(modelVerdict({ pageNo: 7, text: TABLE }, "pl", 1)).toEqual({ pageNo: 7, kind: "pl", basis: null, score: 40 });
  });

  it("is chosen after a heading page when the budget is short, and before nothing", () => {
    const heading = classifyPages([page(1, `Notes forming part of the financial statements\n${TABLE}`)]);
    const verdicts = [...heading, modelVerdict({ pageNo: 2, text: TABLE }, "cf", 1)];
    expect(selectPages(verdicts, { budget: 1, basis: "consolidated" })).toEqual([1]);
    expect(selectPages(verdicts, { budget: 2, basis: "consolidated" })).toEqual([1, 2]);
  });
});
