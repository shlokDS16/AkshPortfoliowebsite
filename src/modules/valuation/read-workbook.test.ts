import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildXlsx, colLetters, type CellSpec, type XlsxSpec } from "@/test/xlsx-builder";
import { XlsxRefusal, type RefusalCode } from "./refusal";
import { readWorkbook } from "./read-workbook";
import type { IndexCell } from "./types";

const one = (cells: CellSpec[], rest: Partial<XlsxSpec> = {}) => buildXlsx({ sheets: [{ name: "Sheet1", cells }], ...rest });
const cellsOf = (bytes: Uint8Array, sheet = 0): IndexCell[] => readWorkbook(bytes).sheets[sheet].cells;
const byAddr = (cells: IndexCell[], addr: string) => cells.find((c) => c[0] === addr);

function refused(fn: () => unknown): RefusalCode {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(XlsxRefusal);
    return (error as XlsxRefusal).code;
  }
  throw new Error("expected a refusal");
}

describe("readWorkbook: what is read per cell", () => {
  it("formula text, Excel's saved value, its type and number format", () => {
    const cells = cellsOf(
      one([
        { addr: "A1", v: "Cost of equity" },
        { addr: "B1", v: 0.115, fmt: "0.0%" },
        { addr: "B2", f: "B1*2", v: 0.23, fmt: "0.0%" },
        { addr: "B3", f: 'A1&"x"', v: "Cost of equityx" },
        { addr: "B4", f: "B1>0", v: true },
        { addr: "B5", f: "1/0", v: "#DIV/0!", t: "e" },
      ]),
    );
    expect(byAddr(cells, "A1")).toEqual(["A1", null, "Cost of equity", "s", null]);
    expect(byAddr(cells, "B1")).toEqual(["B1", null, 0.115, "n", "0.0%"]);
    expect(byAddr(cells, "B2")).toEqual(["B2", "B1*2", 0.23, "n", "0.0%"]);
    expect(byAddr(cells, "B3")).toEqual(["B3", 'A1&"x"', "Cost of equityx", "s", null]);
    expect(byAddr(cells, "B4")).toEqual(["B4", "B1>0", true, "b", null]);
    expect(byAddr(cells, "B5")).toEqual(["B5", "1/0", "#DIV/0!", "e", null]);
  });

  it("a formula with no saved value is kept, as type z with a null value", () => {
    const cells = cellsOf(one([{ addr: "A1", v: 2 }, { addr: "B1", f: "A1*2" }]));
    expect(byAddr(cells, "B1")).toEqual(["B1", "A1*2", null, "z", null]);
  });

  it("a shared formula is given per cell, each with its own references", () => {
    const cells = cellsOf(
      one([
        { addr: "A1", v: 1 }, { addr: "A2", v: 2 }, { addr: "A3", v: 3 },
        { addr: "B1", f: "A1*10", v: 10, shared: { si: 0, ref: "B1:B3" } },
        { addr: "B2", v: 20, shared: { si: 0 } },
        { addr: "B3", v: 30, shared: { si: 0 } },
      ]),
    );
    expect(byAddr(cells, "B2")?.[1]).toBe("A2*10");
    expect(byAddr(cells, "B3")?.[1]).toBe("A3*10");
  });

  it("array-formula ranges are listed for the sheet", () => {
    const index = readWorkbook(one([{ addr: "A1", v: 1 }, { addr: "B1", f: "SUM(A1:A2)", v: 3, array: "B1:B2" }, { addr: "B2", v: 4 }]));
    expect(index.sheets[0].arrays).toEqual(["B1:B2"]);
  });

  it("strips _xlfn. prefixes from formula text", () => {
    const cells = cellsOf(one([{ addr: "A1", v: 1 }, { addr: "B1", f: "_xlfn.IFS(A1>0,1,TRUE,2)+_xlfn.STDEV.S(A1:A1)", v: 1 }]));
    expect(byAddr(cells, "B1")?.[1]).toBe("IFS(A1>0,1,TRUE,2)+STDEV.S(A1:A1)");
  });

  it("returns markup as plain text and nothing else: no html, no rich-text fields", () => {
    const text = '<script>alert(1)</script><b>bold</b>';
    const cells = cellsOf(one([{ addr: "A1", v: text }]));
    expect(cells[0]).toEqual(["A1", null, text, "s", null]);
    expect(cells[0]).toHaveLength(5);
  });

  it("leaves out empty, formatted-only cells", () => {
    const cells = cellsOf(one([{ addr: "A1", v: 1 }, { addr: "B1", fmt: "0.00%" }]));
    expect(cells.map((c) => c[0])).toEqual(["A1"]);
  });

  it("reads several sheets in order, with counts", () => {
    const bytes = buildXlsx({
      sheets: [
        { name: "A", cells: [{ addr: "A1", v: 1 }, { addr: "A2", f: "A1+1", v: 2 }] },
        { name: "B", cells: [{ addr: "A1", f: "A!A2*2", v: 4 }] },
      ],
    });
    const index = readWorkbook(bytes);
    expect(index.sheets.map((s) => s.name)).toEqual(["A", "B"]);
    expect(index.counts).toEqual({ sheets: 2, cells: 3, formulas: 2 });
  });

  it("indexes defined names, workbook-wide and sheet-local", () => {
    const bytes = buildXlsx({
      sheets: [{ name: "Sheet1", cells: [{ addr: "A1", v: 1 }] }, { name: "S2", cells: [{ addr: "A1", v: 2 }] }],
      definedNames: [{ name: "rate", ref: "Sheet1!$A$1" }, { name: "loc", ref: "S2!$A$1", localSheetId: 1 }],
    });
    const { names } = readWorkbook(bytes);
    expect(names).toContainEqual({ name: "rate", ref: "Sheet1!$A$1", sheet: null });
    expect(names).toContainEqual({ name: "loc", ref: "S2!$A$1", sheet: "S2" });
  });
});

