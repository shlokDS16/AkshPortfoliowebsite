import { beforeEach, describe, expect, it } from "vitest";
import { createTableDb, type TableDb } from "@/test/fakes/table-db";
import { createMemoryValuationRepo, versionRow, type MemoryValuationRepo } from "@/test/fakes/valuation-repo";
import { confirmedModelFor, listModels, loadModelPage } from "./page-read";
import type { VersionRow } from "./records";
import type { ModelObject } from "./types";

// Plan 2.7 final review I4: which mode the model page is in, the "Version N exists" pointer, the carry-forward source, and the list's rule.

const COMPANY = "cccccccc-0000-4000-8000-000000000001";
const OTHER = "cccccccc-0000-4000-8000-000000000002";
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;

const model: ModelObject = {
  modelVersion: 1,
  engine: { sheetjs: "0.20.3", ironcalcNode: "0.8.3", ironcalcWasm: "0.8.4" },
  index: {
    sheets: [
      {
        name: "DCF",
        arrays: [],
        cells: [
          ["A1", null, "Cost of equity", "s", null],
          ["B1", null, 0.115, "n", "0.0%"],
          ["A2", null, "Terminal growth", "s", null],
          ["B2", null, 0.04, "n", "0.0%"],
          ["A3", null, "Equity value", "s", null],
          ["B3", "B1*1000+B2", 115.04, "n", "#,##0.00"],
        ],
      },
    ],
    names: [],
    counts: { sheets: 1, cells: 6, formulas: 1 },
    stringsCut: 0,
  },
  classes: {},
  taint: [],
  dynamic: [],
  suggestions: {
    inputs: [
      { sheet: "DCF", addr: "B1", value: 0.115, z: "0.0%", dependents: 1, label: "Cost of equity" },
      { sheet: "DCF", addr: "B2", value: 0.04, z: "0.0%", dependents: 1, label: "Terminal growth" },
    ],
    outputs: [{ sheet: "DCF", addr: "B3", value: 115.04, z: "#,##0.00", precedents: 2, label: "Equity value" }],
  },
  report: { counts: { match: 1, differs: 0, unsupported: 0, cycle: 0, no_cache: 0, random: 0, dated: 0 }, listed: [], unimplemented: [], tainted: 0, dynamic: 0 },
  engineBytes: "",
};

let repo: MemoryValuationRepo;
let t: TableDb;

/** One version in both places: the repo (what loadModelPage reads through it) and the table (what it reads directly). */
function add(n: number, over: Partial<VersionRow> = {}, company = COMPANY) {
  const v = versionRow({ id: id(n), companyId: company, versionNo: n, modelPath: `models/${id(n)}.json`, createdAt: `2026-10-1${n % 10}T09:00:00.000Z`, ...over });
  repo.versions.set(v.id, v);
  repo.models.set(`models/${v.id}.json`, new TextEncoder().encode(JSON.stringify(model)));
  t.tables.valuation_versions.push({ id: v.id, company_id: v.companyId, document_id: v.documentId, version_no: v.versionNo, status: v.status, model_path: v.modelPath, read_at: v.readAt, created_at: v.createdAt });
  return v;
}

beforeEach(() => {
  repo = createMemoryValuationRepo();
  t = createTableDb({
    valuation_versions: [],
    companies: [
      { id: COMPANY, name: "Kaveri Pumps", nse_symbol: "KAVPUMP" },
      { id: OTHER, name: "Orchid Mills", nse_symbol: null },
    ],
    documents: [{ id: "22222222-2222-4222-8222-222222222222", title: "Kaveri DCF" }],
  });
});

const page = (n: number) => loadModelPage(t.db, id(n), repo);

describe("loadModelPage: the mode follows the status", () => {
  it("refused and reading show their own states without reading the model object", async () => {
    add(1, { status: "refused", refusal: "too_complex" });
    add(2, { status: "reading" });
    repo.models.clear();
    expect((await page(1))?.mode).toBe("refused");
    expect((await page(2))?.mode).toBe("reading");
  });

  it("ready shows the confirm view, with the company label and the file's title", async () => {
    add(1, { status: "ready" });
    const data = await page(1);
    expect(data?.mode).toBe("confirm");
    expect(data?.head).toMatchObject({ company: "$KAVPUMP", fileTitle: "Kaveri DCF", versionNo: 1 });
  });

  it("confirmed shows the scenarios, with his cells", async () => {
    const v = add(1, { status: "confirmed" });
    repo.cells.set(v.id, [{ id: "c1", versionId: v.id, sheet: "DCF", addr: "B1", role: "input", label: "My cost" }]);
    const data = await page(1);
    expect(data?.mode).toBe("scenarios");
    if (data?.mode === "scenarios") expect(data.cells.map((c) => c.label)).toEqual(["My cost"]);
  });

  it("a ready version whose object cannot be read is unreadable, and so is a confirmed one", async () => {
    add(1, { status: "ready" });
    add(2, { status: "confirmed" });
    repo.models.clear();
    expect((await page(1))?.mode).toBe("unreadable");
    expect((await page(2))?.mode).toBe("unreadable");
  });

  it("an object that is not a model is unreadable", async () => {
    add(1, { status: "ready" });
    repo.models.set(`models/${id(1)}.json`, new TextEncoder().encode('{"modelVersion":2}'));
    expect((await page(1))?.mode).toBe("unreadable");
  });

  it("no such version is null", async () => {
    expect(await page(9)).toBeNull();
  });
});

