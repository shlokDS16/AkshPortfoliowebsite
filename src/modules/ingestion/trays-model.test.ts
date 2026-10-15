import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { REFUSAL_MESSAGES } from "@/modules/valuation/client";
import { readModels } from "./model-read";
import { MODEL_CONFIRMED, MODEL_READING, modelReadText, WORKBOOK_GAVE_UP } from "./model-copy";
import { STOPPED_TWICE } from "./stopped";
import { trayFor, type DocState } from "./trays";

// A valuation workbook in the trays (Plan 2.7 Task 2, spec s8): queued, being read, read (Ready for you, with its counts), refused (Needs
// attention with the exact sentence), too slow or stopped twice (Needs attention with the too-large sentence).

const NOW = new Date("2026-10-15T05:30:00Z");
const EARLIER = "2026-10-15T05:00:00.000Z";
type StepState = DocState["steps"][number];
const step = (over: Partial<StepState> = {}): StepState => ({
  kind: "xlsx_read", status: "queued", notBefore: EARLIER, waitReason: null, pageNo: 1, lastError: null, everClaimed: true, ...over,
});
const doc = (steps: StepState[], over: Partial<DocState> = {}): DocState => ({
  status: "active", pageCount: null, pagesRead: 0, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0, steps, ...over,
});
const read = { status: "ready" as const, sheets: 4, cells: 3912, formulas: 1204 };

describe("a workbook in the trays", () => {
  it("waits to start, is read, then waits for Aksh in Ready with its counts and the next step", () => {
    expect(trayFor(doc([step({ everClaimed: false })]), NOW, null)).toMatchObject({ tray: "waiting" });
    expect(trayFor(doc([step()]), NOW, null)).toMatchObject({ tray: "reading", message: MODEL_READING });
    expect(MODEL_READING).toBe("Reading the workbook");
    const view = trayFor(doc([step({ status: "done" })], { model: read }), NOW, null);
    expect(view).toMatchObject({ tray: "ready", message: "Model read: 4 sheets, 3,912 cells, 1,204 formulas. Choose its inputs and results." });
  });

  it("says one sheet, one cell and one formula in the singular", () => {
    expect(modelReadText({ sheets: 1, cells: 1, formulas: 1 })).toBe("Model read: 1 sheet, 1 cell, 1 formula. Choose its inputs and results.");
  });

  it("is not counted as figures, and shows no pages read", () => {
    const view = trayFor(doc([step({ status: "done" })], { model: read }), NOW, null);
    expect(view.message).not.toMatch(/figure|page/i);
    expect(view).toMatchObject({ extractDone: 0, extractTotal: 0, attentionPages: [] });
  });

  it("stays Ready once the cells are confirmed, and says so", () => {
    const view = trayFor(doc([step({ status: "done" })], { model: { ...read, status: "confirmed" } }), NOW, null);
    expect(view).toMatchObject({ tray: "ready", message: MODEL_CONFIRMED });
  });

  it("is not Ready while the step is still running, even if a model is recorded", () => {
    expect(trayFor(doc([step()], { model: read }), NOW, null).tray).toBe("reading");
  });

  it("shows a refusal as Needs attention with the exact sentence the step stored", () => {
    for (const code of ["macros", "external_links", "password_or_xls"] as const) {
      const view = trayFor(doc([step({ status: "needs_attention", lastError: REFUSAL_MESSAGES[code] })]), NOW, null);
      expect(view).toMatchObject({ tray: "attention", message: REFUSAL_MESSAGES[code], attentionPages: [] });
    }
  });

  it("shows a step that stopped twice with the too-large sentence, not the generic one", () => {
    const view = trayFor(doc([step({ status: "needs_attention", lastError: STOPPED_TWICE })]), NOW, null);
    expect(view).toMatchObject({ tray: "attention", message: REFUSAL_MESSAGES.too_slow });
    expect(view.message).toMatch(/too large to read in one go/);
  });

  it("gives a fallback sentence when a stopped step stored none", () => {
    expect(trayFor(doc([step({ status: "needs_attention" })]), NOW, null)).toMatchObject({ tray: "attention", message: "This workbook could not be read." });
  });

  it("ready workbook copy holds none of the banned words", () => {
    for (const text of [MODEL_READING, MODEL_CONFIRMED, modelReadText(read), WORKBOOK_GAVE_UP]) expect(text).not.toMatch(/\b(target|fair value|intrinsic value|upside|price target|buy|sell)\b/i);
  });
});

/** A PostgREST stand-in for readModels. */
function stub(rows: unknown[] | null, error: { message: string } | null = null) {
  const ops: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "in"]) builder[op] = (...a: unknown[]) => (ops.push([op, ...a]), builder);
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve);
  return { db: { from: vi.fn(() => builder) } as unknown as Db, ops };
}

describe("readModels", () => {
  it("returns each workbook's status and counts, and asks nothing for none", async () => {
    const { db, ops } = stub([
      { document_id: "a", status: "ready", sheet_count: 4, cell_count: 3912, formula_count: 1204 },
      { document_id: "b", status: "confirmed", sheet_count: 1, cell_count: 5, formula_count: 2 },
      { document_id: "c", status: "reading", sheet_count: null, cell_count: null, formula_count: null },
    ]);
    const models = await readModels(db, ["a", "b", "c"]);
    expect(models.get("a")).toEqual({ status: "ready", sheets: 4, cells: 3912, formulas: 1204 });
    expect(models.get("b")).toEqual({ status: "confirmed", sheets: 1, cells: 5, formulas: 2 });
    expect(models.has("c")).toBe(false); // nothing to say until it is read
    expect(ops).toContainEqual(["in", "document_id", ["a", "b", "c"]]);
    const none = stub([]);
    expect((await readModels(none.db, [])).size).toBe(0);
    expect(none.db.from).not.toHaveBeenCalled();
  });

  it("throws a database error carrying the operation", async () => {
    await expect(readModels(stub(null, { message: "boom" }).db, ["a"])).rejects.toThrow(/inbox\.models/);
  });
});

describe("the give-up sentence", () => {
  it("is plain, and does not tell Aksh to enter figures by hand", () => {
    expect(WORKBOOK_GAVE_UP).toMatch(/workbook/);
    expect(WORKBOOK_GAVE_UP).not.toMatch(/figures/);
  });
});