describe("readWorkbook: strings", () => {
  it("a string over 2,000 characters is cut to 2,000 ending in an ellipsis, and counted", () => {
    const index = readWorkbook(one([{ addr: "A1", v: "x".repeat(2001) }, { addr: "A2", v: "y".repeat(2000) }]));
    const [a1, a2] = index.sheets[0].cells;
    expect(a1[2]).toBe("x".repeat(1999) + "\u2026");
    expect((a1[2] as string).length).toBe(2000);
    expect(a2[2]).toBe("y".repeat(2000));
    expect(index.stringsCut).toBe(1);
  });
});

describe("readWorkbook: refusals, each with its own code", () => {
  const many = (n: number, fn: (i: number) => CellSpec): CellSpec[] => Array.from({ length: n }, (_, i) => fn(i));

  it("31 sheets (30 are fine)", () => {
    const sheets = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `S${i + 1}`, cells: [{ addr: "A1", v: i }] }));
    expect(refused(() => readWorkbook(buildXlsx({ sheets: sheets(31) })))).toBe("too_many_sheets");
    expect(readWorkbook(buildXlsx({ sheets: sheets(30) })).counts.sheets).toBe(30);
  });

  it("100,001 cells (100,000 are fine)", { timeout: 60_000 }, () => {
    // 1,000 columns of 100 rows each would be nicer, but Excel's column letters are what the builder writes: 100 columns x 1,001 rows.
    const grid = (n: number) => many(n, (i) => ({ addr: `${colLetters((i % 100) + 1)}${Math.floor(i / 100) + 1}`, v: i }));
    expect(refused(() => readWorkbook(one(grid(100_001))))).toBe("too_many_cells");
    expect(readWorkbook(one(grid(100_000))).counts.cells).toBe(100_000);
  });

  it("20,001 formulas (20,000 are fine)", { timeout: 60_000 }, () => {
    const grid = (n: number) => many(n, (i) => ({ addr: `${colLetters((i % 50) + 1)}${Math.floor(i / 50) + 1}`, f: `${i}+1`, v: i + 1 }));
    expect(refused(() => readWorkbook(one(grid(20_001))))).toBe("too_many_formulas");
    expect(readWorkbook(one(grid(20_000))).counts.formulas).toBe(20_000);
  });

  it("a formula of 8,193 characters (8,192 are fine)", () => {
    const formula = (n: number) => "1" + "+1".repeat((n - 1) / 2);
    expect(formula(8193)).toHaveLength(8193);
    expect(refused(() => readWorkbook(one([{ addr: "A1", f: formula(8193), v: 1 }])))).toBe("formula_too_long");
    const exact = formula(8191) + "1";
    expect(exact).toHaveLength(8192);
    expect(readWorkbook(one([{ addr: "A1", f: exact, v: 1 }])).counts.formulas).toBe(1);
  });

  it("a defined name that points outside the workbook", () => {
    for (const ref of ["[1]Sheet1!$A$1", "'[1]Sheet one'!$A$1:$A$3", "'C:\\data\\[Book.xlsx]Sheet1'!$A$1", "https://example.com/x.xlsx", "file:///c:/x"]) {
      expect(refused(() => readWorkbook(one([{ addr: "A1", v: 1 }], { definedNames: [{ name: "ext", ref }] })))).toBe("external_name");
    }
  });

  it("more than 500 defined names", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `n${i}`, ref: "Sheet1!$A$1" }));
    expect(refused(() => readWorkbook(one([{ addr: "A1", v: 1 }], { definedNames: names(501) })))).toBe("too_many_names");
    expect(readWorkbook(one([{ addr: "A1", v: 1 }], { definedNames: names(500) })).names).toHaveLength(500);
  });

  it("a 1904 workbook", () => {
    expect(refused(() => readWorkbook(one([{ addr: "A1", v: 1 }], { date1904: true })))).toBe("date_1904");
  });

  it("a file over 10 MB, before it is even opened", () => {
    expect(refused(() => readWorkbook(new Uint8Array(10 * 1024 * 1024 + 1)))).toBe("too_big");
  });

  it("not an xlsx at all, and a row past 20,000", () => {
    expect(refused(() => readWorkbook(new TextEncoder().encode("a,b\n1,2\n")))).toBe("not_xlsx");
    expect(refused(() => readWorkbook(one([{ addr: "A20001", v: 1 }])))).toBe("too_many_rows");
  });

  it("the refusal carries no text from the file", () => {
    try {
      readWorkbook(one([{ addr: "A1", v: 1 }], { definedNames: [{ name: "SECRET_NAME", ref: "[1]SecretSheet!$A$1" }] }));
    } catch (error) {
      expect((error as Error).message).not.toMatch(/SECRET|SecretSheet/);
    }
  });
});

