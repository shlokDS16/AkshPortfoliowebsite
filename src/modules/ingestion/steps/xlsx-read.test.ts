import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostile } from "../../../../scripts/fixtures/make-models";
import { XLSX_MAX_BYTES } from "@/modules/documents";
import { REFUSAL_MESSAGES, XlsxRefusal, type RefusalCode } from "@/modules/valuation/client";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { createMemoryValuationRepo, versionRow, type MemoryValuationRepo } from "@/test/fakes/valuation-repo";
import { machineDocuments, type StepDeps } from "../deps";
import type { Step, StepContext } from "../types";
import { createXlsxRead, XLSX_NO_VERSION, XLSX_NOT_STORED, XLSX_WRONG_FILE } from "./xlsx-read";

// xlsx_read (Plan 2.7 Task 2, spec s5): download, read (size, zip scan, SheetJS, IronCalc in a child process, diff, graph, suggestions), store
// models/<versionId>.json, set the version's machine columns. One step; no Groq, OCR or Whisper; never an AI wait reason.

const DOC = "22222222-2222-4222-8222-222222222222";
const VERSION = "aaaaaaaa-0000-4000-8000-0000000000a1";
const PATH = `${DOC}.xlsx`;
const MODEL_PATH = `models/${VERSION}.json`;
const T0 = Date.parse("2026-10-15T10:00:00Z");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fixture = () => new Uint8Array(readFileSync(new URL("../../../../e2e/fixtures/model-small.xlsx", import.meta.url)));

function world(bytes: Uint8Array, over: { kind?: "xlsx" | "pdf"; originalDeletedAt?: string | null; sha256?: string; version?: ReturnType<typeof versionRow> | null; path?: string | null } = {}) {
  const documents: MemoryDocumentsRepo = createMemoryDocumentsRepo();
  documents.docs.set(DOC, {
    id: DOC, companyId: "cccccccc-0000-4000-8000-000000000001", title: "Kaveri model", kind: over.kind ?? "xlsx", storagePath: over.path === undefined ? PATH : over.path,
    sha256: over.sha256 ?? sha(bytes), bytes: bytes.byteLength, pageCount: null, status: "active", llmPageBudget: 20, basis: "consolidated", sourceType: "Other",
    filedOn: null, sourceUrl: null, originalDeletedAt: over.originalDeletedAt ?? null, transcriptStatus: null, createdAt: new Date(T0).toISOString(),
  });
  documents.files.set(PATH, bytes);
  const valuation: MemoryValuationRepo = createMemoryValuationRepo();
  const version = over.version === undefined ? versionRow({ id: VERSION, documentId: DOC }) : over.version;
  if (version) valuation.versions.set(version.id, version);
  return { documents, valuation };
}

type Clock = () => number;
function ctx(w: ReturnType<typeof world>, over: { clock?: Clock; deadline?: number } = {}): StepContext {
  const clock = over.clock ?? (() => T0);
  const deps: StepDeps = {
    llm: null, ocr: null, transcriber: null,
    models: { text: "t", vision: "v", classify: "c", whisper: "w" },
    repos: {
      documents: machineDocuments(w.documents), usage: createMemoryUsageRepo(), proposals: createMemoryProposalsRepo(), research: createMemoryResearch(),
      digests: createMemoryDigestsRepo(), valuation: w.valuation,
    },
    now: () => new Date(T0),
    clock,
  };
  const step: Step = {
    id: "s", jobId: "j", kind: "xlsx_read", pageNo: 1, pass: 1, args: {}, status: "running", schemaFailures: 0, providerFailures: 0, leaseExpiries: 0,
    notBefore: new Date(T0).toISOString(), leaseOwner: "o", lastError: null,
  };
  return { step, documentId: DOC, deadline: over.deadline ?? T0 + 240_000, deps };
}

afterEach(() => vi.restoreAllMocks());

