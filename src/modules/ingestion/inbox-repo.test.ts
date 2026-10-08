import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseInboxRepo } from "./inbox-repo";

type Call = { table: string; ops: [string, ...unknown[]][] };

/** A recording PostgREST stand-in: every chain resolves to the next queued result. */
function fakeDb(results: { data: unknown; error: unknown }[]) {
  const calls: Call[] = [];
  const db = {
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const proxy: Record<string, unknown> = {};
      for (const op of ["select", "update", "eq", "in", "order", "limit", "maybeSingle"]) {
        proxy[op] = (...args: unknown[]) => (call.ops.push([op, ...args]), proxy);
      }
      proxy.then = (resolve: (v: unknown) => void) => resolve(results.shift() ?? { data: null, error: null });
      return proxy;
    },
  } as unknown as Db;
  return { db, calls };
}

describe("inbox repo and the pass column (migration 0008, R2)", () => {
  it("lists the page steps once each, whatever their pass, and skips a step with no page", async () => {
    const { db, calls } = fakeDb([
      {
        data: [
          { page_no: 4, kind: "extract_page" }, { page_no: 4, kind: "extract_page" }, { page_no: 4, kind: "ocr_page" },
          { page_no: 9, kind: "extract_page" }, { page_no: null, kind: "extract_page" },
        ],
        error: null,
      },
    ]);
    expect(await createSupabaseInboxRepo(db).pageSteps("j1")).toEqual([
      { pageNo: 4, kind: "extract_page" }, { pageNo: 4, kind: "ocr_page" }, { pageNo: 9, kind: "extract_page" },
    ]);
    expect(calls[0].ops).toEqual([["select", "page_no, kind"], ["eq", "job_id", "j1"], ["in", "kind", ["extract_page", "ocr_page", "vision_page", "digest_page"]]]);
  });

  it("skips the queued page steps of a page, whichever pass and kind, and nothing that has started", async () => {
    const { db, calls } = fakeDb([{ data: null, error: null }]);
    await createSupabaseInboxRepo(db).skipQueuedStep("j1", 4);
    expect(calls[0].ops).toEqual([
      ["update", { status: "skipped" }],
      ["eq", "job_id", "j1"],
      ["eq", "page_no", 4],
      ["in", "kind", ["extract_page", "ocr_page", "vision_page", "digest_page"]],
      ["eq", "status", "queued"],
    ]);
  });

  it("revives only the latest step of the kind, and does nothing when the page has none", async () => {
    const found = fakeDb([{ data: { id: "s2" }, error: null }, { data: null, error: null }]);
    await createSupabaseInboxRepo(found.db).reviveStep("j1", 4, "ocr_page");
    expect(found.calls[0].ops).toEqual([
      ["select", "id"],
      ["eq", "job_id", "j1"],
      ["eq", "kind", "ocr_page"],
      ["eq", "page_no", 4],
      ["order", "pass", { ascending: false }],
      ["limit", 1],
      ["maybeSingle"],
    ]);
    expect(found.calls[1].ops.slice(1)).toEqual([["eq", "id", "s2"], ["eq", "status", "skipped"]]);

    const none = fakeDb([{ data: null, error: null }]);
    await createSupabaseInboxRepo(none.db).reviveStep("j1", 4, "extract_page");
    expect(none.calls).toHaveLength(1);
  });

  it("reads whether a page is a scan with the tick", async () => {
    const { db } = fakeDb([{ data: { selected: true, is_scan: true, kind: null }, error: null }]);
    expect(await createSupabaseInboxRepo(db).page("d1", 3)).toEqual({ selected: true, isScan: true, kind: null });
  });
});
