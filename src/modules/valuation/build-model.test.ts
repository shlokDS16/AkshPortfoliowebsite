import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dcfCells } from "@/test/dcf-fixture";
import { buildXlsx } from "@/test/xlsx-builder";
import { buildModel } from "./build-model";
import { MAX_PROBED_FUNCTIONS, probeFunctions } from "./engine-node";
import { XlsxRefusal } from "./refusal";
import { ENGINE_VERSIONS } from "./versions";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "desk-build-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const book = () =>
  buildXlsx({
    sheets: [
      {
        name: "DCF",
        cells: [
          ...dcfCells,
          { addr: "B16", f: "B4*2", v: 0 }, // downstream of the XNPV that disagrees
          { addr: "B17", f: "B9+1", v: 2 }, // downstream of CUBEVALUE
          { addr: "B18", f: "B1*B2", v: -11.5 }, // an untainted result
          { addr: "B19", f: "TODAY()", v: 40000 },
          { addr: "B20", f: "RAND()", v: 0.5 },
          { addr: "B21", f: "B3*0.5", v: 12.41785635 },
          { addr: "A21", v: "Half the NPV" },
          { addr: "B22", f: "IF(B16>-1000,1,0)", v: 1 }, // agrees with Excel, but only by luck: it reads a cell that does not
        ],
      },
    ],
  });

describe("probeFunctions: which functions the engine cannot compute", () => {
  it("names the unknown ones and leaves the known ones out", () => {
    expect(probeFunctions(["NPV", "CUBEVALUE", "SUM", "WEBSERVICE", "XNPV"]).sort()).toEqual(["CUBEVALUE", "WEBSERVICE"]);
  });

  it("ignores anything that is not a plain function name", () => {
    expect(probeFunctions(["A1)+(1", "", "SUM(", "NPV 2", "\u0000"])).toEqual([]);
  });

  it("asks about a bounded number of names, quickly, however many distinct names a hostile workbook uses", () => {
    const names = Array.from({ length: 80_000 }, (_, i) => `FAKE${i}`);
    const started = Date.now();
    const missing = probeFunctions(names);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(missing.length).toBeLessThanOrEqual(MAX_PROBED_FUNCTIONS);
    expect(missing.length).toBeGreaterThan(0);
  });
});

