import { beforeAll, describe, expect, it } from "vitest";
import { fixturePdfBytes } from "@/test/fixtures/pdf";
import { closePdf, openPdf, pageText } from "./pages";
import { classifyPages, selectPages, type PageVerdict } from "./selector";

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
