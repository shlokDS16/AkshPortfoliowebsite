import { beforeAll, describe, expect, it } from "vitest";
import { fixturePdfBytes } from "@/test/fixtures/pdf";
import { closePdf, openPdf, pageText } from "./pages";
import { classifyPages, selectPages, selectTextPages, type PageVerdict } from "./selector";

type Page = { pageNo: number; text: string; isScan: boolean };
// The database's rule (document_pages.is_scan): under 50 characters of text is a scan, read by OCR in Plan 2b.
const page = (pageNo: number, text: string): Page => ({ pageNo, text, isScan: text.trim().length < 50 });

let fixture: Page[];
beforeAll(async () => {
  const pdf = await openPdf(fixturePdfBytes());
  fixture = [];
  for (let n = 1; n <= pdf.numPages; n++) fixture.push(page(n, await pageText(pdf, n)));
  await closePdf(pdf);
});

const kindOf = (verdicts: PageVerdict[], pageNo: number) => verdicts.find((v) => v.pageNo === pageNo);

describe("classifyPages (spec s6.3: headings at the top, number density, scans excluded)", () => {
  it("finds the consolidated P&L on p. 4, the balance sheet on p. 5 and the MD&A on p. 3 of the fixture", () => {
    const verdicts = classifyPages(fixture);
    expect(kindOf(verdicts, 4)).toMatchObject({ kind: "pl", basis: "consolidated" });
    expect(kindOf(verdicts, 5)).toMatchObject({ kind: "bs", basis: "consolidated" });
    expect(kindOf(verdicts, 3)).toMatchObject({ kind: "mdna" });
    for (const n of [1, 2, 6]) expect(kindOf(verdicts, n)).toMatchObject({ kind: "other", score: 0 });
  });

  it("calls a contents page that names three statements 'other', not a statement", () => {
    const contents = page(
      2,
      "Contents\nConsolidated Statement of Profit and Loss 120\nConsolidated Balance Sheet as at March 31, 2026 122\nConsolidated Statement of Cash Flows 124",
    );
    expect(classifyPages([contents])[0]).toMatchObject({ kind: "other", score: 0 });
  });

  it("carries a statement onto the next page when it has no heading but is mostly numbers, at a lower score", () => {
    const head = page(10, `Standalone Statement of Profit and Loss for the year ended March 31, 2026\n${"Revenue 1,284.00 1,102.00\n".repeat(6)}`);
    const runOn = page(11, "Other expenses 210.40 188.10\nTax 41.20 38.90\nDeferred tax (12.10) 9.80\nTotal 1,442.00 1,301.70");
    const [first, second] = classifyPages([head, runOn]);
    expect(first).toMatchObject({ kind: "pl", basis: "standalone" });
    expect(second).toMatchObject({ kind: "pl", basis: "standalone" });
    expect(second.score).toBeLessThan(first.score);
  });

  it("does not carry a statement over a gap or onto a page of words", () => {
    const head = page(10, `Consolidated Balance Sheet as at March 31, 2026\n${"Inventories 305.00 251.70\n".repeat(4)}`);
    const words = page(11, "The accompanying notes are an integral part of these financial statements and should be read with them.");
    const gap = page(13, "Other expenses 210.40 188.10\nTax 41.20 38.90\nTotal 1,442.00 1,301.70");
    const verdicts = classifyPages([head, words, gap]);
    expect(verdicts.map((v) => v.kind)).toEqual(["bs", "other", "other"]);
  });

  it("never classifies a scan, even one with a statement heading", () => {
    const scan = page(4, "Statement of Profit and Loss");
    expect(scan.isScan).toBe(true);
    expect(classifyPages([scan])[0]).toMatchObject({ kind: "other", score: 0 });
  });
});

describe("selectPages", () => {
  it("picks the P&L first when the budget is one page", () => {
    expect(selectPages(classifyPages(fixture), { budget: 1, basis: "consolidated" })).toEqual([4]);
  });

  it("returns the chosen pages in ascending order, never 'other' pages", () => {
    expect(selectPages(classifyPages(fixture), { budget: 20, basis: "consolidated" })).toEqual([3, 4, 5]);
  });

  it("ranks a standalone statement above a consolidated one when the document's basis is standalone", () => {
    const consolidated = page(4, `Consolidated Statement of Profit and Loss for the year ended March 31, 2026\n${"Revenue 1,284.00 1,102.00\n".repeat(4)}`);
    const standalone = page(9, `Standalone Statement of Profit and Loss for the year ended March 31, 2026\n${"Revenue 1,284.00 1,102.00\n".repeat(4)}`);
    const verdicts = classifyPages([consolidated, standalone]);
    expect(selectPages(verdicts, { budget: 1, basis: "standalone" })).toEqual([9]);
    expect(selectPages(verdicts, { budget: 1, basis: "consolidated" })).toEqual([4]);
  });

  it("never selects a scan and selects nothing on a budget of zero", () => {
    const scan = page(4, "Balance Sheet as at 2026");
    const verdicts = classifyPages([scan, ...fixture.filter((p) => p.pageNo !== 4)]);
    expect(selectPages(verdicts, { budget: 20, basis: "consolidated" })).not.toContain(4);
    expect(selectPages(classifyPages(fixture), { budget: 0, basis: "consolidated" })).toEqual([]);
  });
});

describe("selectTextPages (ruling R15: Aksh chose this text, so a table is read even with no statement heading)", () => {
  const table = "Quarterly results\nRevenue from operations 1,284.00 1,102.00\nFinance costs 41.20 38.90\nProfit for the year 152.60 118.30";
  const prose = "Management spoke to analysts about demand in the quarter and said the order book looks healthy for the year ahead overall.";
  const heading = "Statement of Profit and Loss for the year ended March 31, 2026\nRevenue from operations 1,284.00 1,102.00";
  const pick = (texts: string[], budget = 20) => {
    const pages = texts.map((text, i) => ({ pageNo: i + 1, text, isScan: false }));
    return selectTextPages(pages, classifyPages(pages), { budget, basis: "consolidated" });
  };

  it("selects a pasted table that has no statement heading", () => {
    expect(pick([table])).toEqual([1]);
  });

  it("selects a page with a statement heading and leaves prose alone", () => {
    expect(pick([prose, heading, prose])).toEqual([2]);
  });

  it("needs number density above 0.15: 3 numbers in 19 words (0.158) is read, 3 in 21 (0.143) is not", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(pick([`${words(16)} 1,234 5,678 9,012`])).toEqual([1]);
    expect(pick([`${words(18)} 1,234 5,678 9,012`])).toEqual([]);
  });

  it("takes the best pages first within the budget, in page order: headings, then the densest tables", () => {
    const dense = "1,284.00 1,102.00 41.20 38.90 152.60 118.30 Revenue Costs";
    const thin = "Revenue 1,284.00 for the year in the quarter and the half and all of it was good news for us";
    expect(pick([thin, heading, dense, prose], 2)).toEqual([2, 3]);
    expect(pick([thin, heading, dense, prose], 1)).toEqual([2]);
    expect(pick([thin, heading, dense, prose], 0)).toEqual([]);
  });

  it("does not let a short page count as a scan: text pages are never held back for OCR", () => {
    const pages = [{ pageNo: 1, text: "1,284.00 1,102.00", isScan: false }];
    expect(selectTextPages(pages, classifyPages(pages), { budget: 5, basis: "consolidated" })).toEqual([1]);
  });
});
