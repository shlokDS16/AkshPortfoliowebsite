import { afterEach, describe, expect, it, vi } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import { createMemoryValuationRepo, versionRow, type MemoryValuationRepo } from "@/test/fakes/valuation-repo";
import { runConfirm, runDeleteScenario, runModelUrl, runSaveScenario } from "./flows";
import type { ModelObject } from "./types";

// The server actions' logic against a memory repo (Plan 2.7 Task 2): validation of the browser's claim, the version's state, the checks
// against the model object, and what is passed to the database. The actions themselves only check the admin and build the repo.

const VERSION = "aaaaaaaa-0000-4000-8000-0000000000a1";
const PATH = `models/${VERSION}.json`;

const model = (): ModelObject => ({
  modelVersion: 1,
  engine: { sheetjs: "0.20.3", ironcalcNode: "0.8.3", ironcalcWasm: "0.8.4" },
  index: {
    sheets: [
      {
        name: "DCF",
        arrays: [],
        cells: [
          ["B2", null, 0.11, "n", "0.0%"],
          ["B3", null, 0.03, "n", "0.0%"],
          ["B4", null, 45000, "n", "dd-mmm-yy"],
          ["B8", "B2*100", 11, "n", null],
          ["B9", "B3*100", 3, "n", null],
          ["B10", "B2+B7", 1, "n", null],
          ["B7", "CUBEVALUE()", 5, "n", null],
          ["C1", "B2*2", 0.22, "n", null],
        ],
      },
    ],
    names: [],
    counts: { sheets: 1, cells: 8, formulas: 5 },
    stringsCut: 0,
  },
  classes: { "DCF!B7": "differs" },
  taint: ["DCF!B10", "DCF!B7"],
  dynamic: [],
  // The sheet labels are machine text; none of it may reach his label field.
  suggestions: {
    inputs: [{ sheet: "DCF", addr: "B2", value: 0.11, z: "0.0%", dependents: 3, label: "Cost of equity" }],
    outputs: [{ sheet: "DCF", addr: "B8", value: 11, z: null, precedents: 1, label: "Value per share" }],
  },
  report: { counts: { match: 4, differs: 1, unsupported: 0, cycle: 0, no_cache: 0, random: 0, dated: 0 }, listed: [], unimplemented: [], tainted: 1, dynamic: 0 },
  engineBytes: "",
});

function ready(over: Partial<ReturnType<typeof versionRow>> = {}, object: unknown = model()): MemoryValuationRepo {
  const repo = createMemoryValuationRepo();
  repo.versions.set(VERSION, versionRow({ id: VERSION, status: "ready", modelPath: PATH, readAt: "2026-10-15T09:01:00.000Z", ...over }));
  repo.models.set(PATH, new TextEncoder().encode(typeof object === "string" ? object : JSON.stringify(object)));
  return repo;
}

const cell = (addr: string, role: "input" | "output", label: string | null = null) => ({ sheet: "DCF", addr, role, label });
const good = () => ({ versionId: VERSION, cells: [cell("B2", "input"), cell("B3", "input", "  Terminal growth  "), cell("B8", "output"), cell("B9", "output", "")] });

afterEach(() => vi.restoreAllMocks());

