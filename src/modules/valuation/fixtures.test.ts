import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hostile, smallModel } from "../../../scripts/fixtures/make-models";
import { buildModel } from "./build-model";
import { readWorkbook } from "./read-workbook";
import { XlsxRefusal } from "./refusal";

// The committed fixture (e2e/fixtures/model-small.xlsx) and the hostile files the generator can write (scripts/fixtures/make-models.ts).

const dir = mkdtempSync(join(tmpdir(), "desk-fixture-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const committed = () => new Uint8Array(readFileSync(new URL("../../../e2e/fixtures/model-small.xlsx", import.meta.url)));

describe("e2e/fixtures/model-small.xlsx", () => {
  it("is small, and is what the generator writes today", () => {
    expect(committed().byteLength).toBeLessThan(20_000);
    expect(readWorkbook(committed())).toEqual(readWorkbook(smallModel()));
  });

  it("has three sheets and the formulas the plan lists", () => {
    const index = readWorkbook(committed());
    expect(index.sheets.map((s) => s.name)).toEqual(["Assumptions", "DCF", "Checks"]);
    expect(index.counts.formulas).toBeGreaterThan(30);
  });

  it("gives the classes it was built for", async () => {
    const model = await buildModel(committed(), { tmpDir: dir });
    expect(model.classes["Checks!B3"]).toBe("differs"); // the stale saved value
    expect(model.classes["Checks!B4"]).toBe("unsupported"); // CUBEVALUE
    expect(model.classes["Checks!B5"]).toBe("dated"); // TODAY()
    expect(model.classes["Checks!B6"]).toBe("cycle");
    expect(model.classes["Checks!B7"]).toBe("cycle");
    expect(model.classes["Checks!B8"]).toBeUndefined(); // INDIRECT agrees with Excel
    expect(model.dynamic).toEqual(["Checks!B8"]);
    expect(model.taint).toContain("Checks!B9"); // agrees with Excel, but reads the stale cell
    expect(model.report.unimplemented).toEqual(["CUBEVALUE"]);
    // Every cell of the DCF itself agrees with Excel, independently computed.
    expect(Object.keys(model.classes).filter((k) => k.startsWith("DCF!") || k.startsWith("Assumptions!"))).toEqual([]);
    expect(model.report.counts.differs).toBe(1);
  });

  it("suggests the DCF's inputs and its results, labelled from the sheet", async () => {
    const { suggestions } = await buildModel(committed(), { tmpDir: dir });
    const input = (addr: string) => suggestions.inputs.find((i) => i.sheet === "Assumptions" && i.addr === addr);
    expect(input("B1")).toMatchObject({ value: 0.115, z: "0.0%", label: "Cost of equity" });
    expect(input("B2")).toMatchObject({ label: "Terminal growth" });
    const outputs = suggestions.outputs.map((o) => `${o.sheet}!${o.addr}`);
    expect(outputs).toContain("DCF!B13");
    expect(outputs).not.toContain("Checks!B3");
    expect(outputs).not.toContain("Checks!B9");
    expect(suggestions.outputs.find((o) => o.addr === "B13")).toMatchObject({ label: "Per-share result", z: "#,##0.00" });
  });
});

describe("the hostile files the generator writes", () => {
  const files = hostile();
  const refusal = (bytes: Uint8Array): string => {
    try {
      readWorkbook(bytes);
    } catch (error) {
      expect(error).toBeInstanceOf(XlsxRefusal);
      return (error as XlsxRefusal).code;
    }
    return "none";
  };

  it("a zip bomb is refused before anything is inflated", () => {
    expect(files["zip-bomb.xlsx"].byteLength).toBeLessThan(100_000);
    expect(refusal(files["zip-bomb.xlsx"])).toBe("zip_too_large");
  });

  it("a sheet past 100,000 cells, a workbook with an external link, and a macro file renamed .xlsx", () => {
    expect(refusal(files["too-many-cells.xlsx"])).toBe("too_many_cells");
    expect(refusal(files["external-link.xlsx"])).toBe("external_links");
    expect(refusal(files["macro-renamed.xlsx"])).toBe("macros");
  });
});
