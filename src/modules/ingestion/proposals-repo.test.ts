import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { createProposalsRepo } from "./proposals-repo";

type Call = { table: string; ops: [string, ...unknown[]][] };

/** A recording PostgREST stand-in: every chain resolves to the next queued result. */
function fakeDb(results: { data?: unknown; count?: number | null; error: unknown }[]) {
  const calls: Call[] = [];
  const db = {
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const proxy: Record<string, unknown> = {};
      for (const op of ["select", "insert", "upsert", "eq", "neq", "limit", "order", "maybeSingle", "single"]) {
        proxy[op] = (...args: unknown[]) => (call.ops.push([op, ...args]), proxy);
      }
      proxy.then = (resolve: (v: unknown) => void) => resolve(results.shift() ?? { data: null, error: null });
      return proxy;
    },
  } as unknown as Db;
  return { db, calls };
}

describe("proposals repo: what a re-read needs", () => {
  it("counts the document's figures without the rejected ones, so a re-read makes room for its own rows (R3)", async () => {
    const { db, calls } = fakeDb([{ count: 7, error: null }]);
    expect(await createProposalsRepo(db).countForDocument("d1")).toBe(7);
    expect(calls[0]).toEqual({
      table: "proposals",
      ops: [["select", "id", { count: "exact", head: true }], ["eq", "document_id", "d1"], ["neq", "status", "rejected"]],
    });
  });

  it("inserts readings into reading_proposals on (document, page, test, pass), leaving a repeat as it is (carry c)", async () => {
    const { db, calls } = fakeDb([{ error: null }]);
    const machineValue = { current: 1, readingAsOf: "2026-03-31", prior: null, unit: "days", label: "Receivable days", period: "FY26", valueText: "1", quote: "q", page: 4 };
    await createProposalsRepo(db).insertReadings([{ documentId: "d1", pageNo: 4, extractionId: "e1", itemIdHint: "i1", testId: "T1", machineValue, pass: 2 }]);
    expect(calls[0]!.table).toBe("reading_proposals");
    expect(calls[0]!.ops).toEqual([
      [
        "upsert",
        [{ document_id: "d1", page_no: 4, extraction_id: "e1", item_id_hint: "i1", test_id: "T1", machine_value: machineValue, pass: 2 }],
        { onConflict: "document_id,page_no,test_id,pass", ignoreDuplicates: true },
      ],
    ]);
  });

  it("writes nothing for no readings, and says only a code when the database refuses", async () => {
    const none = fakeDb([]);
    await createProposalsRepo(none.db).insertReadings([]);
    expect(none.calls).toEqual([]);
    const bad = fakeDb([{ error: { message: "secret detail", code: "XX000" } }]);
    const failure = await createProposalsRepo(bad.db)
      .insertReadings([{ documentId: "d", pageNo: 1, extractionId: "e", itemIdHint: null, testId: "T1", machineValue: {} as never, pass: 1 }])
      .catch((e: unknown) => e);
    expect((failure as Error).message).toBe("proposals.insertReadings (XX000)");
  });
});
