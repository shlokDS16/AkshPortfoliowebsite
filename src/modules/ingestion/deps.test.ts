import { describe, expect, it, vi } from "vitest";
import type { DocumentsRepo } from "@/modules/documents";
import { DEADLINE_MARGIN_MS, LLM_MIN_LEFT_MS, LLM_TIMEOUT_MAX_MS } from "./caps";
import { llmTimeoutMs } from "./deadline";
import { machineDocuments } from "./deps";

describe("machineDocuments (documents.status done/skipped are Aksh's)", () => {
  it("exposes reads and page-text writes only, so job code cannot set a document's status", async () => {
    const update = vi.fn();
    const get = vi.fn(async () => null);
    const full = { get, update } as unknown as DocumentsRepo;
    const machine = machineDocuments(full);
    expect(Object.keys(machine)).toEqual([
      "get", "download", "insertPages", "setPageCount", "listPagesForSelection", "setVerdicts", "setSelection", "getPage", "countSelected", "fillScanPage",
    ]);
    expect("update" in machine).toBe(false);
    await machine.get("doc-1");
    expect(get).toHaveBeenCalledWith("doc-1");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("llmTimeoutMs (ruling R3: a step never outlives its function)", () => {
  const at = (msLeft: number) => llmTimeoutMs(1_000_000, () => 1_000_000 - msLeft);

  it("caps a call at 90 s when there is plenty of time", () => {
    expect(at(200_000)).toBe(LLM_TIMEOUT_MAX_MS);
  });

  it("keeps 10 s free before the deadline", () => {
    expect(at(60_000)).toBe(60_000 - DEADLINE_MARGIN_MS);
    expect(at(LLM_MIN_LEFT_MS)).toBe(LLM_MIN_LEFT_MS - DEADLINE_MARGIN_MS);
  });

  it("is null (defer, no failure) when under 20 s remain", () => {
    expect(at(LLM_MIN_LEFT_MS - 1)).toBeNull();
    expect(at(-5_000)).toBeNull();
  });
});