describe("xlsx_read on the committed fixture (the real reader and the real engine)", () => {
  const run = createXlsxRead();

  it("stores the model object, sets the machine columns and the version is ready", async () => {
    const w = world(fixture());
    const outcome = await run(ctx(w));
    expect(outcome).toMatchObject({ kind: "done", result: { sheets: 3 } });
    expect(outcome.kind === "done" && outcome.enqueue).toBeFalsy();

    const stored = JSON.parse(new TextDecoder().decode(w.valuation.models.get(MODEL_PATH)!));
    expect(stored).toMatchObject({ modelVersion: 1, engine: { sheetjs: "0.20.3", ironcalcNode: "0.8.3", ironcalcWasm: "0.8.4" } });
    expect(typeof stored.engineBytes).toBe("string");

    const v = w.valuation.versions.get(VERSION)!;
    expect(v).toMatchObject({
      status: "ready", refusal: null, modelPath: MODEL_PATH, sheetCount: stored.index.counts.sheets, cellCount: stored.index.counts.cells,
      formulaCount: stored.index.counts.formulas, readAt: new Date(T0).toISOString(), engine: stored.engine,
    });
    expect(v.report).toEqual(stored.report);
    // The stored report is the machine report; none of Aksh's fields exist on a version.
    expect(Object.keys(v)).not.toContain("label");
  });

  it("is idempotent: a re-run overwrites the object and the columns", async () => {
    const w = world(fixture());
    await run(ctx(w));
    const first = w.valuation.versions.get(VERSION)!;
    expect(await run(ctx(w))).toMatchObject({ kind: "done" });
    expect(w.valuation.models.size).toBe(1);
    expect(w.valuation.versions.get(VERSION)).toMatchObject({ status: "ready", sheetCount: first.sheetCount, cellCount: first.cellCount, formulaCount: first.formulaCount });
    expect(w.valuation.reads).toHaveLength(2);
  });

  it("never asks for a wait: the outcome is done, attention or a thrown error, never defer", async () => {
    const outcome = await run(ctx(world(fixture())));
    expect(outcome.kind).not.toBe("defer");
    expect(outcome.kind).not.toBe("retry");
  });

  it("leaves a confirmed version alone: nothing is read or written", async () => {
    const w = world(fixture(), { version: versionRow({ id: VERSION, documentId: DOC, status: "confirmed", confirmedAt: "2026-10-15T09:00:00.000Z", modelPath: MODEL_PATH, readAt: "2026-10-15T08:00:00.000Z" }) });
    expect(await run(ctx(w))).toMatchObject({ kind: "done", result: { skipped: "confirmed" } });
    expect(w.valuation.reads).toHaveLength(0);
    expect(w.valuation.models.size).toBe(0);
  });

  it("refuses a file that is not a workbook, an old .xls, and a macro workbook renamed .xlsx, each with its sentence", async () => {
    const cases: [string, Uint8Array, RefusalCode][] = [
      ["text", new TextEncoder().encode("this is not a workbook at all"), "not_xlsx"],
      ["xls", Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]), "password_or_xls"],
      ["macro", hostile()["macro-renamed.xlsx"], "macros"],
    ];
    for (const [, bytes, code] of cases) {
      const w = world(bytes);
      expect(await run(ctx(w))).toEqual({ kind: "attention", error: REFUSAL_MESSAGES[code] });
      expect(w.valuation.versions.get(VERSION)).toMatchObject({ status: "refused", refusal: code, modelPath: null });
      expect(w.valuation.models.size).toBe(0);
    }
  });

  it("refuses a file over 10 MB as too big", async () => {
    const w = world(new Uint8Array(XLSX_MAX_BYTES + 1));
    expect(await run(ctx(w))).toEqual({ kind: "attention", error: REFUSAL_MESSAGES.too_big });
    expect(w.valuation.versions.get(VERSION)).toMatchObject({ status: "refused", refusal: "too_big" });
  });

  it("ends in needs attention when the read passes its 180 seconds, with the too-large sentence", async () => {
    const w = world(fixture());
    let calls = 0;
    // The step reads the clock once to size the budget and the reader once more as the read starts; every later reading is 181 s on.
    const clock = () => (calls++ < 2 ? T0 : T0 + 181_000);
    const outcome = await run(ctx(w, { clock }));
    expect(outcome).toEqual({ kind: "attention", error: REFUSAL_MESSAGES.too_slow });
    expect(w.valuation.versions.get(VERSION)).toMatchObject({ status: "refused", refusal: "too_slow" });
  });
});