describe("runConfirm", () => {
  it("confirms a ready version: his labels trimmed, a blank one null, and never a sheet label put in his field", async () => {
    const repo = ready();
    expect(await runConfirm(repo, good())).toEqual({ ok: true });
    const stored = repo.cells.get(VERSION)!;
    expect(stored.map((c) => [c.addr, c.role, c.label])).toEqual([["B2", "input", null], ["B3", "input", "Terminal growth"], ["B8", "output", null], ["B9", "output", null]]);
    expect(JSON.stringify(stored)).not.toContain("Cost of equity");
    expect(JSON.stringify(stored)).not.toContain("Value per share");
    expect(repo.versions.get(VERSION)?.status).toBe("confirmed");
  });

  it.each([
    ["an extra key", { ...good(), extra: 1 }],
    ["a cell with an extra key", { versionId: VERSION, cells: [{ ...cell("B2", "input"), nope: 1 }, cell("B8", "output")] }],
    ["a version id that is not a uuid", { ...good(), versionId: "x" }],
    ["no inputs", { versionId: VERSION, cells: [cell("B8", "output")] }],
    ["no results", { versionId: VERSION, cells: [cell("B2", "input")] }],
    ["41 inputs", { versionId: VERSION, cells: [...Array.from({ length: 41 }, (_, i) => cell(`Z${i + 1}`, "input")), cell("B8", "output")] }],
    ["21 results", { versionId: VERSION, cells: [cell("B2", "input"), ...Array.from({ length: 21 }, (_, i) => cell(`Y${i + 1}`, "output"))] }],
    ["the same cell twice", { versionId: VERSION, cells: [cell("B2", "input"), cell("B2", "output"), cell("B8", "output")] }],
    ["a lower-case address", { versionId: VERSION, cells: [cell("b2", "input"), cell("B8", "output")] }],
    ["a role of target", { versionId: VERSION, cells: [{ ...cell("B2", "input"), role: "target" }, cell("B8", "output")] }],
    ["a label over 80 characters", { versionId: VERSION, cells: [cell("B2", "input", "l".repeat(81)), cell("B8", "output")] }],
    ["a sheet name over 31 characters", { versionId: VERSION, cells: [{ ...cell("B2", "input"), sheet: "s".repeat(32) }, cell("B8", "output")] }],
    ["a label with a control character", { versionId: VERSION, cells: [cell("B2", "input", "Cost\u0007"), cell("B8", "output")] }],
    ["a label with a C1 control character", { versionId: VERSION, cells: [cell("B2", "input", "Cost\u0085of equity"), cell("B8", "output")] }],
    ["a sheet name with a control character", { versionId: VERSION, cells: [{ ...cell("B2", "input"), sheet: "D\u0001CF" }, cell("B8", "output")] }],
    ["nothing", null],
    ["a string", "confirm"],
  ])("refuses %s as a bad request, before the database", async (_what, input) => {
    const repo = ready();
    const spy = vi.spyOn(repo, "confirm");
    expect(await runConfirm(repo, input)).toMatchObject({ ok: false, code: "bad_request" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses an unknown version, a version that is still being read, a refused one and a confirmed one", async () => {
    expect(await runConfirm(createMemoryValuationRepo(), good())).toMatchObject({ ok: false, code: "not_found" });
    expect(await runConfirm(ready({ status: "reading", modelPath: null }), good())).toMatchObject({ ok: false, code: "not_ready" });
    expect(await runConfirm(ready({ status: "refused", refusal: "macros", modelPath: null }), good())).toMatchObject({ ok: false, code: "not_ready" });
    expect(await runConfirm(ready({ status: "confirmed", confirmedAt: "2026-10-15T09:30:00.000Z" }), good())).toMatchObject({ ok: false, code: "already_confirmed" });
  });

  it("refuses a model object that is missing or is not a model", async () => {
    const missing = ready();
    missing.models.clear();
    expect(await runConfirm(missing, good())).toMatchObject({ ok: false, code: "model_unreadable" });
    expect(await runConfirm(ready({}, "not json {"), good())).toMatchObject({ ok: false, code: "model_unreadable" });
    expect(await runConfirm(ready({}, { modelVersion: 2 }), good())).toMatchObject({ ok: false, code: "model_unreadable" });
  });

  it("refuses a formula as an input, a date as an input, and a tainted result, naming the cell", async () => {
    const withCells = (...cells: ReturnType<typeof cell>[]) => ({ versionId: VERSION, cells });
    expect(await runConfirm(ready(), withCells(cell("C1", "input"), cell("B8", "output")))).toMatchObject({ ok: false, code: "input_formula", cell: "DCF!C1" });
    expect(await runConfirm(ready(), withCells(cell("B4", "input"), cell("B8", "output")))).toMatchObject({ ok: false, code: "input_date", cell: "DCF!B4" });
    expect(await runConfirm(ready(), withCells(cell("B2", "input"), cell("B10", "output")))).toMatchObject({ ok: false, code: "output_tainted", cell: "DCF!B10" });
    const repo = ready();
    await runConfirm(repo, withCells(cell("C1", "input"), cell("B8", "output")));
    expect(repo.versions.get(VERSION)?.status).toBe("ready");
  });

  it("answers with a fixed sentence that holds nothing from the workbook", async () => {
    const result = await runConfirm(ready(), { versionId: VERSION, cells: [cell("C1", "input"), cell("B8", "output")] });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/formula/) });
    if (!result.ok) expect(result.message).not.toMatch(/DCF|C1/);
  });

  it("turns a lost race into the right sentence, and an unexpected failure into one that logs the class name only", async () => {
    const raced = ready();
    raced.failNext("confirm", new DbError("valuation.confirm", "55000", null));
    expect(await runConfirm(raced, good())).toMatchObject({ ok: false, code: "already_confirmed" });

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = ready();
    broken.failNext("confirm", new Error("connection reset while writing DCF!B2 = 0.11"));
    expect(await runConfirm(broken, good())).toMatchObject({ ok: false, code: "save_failed" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("DCF");
    expect(JSON.stringify(log.mock.calls)).toContain("Error");
  });
});

describe("runSaveScenario", () => {
  async function confirmed() {
    const repo = ready();
    await runConfirm(repo, good());
    const ids = Object.fromEntries(repo.cells.get(VERSION)!.map((c) => [c.addr, c.id]));
    return { repo, ids };
  }

  it("saves the values of his inputs under his name", async () => {
    const { repo, ids } = await confirmed();
    const result = await runSaveScenario(repo, { versionId: VERSION, name: " Bear ", note: "slow growth", values: { [ids.B2]: 0.135, [ids.B3]: 0.02 } });
    expect(result).toMatchObject({ ok: true, id: expect.any(String) });
    const saved = [...repo.scenarios.values()][0];
    expect(saved).toMatchObject({ versionId: VERSION, name: "Bear", note: "slow growth" });
    expect(saved.values).toEqual([{ cellId: ids.B2, value: 0.135 }, { cellId: ids.B3, value: 0.02 }]);
  });

  it("refuses a value for a result, a text value, and an out-of-range value, as scenario_values", async () => {
    const { repo, ids } = await confirmed();
    for (const values of [{ [ids.B8]: 1 }, { [ids.B2]: "1" }, { [ids.B2]: 2e15 }, {}]) {
      expect(await runSaveScenario(repo, { versionId: VERSION, name: "Bear", values })).toMatchObject({ ok: false, code: "scenario_values" });
    }
    expect(repo.scenarios.size).toBe(0);
  });

  it("refuses a bad name, a repeated name, and a version that is not confirmed", async () => {
    const { repo, ids } = await confirmed();
    expect(await runSaveScenario(repo, { versionId: VERSION, name: "  ", values: { [ids.B2]: 1 } })).toMatchObject({ ok: false, code: "scenario_name" });
    expect(await runSaveScenario(repo, { versionId: VERSION, name: "Bear", values: { [ids.B2]: 1 } })).toMatchObject({ ok: true });
    expect(await runSaveScenario(repo, { versionId: VERSION, name: "Bear", values: { [ids.B2]: 2 } })).toMatchObject({ ok: false, code: "name_taken" });
    expect(await runSaveScenario(ready(), { versionId: VERSION, name: "Bear", values: { [ids.B2]: 1 } })).toMatchObject({ ok: false, code: "not_confirmed" });
    expect(await runSaveScenario(createMemoryValuationRepo(), { versionId: VERSION, name: "Bear", values: { [ids.B2]: 1 } })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("a control character in the name or the note is scenario_name; a note may hold line breaks", async () => {
    const { repo, ids } = await confirmed();
    for (const body of [{ name: "Be\nar" }, { name: "Bear\u0007" }, { name: "Bear", note: "a\u0007b" }, { name: "Bear", note: "a\u0085b" }]) {
      expect(await runSaveScenario(repo, { versionId: VERSION, ...body, values: { [ids.B2]: 1 } })).toMatchObject({ ok: false, code: "scenario_name" });
    }
    expect(repo.scenarios.size).toBe(0);
    expect(await runSaveScenario(repo, { versionId: VERSION, name: "Bear", note: "one\n\ttwo\r\nthree", values: { [ids.B2]: 1 } })).toMatchObject({ ok: true });
  });

  it("the database's 50-scenario cap (54000) is the generic save sentence, not logged as unexpected", async () => {
    const { repo, ids } = await confirmed();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.failNext("saveScenario", new DbError("valuation.saveScenario", "54000", null));
    expect(await runSaveScenario(repo, { versionId: VERSION, name: "Bear", values: { [ids.B2]: 1 } })).toMatchObject({ ok: false, code: "save_failed" });
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses a claim of the wrong shape", async () => {
    const { repo } = await confirmed();
    for (const input of [null, "x", { versionId: "x", name: "a", values: {} }, { versionId: VERSION, name: "a" }, { versionId: VERSION, name: "a", values: [], extra: 1 }]) {
      expect(await runSaveScenario(repo, input)).toMatchObject({ ok: false, code: "bad_request" });
    }
  });
});

describe("runDeleteScenario", () => {
  it("deletes a scenario by id, and refuses an id that is not a uuid", async () => {
    const repo = createMemoryValuationRepo();
    repo.scenarios.set("bbbbbbbb-0000-4000-8000-000000000099", { id: "bbbbbbbb-0000-4000-8000-000000000099", versionId: VERSION, name: "x", note: "", createdAt: "", values: [] });
    expect(await runDeleteScenario(repo, "not-a-uuid")).toMatchObject({ ok: false, code: "bad_request" });
    expect(await runDeleteScenario(repo, "bbbbbbbb-0000-4000-8000-000000000099")).toEqual({ ok: true });
    expect(repo.scenarios.size).toBe(0);
  });
});

describe("runModelUrl", () => {
  it("signs the model object of a ready or confirmed version for 10 minutes", async () => {
    expect(await runModelUrl(ready(), VERSION)).toEqual({ ok: true, url: `https://storage.test/sign/${PATH}?ttl=600`, expiresInSeconds: 600 });
    expect(await runModelUrl(ready({ status: "confirmed", confirmedAt: "2026-10-15T09:30:00.000Z" }), VERSION)).toMatchObject({ ok: true });
  });

  it("refuses a version with no model, an unknown one, and an id that is not a uuid", async () => {
    expect(await runModelUrl(ready({ status: "reading", modelPath: null }), VERSION)).toMatchObject({ ok: false, code: "not_ready" });
    expect(await runModelUrl(createMemoryValuationRepo(), VERSION)).toMatchObject({ ok: false, code: "not_found" });
    expect(await runModelUrl(ready(), "x")).toMatchObject({ ok: false, code: "bad_request" });
  });
});
