import { createHash } from "node:crypto";
import { READ_BUDGET_MS, REFUSAL_MESSAGES, refusalMessage, XlsxRefusal, type ModelObject, type RefusalCode } from "@/modules/valuation/client";
import { buildModel, type BuildOptions } from "@/modules/valuation";
import type { StepHandler, StepOutcome } from "../types";

// xlsx_read (Plan 2.7 Task 2, spec s5 and s8): the one step of the job kind ingest_xlsx. It downloads the stored workbook, reads it with the
// valuation module (size and zip checks, SheetJS, IronCalc in a child process killed at its deadline, the diff against Excel's saved values,
// the reference graph, the suggestions), stores the model object at models/<versionId>.json and sets the version's machine columns. Every
// write is idempotent, so a duplicate or reclaimed step is harmless; a confirmed version is never touched. No Groq, OCR or Whisper is
// called and the step is never parked with a wait reason: it finishes, it refuses with a sentence, or it throws and the runner retries.
//
// Nothing from the workbook reaches a log, a step's last_error or a heartbeat: a refusal is a code with a fixed sentence, and any other
// failure is logged by its class name only.

export const XLSX_NOT_STORED = "The stored workbook is no longer there, so it cannot be read. Upload it again.";
export const XLSX_WRONG_FILE = "The stored file is not the workbook that was uploaded. Upload it again.";
export const XLSX_NO_VERSION = "This workbook has no model record. Upload it again.";

/** The drain's budget ends at DRAIN_MS but the function lives to 300 s (maxDuration): a read that starts late may use that slack and no more. */
const FUNCTION_SLACK_MS = 55_000;
/** A read is never given less than this: a slow start of the engine's process is not taken for a heavy workbook. */
const MIN_BUDGET_MS = 30_000;

export type Build = (bytes: Uint8Array, opts: BuildOptions) => Promise<ModelObject>;

// buildModel loads the native engine on its first call, not when this file is imported (valuation/index.ts).
const defaultBuild: Build = (bytes, opts) => buildModel(bytes, opts);

const attention = (error: string): StepOutcome => ({ kind: "attention", error });
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** The refusal code of an error, or null when it is not a refusal. By name as well as by class, so a second copy of the module still counts. */
function refusalCode(error: unknown): RefusalCode | null {
  if (error instanceof XlsxRefusal) return error.code;
  const e = error as { name?: unknown; code?: unknown } | null;
  return e?.name === "XlsxRefusal" && typeof e.code === "string" && e.code in REFUSAL_MESSAGES ? (e.code as RefusalCode) : null;
}

export function createXlsxRead({ build = defaultBuild }: { build?: Build } = {}): StepHandler {
  return async ({ documentId, deadline, deps }) => {
    const documents = deps.repos.documents;
    const valuation = deps.repos.valuation;

    const doc = await documents.get(documentId);
    if (!doc || doc.kind !== "xlsx") return attention(XLSX_NOT_STORED);
    const version = await valuation.getByDocument(documentId);
    if (!version) return attention(XLSX_NO_VERSION);
    // His cells were chosen against this very model object: it is never replaced.
    if (version.status === "confirmed") return { kind: "done", result: { skipped: "confirmed" } };
    if (!doc.storagePath || doc.originalDeletedAt) return attention(XLSX_NOT_STORED);

    // A storage failure throws: the runner retries the step (1 and 2 minutes) before showing its give-up sentence.
    const bytes = await documents.download(doc.storagePath);
    if (sha256(bytes) !== doc.sha256) return attention(XLSX_WRONG_FILE);

    const readAt = deps.now().toISOString();
    const refuse = async (code: RefusalCode): Promise<StepOutcome> => {
      await valuation.saveRead(version.id, { status: "refused", refusal: code, readAt });
      return attention(refusalMessage(code));
    };

    // 180 s from the start of the read (spec s4.6), less when the drain is nearly out of time.
    const budgetMs = Math.max(MIN_BUDGET_MS, Math.min(READ_BUDGET_MS, deadline - deps.clock() + FUNCTION_SLACK_MS));
    let model: ModelObject;
    try {
      model = await build(bytes, { now: deps.clock, budgetMs });
    } catch (error) {
      const code = refusalCode(error);
      if (code) return refuse(code);
      console.error("xlsx_read failed", error instanceof Error ? error.name : "unknown");
      return refuse("engine_failed");
    }

    // The object first, the columns second: a version is `ready` only when its object is there.
    const path = `models/${version.id}.json`;
    await valuation.putModel(path, new TextEncoder().encode(JSON.stringify(model)));
    const { sheets, cells, formulas } = model.index.counts;
    await valuation.saveRead(version.id, { status: "ready", modelPath: path, sheetCount: sheets, cellCount: cells, formulaCount: formulas, report: model.report, engine: model.engine, readAt });
    return { kind: "done", result: { sheets, cells, formulas } };
  };
}

export const xlsxRead: StepHandler = createXlsxRead();