describe("loadModelPage: the pointer to a newer version", () => {
  it("is set only when a higher version of the same company exists", async () => {
    add(1, { status: "confirmed" });
    add(2, { status: "ready" });
    add(1, { id: id(20), status: "confirmed" }, OTHER);
    expect((await page(1))?.head.newer).toEqual({ versionId: id(2), versionNo: 2 });
    expect((await page(2))?.head.newer).toBeNull();
    // The other company's version 1 is not pointed at the first company's version 2.
    expect((await loadModelPage(t.db, id(20), repo))?.head.newer).toBeNull();
  });
});

describe("loadModelPage: the carry-forward source", () => {
  const carriedFrom = async (n: number) => {
    const data = await page(n);
    return data?.mode === "confirm" ? data.confirm.carriedFrom : "not confirm";
  };

  it("is the nearest lower confirmed version, skipping a refused or ready one in between", async () => {
    const one = add(1, { status: "confirmed" });
    const two = add(2, { status: "confirmed" });
    add(3, { status: "refused", refusal: "too_complex" });
    add(4, { status: "ready" });
    add(5, { status: "ready" });
    repo.cells.set(one.id, [{ id: "c1", versionId: one.id, sheet: "DCF", addr: "B2", role: "input", label: null }]);
    repo.cells.set(two.id, [{ id: "c2", versionId: two.id, sheet: "DCF", addr: "B1", role: "input", label: null }]);
    expect(await carriedFrom(5)).toBe(2);
    const data = await page(5);
    if (data?.mode !== "confirm") throw new Error("not confirm");
    expect(data.confirm.inputs.filter((r) => r.carried).map((r) => r.addr)).toEqual(["B1"]);
  });

  it("is nothing when no lower version is confirmed, and a higher confirmed one does not count", async () => {
    add(1, { status: "ready" });
    add(2, { status: "confirmed" });
    expect(await carriedFrom(1)).toBeNull();
  });

  it("is nothing when the earlier version's object cannot be read", async () => {
    const one = add(1, { status: "confirmed" });
    add(2, { status: "ready" });
    repo.cells.set(one.id, [{ id: "c1", versionId: one.id, sheet: "DCF", addr: "B1", role: "input", label: null }]);
    repo.models.delete(`models/${id(1)}.json`);
    expect(await carriedFrom(2)).toBeNull();
  });
});

describe("listModels", () => {
  it("gives one row per company, its highest version, newest first", async () => {
    add(1, { status: "confirmed", createdAt: "2026-10-01T09:00:00.000Z" });
    add(10, { status: "ready", createdAt: "2026-10-05T09:00:00.000Z" });
    add(2, { status: "refused", refusal: "too_complex", createdAt: "2026-10-03T09:00:00.000Z" });
    add(1, { id: id(30), status: "confirmed", createdAt: "2026-10-09T09:00:00.000Z" }, OTHER);
    const rows = await listModels(t.db);
    expect(rows.map((r) => [r.company, r.versionNo, r.status])).toEqual([
      ["Orchid Mills", 1, "confirmed"],
      ["$KAVPUMP", 10, "ready"],
    ]);
  });
});

describe("confirmedModelFor", () => {
  it("is the company's newest confirmed version and ignores a newer ready one", async () => {
    add(1, { status: "confirmed" });
    add(2, { status: "confirmed" });
    add(3, { status: "ready" });
    expect(await confirmedModelFor(t.db, COMPANY)).toEqual({ versionId: id(2), versionNo: 2 });
  });

  it("is null when none is confirmed", async () => {
    add(1, { status: "ready" });
    expect(await confirmedModelFor(t.db, COMPANY)).toBeNull();
    expect(await confirmedModelFor(t.db, OTHER)).toBeNull();
  });
});