describe("buildModel", () => {
  it("reads, recalculates, diffs, follows the references and suggests, in one object", async () => {
    const model = await buildModel(book(), { tmpDir: dir });
    expect(model.modelVersion).toBe(1);
    expect(model.engine).toEqual(ENGINE_VERSIONS);

    expect(model.classes["DCF!B4"]).toBe("differs");
    expect(model.classes["DCF!B9"]).toBe("unsupported");
    expect(model.classes["DCF!B10"]).toBe("cycle");
    expect(model.classes["DCF!B11"]).toBe("cycle");
    expect(model.classes["DCF!B19"]).toBe("dated");
    expect(model.classes["DCF!B20"]).toBe("random");
    expect(model.classes["DCF!B3"]).toBeUndefined(); // a match is not listed
    expect(model.classes["DCF!B8"]).toBeUndefined(); // INDIRECT agrees with Excel
  });

  it("taints what depends on a cell that disagrees, and not a clean result", async () => {
    const { taint, dynamic } = await buildModel(book(), { tmpDir: dir });
    expect(taint).toEqual(expect.arrayContaining(["DCF!B4", "DCF!B16", "DCF!B9", "DCF!B17", "DCF!B10", "DCF!B20", "DCF!B22"]));
    expect(taint).not.toContain("DCF!B18");
    expect(taint).not.toContain("DCF!B19"); // dated is by design, not a fault
    expect(dynamic).toEqual(["DCF!B8"]);
  });

  it("suggests untainted results and inputs the formulas use, with the labels the sheet shows", async () => {
    const { suggestions } = await buildModel(book(), { tmpDir: dir });
    const outputs = suggestions.outputs.map((o) => `${o.sheet}!${o.addr}`);
    expect(outputs).toContain("DCF!B18");
    expect(outputs).toContain("DCF!B21");
    for (const bad of ["DCF!B4", "DCF!B16", "DCF!B9", "DCF!B17", "DCF!B10", "DCF!B22"]) expect(outputs).not.toContain(bad);
    expect(suggestions.outputs.find((o) => o.addr === "B21")?.label).toBe("Half the NPV");
    expect(suggestions.inputs.map((i) => i.addr)).toContain("B1");
    expect(suggestions.inputs.find((i) => i.addr === "B1")).toMatchObject({ value: 0.115, z: "0.0%", label: "Cost of equity" });
  });

  it("reports counts, the listed cells in plain terms, and the functions the engine cannot compute", async () => {
    const { report } = await buildModel(book(), { tmpDir: dir });
    expect(report.counts).toMatchObject({ differs: 2, unsupported: 2, cycle: 2, dated: 1, random: 1, no_cache: 0 });
    expect(report.counts.match).toBeGreaterThan(5);
    expect(report.unimplemented).toEqual(["CUBEVALUE"]);
    const b9 = report.listed.find((e) => e.cell === "DCF!B9");
    expect(b9).toMatchObject({ cls: "unsupported", fn: "CUBEVALUE", excel: "1", desk: "#NAME?" });
    const b4 = report.listed.find((e) => e.cell === "DCF!B4");
    expect(b4?.cls).toBe("differs");
    expect(b4?.excel).toBe("0");
    expect(Number(b4?.desk)).toBeCloseTo(-100 + 30 / 1.115 + 50 / 1.115 ** 2, 6);
    expect(report.listed.map((e) => e.cls).slice(0, 1)).toEqual(["differs"]); // differing cells come first
    expect(report.tainted).toBe(1); // B22: the cells that disagree are counted apart
    expect(report.dynamic).toBe(1);
  });

  it("pins a limit of IronCalc 0.8.3: INDIRECT with a sheet-qualified text is #VALUE! once imported, so the desk reports it as differing", async () => {
    const bytes = buildXlsx({
      sheets: [
        { name: "A", cells: [{ addr: "A1", v: 5 }, { addr: "B1", f: 'INDIRECT("A1")', v: 5 }] },
        { name: "B", cells: [{ addr: "A1", f: 'INDIRECT("A!A1")', v: 5 }, { addr: "A2", f: "A!A1+0", v: 5 }] },
      ],
    });
    const model = await buildModel(bytes, { tmpDir: dir });
    expect(model.classes["A!B1"]).toBeUndefined(); // same-sheet INDIRECT agrees with Excel
    expect(model.classes["B!A1"]).toBe("differs"); // if IronCalc fixes this, this line fails and the limit can be lifted
    expect(model.classes["B!A2"]).toBeUndefined();
    expect(model.dynamic).toEqual(["A!B1", "B!A1"]);
    expect(model.taint).toEqual(["B!A1"]); // never offered as a result
  });

  it("refuses an Excel data table with its own plain sentence (IronCalc 0.8.3 cannot open one)", async () => {
    const bytes = buildXlsx({
      sheets: [{ name: "S", cells: [{ addr: "A1", v: 1 }, { addr: "B1", f: "A1*2", v: 2 }, { addr: "C3", v: 5, dataTable: 'ref="C3:C4" dt2D="0" dtr="0" r1="A1"' }] }],
    });
    let caught: unknown;
    try {
      await buildModel(bytes, { tmpDir: dir });
    } catch (error) {
      caught = error;
    }
    expect((caught as XlsxRefusal).code).toBe("data_tables");
    expect((caught as XlsxRefusal).message).toMatch(/data table/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("lists at most 200 cells and says how many there are", async () => {
    const cells = Array.from({ length: 250 }, (_, i) => ({ addr: `A${i + 1}`, f: `${i}+1`, v: -1 }));
    const model = await buildModel(buildXlsx({ sheets: [{ name: "S", cells }] }), { tmpDir: dir });
    expect(model.report.listed).toHaveLength(200);
    expect(model.report.counts.differs).toBe(250);
  });

  it("carries the engine bytes as base64", async () => {
    const { engineBytes } = await buildModel(book(), { tmpDir: dir });
    expect(Buffer.from(engineBytes, "base64").byteLength).toBeGreaterThan(100);
    expect(engineBytes).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("leaves no temporary file behind", async () => {
    await buildModel(book(), { tmpDir: dir });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("puts only machine output in the object: no field of Aksh's", async () => {
    const model = await buildModel(book(), { tmpDir: dir });
    expect(Object.keys(model).sort()).toEqual(["classes", "dynamic", "engine", "engineBytes", "index", "modelVersion", "report", "suggestions", "taint"]);
  });
});

describe("buildModel: refusals and the time budget", () => {
  const refusal = async (bytes: Uint8Array, opts = {}): Promise<string> => {
    try {
      await buildModel(bytes, { tmpDir: dir, ...opts });
    } catch (error) {
      expect(error).toBeInstanceOf(XlsxRefusal);
      return (error as XlsxRefusal).code;
    }
    return "none";
  };

  it("passes a hostile workbook's refusal through untouched", async () => {
    expect(await refusal(new TextEncoder().encode("not a workbook"))).toBe("not_xlsx");
  });

  it("ends in too_slow when a checkpoint finds the budget spent, at each stage", async () => {
    for (const stage of ["scan", "parse", "load", "evaluate", "diff"] as const) {
      let calls = 0;
      let now = 0;
      const code = await refusal(book(), {
        budgetMs: 1000,
        now: () => now,
        onStage: (s: string) => {
          calls++;
          if (s === stage) now = 5000; // the stage took too long
        },
      });
      expect(code, stage).toBe("too_slow");
      expect(calls).toBeGreaterThan(0);
    }
  });

  it("refuses a workbook the engine would take too long over, before the engine is started", async () => {
    // 120 whole-column SUMPRODUCTs: about 0.4 s each in IronCalc 0.8.3 (measured), so about 50 s, in one call that cannot be interrupted.
    const cells = [{ addr: "A1", v: 1 }, { addr: "B1", v: 2 }, ...Array.from({ length: 120 }, (_, i) => ({ addr: `D${i + 1}`, f: "SUMPRODUCT(A:A,B:B)", v: 2 }))];
    const stages: string[] = [];
    const code = await refusal(buildXlsx({ sheets: [{ name: "S", cells }] }), { onStage: (s: string) => stages.push(s) });
    expect(code).toBe("too_complex");
    expect(stages).toEqual(["scan", "parse", "graph"]);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("finishes when every stage is within the budget", async () => {
    let now = 0;
    const model = await buildModel(book(), { tmpDir: dir, budgetMs: 180_000, now: () => (now += 10) });
    expect(model.modelVersion).toBe(1);
  });

  it("refuses an object past 12 MB", async () => {
    expect(await refusal(book(), { maxObjectBytes: 1000 })).toBe("model_too_large");
  });
});
