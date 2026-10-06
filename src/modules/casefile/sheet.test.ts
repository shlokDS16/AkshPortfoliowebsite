import { describe, expect, it } from "vitest";
import { KAVERI } from "@/test/fixtures/casefile";
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
      { line: 3, message: "Start a row with O, S1, F1, T1, X1, R, SC, A or Y." },
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