describe("the packages that read workbooks", () => {
  const pkg = (name: string) => JSON.parse(readFileSync(new URL(`../../../node_modules/${name}/package.json`, import.meta.url), "utf8")) as { version: string; license: string };
  const ok = /^(MIT|Apache-2\.0|MIT\/Apache-2\.0)$/;

  it("the installed xlsx is 0.20.3 or later (the npm 0.18.5 has two published CVEs)", () => {
    const [major, minor, patch] = pkg("xlsx").version.split(".").map(Number);
    expect(major * 1e6 + minor * 1e3 + patch).toBeGreaterThanOrEqual(0 * 1e6 + 20 * 1e3 + 3);
  });

  it("xlsx comes from the SheetJS CDN tarball in package.json, never the registry", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
    expect(manifest.dependencies.xlsx).toBe("https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz");
  });

  it("xlsx, @ironcalc/nodejs and @ironcalc/wasm are licensed MIT or Apache-2.0", () => {
    for (const name of ["xlsx", "@ironcalc/nodejs", "@ironcalc/wasm"]) expect(pkg(name).license, name).toMatch(ok);
  });

  it("the IronCalc packages are pinned exactly", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
    expect(manifest.dependencies["@ironcalc/nodejs"]).toBe("0.8.3");
    expect(manifest.dependencies["@ironcalc/wasm"]).toBe("0.8.4");
  });
});
