import { describe, expect, it } from "vitest";
import { KAVERI } from "@/test/fixtures/casefile";
import { EMPTY_CASEFILE, readCaseFile } from "./schema";
import { parseFactsSheet, serializeFactsSheet } from "./sheet";

describe("facts sheet", () => {
  it("parses every row kind, puts quotes on their source, and keeps Aksh's words out", () => {
    const { caseFile, errors } = parseFactsSheet(KAVERI.revisions[1].sheet);
    expect(errors).toEqual([]);
    expect(caseFile.oneLiner).toBe("Fictional maker of farm and municipal water pumps, used to test the desk.");
    expect(caseFile.sources[0].quote).toEqual({ F1: "Revenue from operations rose to ₹1,284 crore." });
    expect(caseFile.facts[0]).toMatchObject({ id: "F1", value: 1284, unit: "₹ cr", prior: { label: "FY25", value: 1102 } });
    expect(caseFile.tests[1]).toMatchObject({ id: "T2", status: "not_met", direction: "below", threshold: 28 });
    expect(caseFile.exhibits[0].points.map((p) => p.value)).toEqual([81, 95, 118, 131, 142]);
    expect(caseFile.readFirst).toEqual(["how-to-read-receivable-days"]);
    expect(caseFile.scenario?.outputs[0]).toEqual({ label: "FY28 revenue", unit: "₹ cr", values: ["1,390", "1,500", "1,610"] });
  });

  it("accepts rows pasted from Excel (tabs) and ignores blank and comment lines", () => {
    const { caseFile, errors } = parseFactsSheet("// legend\n\nS1\tAnnual report FY26\tannual report\t2026-07-12\n");
    expect(errors).toEqual([]);
    expect(caseFile.sources[0].type).toBe("Annual report");
  });

  it("names the line and the problem", () => {
    const { errors } = parseFactsSheet("S1 | Doc | Annual report | 2026-07-12\nF1 | Revenue | lots | ₹ cr | FY26 | 2026-03-31 | S1 | p. 1\nZ9 | ?");
    expect(errors).toEqual([
      { line: 2, message: "F1: the value \"lots\" is not a number." },
      { line: 3, message: "Start a row with O, S1, F1, G, T1, X1, R, SC, A or Y." },
    ]);
  });

  it("reports schema problems on the row that caused them", () => {
    const { errors } = parseFactsSheet("F1 | Revenue | 10 | ₹ cr | FY26 | 2026-03-31 | S4 | p. 1");
    expect(errors).toEqual([{ line: 1, message: "F1 cites S4, which is not in the sources." }]);
  });

  it("round-trips through serialize, so the editor can show the live revision as a sheet", () => {
    const first = parseFactsSheet(KAVERI.revisions[1].sheet).caseFile;
    const again = parseFactsSheet(serializeFactsSheet(first));
    expect(again.errors).toEqual([]);
    expect(again.caseFile).toEqual(first);
  });

  it("rejects a date that is not on the calendar instead of storing it (rule a)", () => {
    const { errors } = parseFactsSheet("S1 | Doc | Annual report | 2026-07-12\nF1 | Revenue | 10 | ₹ cr | FY26 | 2026-02-30 | S1 | p. 1");
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
  });
});

describe("topics (G rows) and Notes sources", () => {
  const base = [
    "S1 | Q2 call notes | Notes | 2026-08-14",
    "F1 | Revenue from operations | 1284 | ₹ cr | FY26 | 2026-03-31 | S1 | call, 14 Aug",
    "F2 | Trade receivables | 210.4 | ₹ cr | FY26 | 2026-03-31 | S1 | call, 14 Aug",
    "F3 | Inventories | 305 | ₹ cr | FY26 | 2026-03-31 | S1 | call, 14 Aug",
  ];

  it("accepts Notes as a source type", () => {
    const { caseFile, errors } = parseFactsSheet(base.join("\n"));
    expect(errors).toEqual([]);
    expect(caseFile.sources[0]?.type).toBe("Notes");
  });

  it("assigns topics from G rows, before or after the facts", () => {
    const { caseFile, errors } = parseFactsSheet(["G | Working capital | F2, F3", ...base].join("\n"));
    expect(errors).toEqual([]);
    expect(caseFile.facts.map((f) => f.topic)).toEqual([null, "Working capital", "Working capital"]);
  });

  it("reports an unknown fact, a fact in two topics and an empty topic on their lines", () => {
    const { errors } = parseFactsSheet([...base, "G | Working capital | F2 F9", "G | Balance sheet | F2", "G |  | F1"].join("\n"));
    expect(errors).toEqual([
      { line: 5, message: "G: F9 is not a fact in this sheet." },
      { line: 6, message: "F2 is in two topics (lines 5 and 6)." },
      { line: 7, message: "G: name the topic." },
    ]);
  });

  it("caps a topic at 40 characters", () => {
    const { errors } = parseFactsSheet([...base, `G | ${"x".repeat(41)} | F1`].join("\n"));
    expect(errors.map((e) => e.line)).toContain(5);
  });

  it("refuses a | or a tab inside a topic in plain words, since either would split the G row", () => {
    const tabbed = base.map((l) => l.split(" | ").join("\t"));
    const message = "G: a topic cannot hold a | or a tab; the sheet uses them to split columns.";
    expect(parseFactsSheet([...base, "G | P|L | F1"].join("\n")).errors).toEqual([{ line: 5, message }]);
    expect(parseFactsSheet([...tabbed, "G\tP|L\tF1"].join("\n")).errors).toEqual([{ line: 5, message }]);
    expect(parseFactsSheet([...tabbed, "G\tP\tL\tF1"].join("\n")).errors).toEqual([{ line: 5, message }]);
    expect(parseFactsSheet([...base, "G | P&L | F1 |"].join("\n")).errors).toEqual([]);
  });

  it("round-trips topics through the serializer, one G row per topic in first-seen order", () => {
    const { caseFile } = parseFactsSheet([...base, "G | Working capital | F3 F2", "G | P&L | F1"].join("\n"));
    const text = serializeFactsSheet(caseFile);
    expect(text).toContain("G | P&L | F1");
    expect(text).toContain("G | Working capital | F2 F3");
    expect(parseFactsSheet(text).caseFile).toEqual(caseFile);
  });

  it("reads a revision saved before topics existed as topic null", () => {
    const old = { ...EMPTY_CASEFILE, sources: [{ id: "S1", doc: "AR", type: "Annual report", filedOn: "2026-05-20", url: null, quote: {} }],
      facts: [{ id: "F1", label: "Revenue", value: 1, unit: "₹ cr", period: "FY26", asOf: "2026-03-31", sourceId: "S1", locator: "p. 1", prior: null }] };
    expect(readCaseFile(old).facts[0]?.topic).toBeNull();
  });
});
