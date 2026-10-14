import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dcfBook } from "@/test/dcf-fixture";
import { runNodeEngine } from "./engine-node";
import { readWorkbook } from "./read-workbook";
import { XlsxRefusal } from "./refusal";
import type { EngineValue } from "./types";
import { ENGINE_VERSIONS, WASM_PUBLIC_PATH } from "./versions";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "desk-engine-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const get = (values: Map<string, EngineValue>, key: string): EngineValue => values.get(key) ?? { kind: "empty" };

describe("runNodeEngine: IronCalc Node recalculates the workbook", () => {
  const bytes = dcfBook();
  const index = readWorkbook(bytes);

  it("computes NPV, XNPV, INDEX/MATCH and INDIRECT", () => {
    const { values } = runNodeEngine(bytes, index, { tmpDir: dir });
    const npv = -100 + 30 / 1.115 + 50 / 1.115 ** 2 + 80 / 1.115 ** 3;
    expect(get(values, "DCF!B3")).toEqual({ kind: "n", v: expect.closeTo(npv, 9) });
    const xnpv = -100 + 30 / 1.115 ** (365 / 365) + 50 / 1.115 ** (730 / 365);
    expect(get(values, "DCF!B4")).toEqual({ kind: "n", v: expect.closeTo(xnpv, 6) });
    expect(get(values, "DCF!B6")).toEqual({ kind: "n", v: 50 });
    expect(get(values, "DCF!B8")).toEqual({ kind: "n", v: 0.115 });
  });

  it("reads strings and booleans by type, and errors by kind", () => {
    const { values } = runNodeEngine(bytes, index, { tmpDir: dir });
    expect(get(values, "DCF!B13")).toEqual({ kind: "s", v: "high" });
    expect(get(values, "DCF!B14")).toEqual({ kind: "b", v: true });
    expect(get(values, "DCF!B15")).toEqual({ kind: "s", v: "Cost of equity x" });
    expect(get(values, "DCF!B12")).toMatchObject({ kind: "e", error: "DIV" });
    expect(get(values, "DCF!B9")).toMatchObject({ kind: "e", error: "NAME" });
    expect(get(values, "DCF!B10")).toMatchObject({ kind: "e", error: "CIRC" });
    expect(get(values, "DCF!B11")).toMatchObject({ kind: "e", error: "CIRC" });
  });

  it("returns values only for formula cells", () => {
    const { values } = runNodeEngine(bytes, index, { tmpDir: dir });
    expect(values.has("DCF!B1")).toBe(false);
    expect(values.has("DCF!B3")).toBe(true);
    expect(values.size).toBe(index.counts.formulas);
  });

  it("returns the engine's bytes and its version", () => {
    const result = runNodeEngine(bytes, index, { tmpDir: dir });
    expect(result.engineBytes.byteLength).toBeGreaterThan(100);
    expect(result.version).toBe(ENGINE_VERSIONS.ironcalcNode);
  });
});

describe("runNodeEngine: the temporary file", () => {
  it("is gone after a successful run", () => {
    const bytes = dcfBook();
    runNodeEngine(bytes, readWorkbook(bytes), { tmpDir: dir });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("is gone after the engine throws, and the refusal carries no text from the engine", () => {
    const garbage = new Uint8Array(500).map((_, i) => (i * 31) & 0xff);
    let caught: unknown;
    try {
      runNodeEngine(garbage, readWorkbook(dcfBook()), { tmpDir: dir });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(XlsxRefusal);
    expect((caught as XlsxRefusal).code).toBe("engine_failed");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("has a random name that is not derived from anything in the workbook", () => {
    const names = new Set<string>();
    const bytes = dcfBook();
    const index = readWorkbook(bytes);
    for (let i = 0; i < 3; i++) runNodeEngine(bytes, index, { tmpDir: dir, onTempFile: (path) => names.add(path) });
    expect(names.size).toBe(3);
    for (const path of names) expect(path).toMatch(/desk-xlsx-[0-9a-f-]{36}\.xlsx$/);
  });
});

describe("the engine versions on record", () => {
  it("equal the installed packages", async () => {
    const read = async (name: string) =>
      (JSON.parse(await (await import("node:fs/promises")).readFile(new URL(`../../../node_modules/${name}/package.json`, import.meta.url), "utf8")) as { version: string }).version;
    expect(await read("xlsx")).toBe(ENGINE_VERSIONS.sheetjs);
    expect(await read("@ironcalc/nodejs")).toBe(ENGINE_VERSIONS.ironcalcNode);
    expect(await read("@ironcalc/wasm")).toBe(ENGINE_VERSIONS.ironcalcWasm);
  });

  it("name the wasm file the postinstall script copies into public/vendor, byte for byte", async () => {
    const { readFile } = await import("node:fs/promises");
    expect(WASM_PUBLIC_PATH).toBe(`/vendor/ironcalc-${ENGINE_VERSIONS.ironcalcWasm}.wasm`);
    const served = await readFile(new URL(`../../../public${WASM_PUBLIC_PATH}`, import.meta.url));
    const packaged = await readFile(new URL("../../../node_modules/@ironcalc/wasm/wasm_bg.wasm", import.meta.url));
    expect(served.equals(packaged)).toBe(true);
  });
});