describe("xlsx_read with an injected reader", () => {
  it.each(Object.keys(REFUSAL_MESSAGES) as RefusalCode[])("refusal %s: the version is refused with the code and the card gets its sentence", async (code) => {
    const w = world(fixture());
    const outcome = await createXlsxRead({ build: async () => { throw new XlsxRefusal(code); } })(ctx(w));
    expect(outcome).toEqual({ kind: "attention", error: REFUSAL_MESSAGES[code] });
    expect(w.valuation.versions.get(VERSION)).toMatchObject({ status: "refused", refusal: code });
    expect(w.valuation.reads.at(-1)?.read).toMatchObject({ status: "refused", refusal: code, readAt: new Date(T0).toISOString() });
  });

  it("maps any other error to engine_failed and logs only its class name, never its message or a cell", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const w = world(fixture());
    const outcome = await createXlsxRead({ build: async () => { throw new TypeError("cannot read DCF!B2 = 0.115 (Cost of equity)"); } })(ctx(w));
    expect(outcome).toEqual({ kind: "attention", error: REFUSAL_MESSAGES.engine_failed });
    expect(w.valuation.versions.get(VERSION)).toMatchObject({ status: "refused", refusal: "engine_failed" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).toContain("TypeError");
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/DCF|0\.115|Cost of equity|cannot read/);
  });

  it("gives the reader the 180 second budget, less when the drain has little time left, and the step's clock", async () => {
    const seen: { budgetMs?: number; now?: () => number }[] = [];
    const build = async (_bytes: Uint8Array, opts: { budgetMs?: number; now?: () => number } = {}) => {
      seen.push(opts);
      throw new XlsxRefusal("too_slow");
    };
    const w = world(fixture());
    await createXlsxRead({ build })(ctx(w, { deadline: T0 + 240_000 }));
    await createXlsxRead({ build })(ctx(w, { deadline: T0 + 50_000 }));
    await createXlsxRead({ build })(ctx(w, { deadline: T0 - 10_000 }));
    expect(seen.map((o) => o.budgetMs)).toEqual([180_000, 105_000, 45_000]);
    expect(seen[0].now?.()).toBe(T0);
  });

  it("stores the object before it marks the version ready (a failed upload leaves the version as it was and the step is retried)", async () => {
    const w = world(fixture());
    w.valuation.failNext("putModel", new Error("storage down"));
    const run = createXlsxRead();
    await expect(run(ctx(w))).rejects.toThrow("storage down");
    expect(w.valuation.versions.get(VERSION)?.status).toBe("reading");
    expect(w.valuation.reads).toHaveLength(0);
  });
});

describe("xlsx_read when the stored file or the version record is not as expected", () => {
  const run = createXlsxRead({ build: async () => { throw new Error("must not be called"); } });

  it("says the file is gone when the original was deleted, the path is missing, or the document is not a workbook", async () => {
    for (const over of [{ originalDeletedAt: "2026-10-14T00:00:00Z" }, { path: null }, { kind: "pdf" as const }]) {
      expect(await run(ctx(world(fixture(), over)))).toEqual({ kind: "attention", error: XLSX_NOT_STORED });
    }
    const missing = world(fixture());
    missing.documents.files.clear();
    await expect(run(ctx(missing))).rejects.toThrow(); // a storage failure is retried by the runner, not shown
  });

  it("says the file is not the one uploaded when its hash differs", async () => {
    expect(await run(ctx(world(fixture(), { sha256: "f".repeat(64) })))).toEqual({ kind: "attention", error: XLSX_WRONG_FILE });
  });

  it("says so when the document has no version record", async () => {
    expect(await run(ctx(world(fixture(), { version: null })))).toEqual({ kind: "attention", error: XLSX_NO_VERSION });
  });
});
