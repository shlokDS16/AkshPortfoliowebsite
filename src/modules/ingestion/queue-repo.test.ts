import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { LEASE_SECONDS } from "./caps";
import { createQueueRepo } from "./queue-repo";
import type { Step } from "./types";

type Call = { table?: string; rpc?: string; args?: unknown; ops: [string, ...unknown[]][] };

/** A recording PostgREST stand-in: every chain resolves to the next queued result. */
function fakeDb(results: { data: unknown; error: unknown }[]) {
  const calls: Call[] = [];
  const chain = (call: Call) => {
    const proxy: Record<string, unknown> = {};
    for (const op of ["select", "insert", "update", "upsert", "eq", "is", "single", "maybeSingle"]) {
      proxy[op] = (...args: unknown[]) => (call.ops.push([op, ...args]), proxy);
    }
    proxy.then = (resolve: (v: unknown) => void) => resolve(results.shift() ?? { data: null, error: null });
    return proxy;
  };
  const db = {
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      calls.push(call);
      return chain(call);
    },
    rpc: (rpc: string, args: unknown) => {
      const call: Call = { rpc, args, ops: [] };
      calls.push(call);
      return chain(call);
    },
  } as unknown as Db;
  return { db, calls };
}

const ROW = {
  id: "s1", job_id: "j1", kind: "extract_page", page_no: 4, pass: 2, args: { a: 1 }, status: "running", schema_failures: 1,
  provider_failures: 0, lease_expiries: 1, not_before: "2026-10-07T10:00:00Z", lease_owner: "o1", last_error: "bad row",
};
const STEP: Step = {
  id: "s1", jobId: "j1", kind: "extract_page", pageNo: 4, pass: 1, args: {}, status: "running", schemaFailures: 0,
  providerFailures: 0, leaseExpiries: 0, notBefore: "2026-10-07T10:00:00Z", leaseOwner: "o1", lastError: null,
};

describe("createQueueRepo", () => {
  it("claims through claim_job_step with the lease and reads the document from the job", async () => {
    const { db, calls } = fakeDb([{ data: [ROW], error: null }, { data: { document_id: "d1" }, error: null }]);
    const claimed = await createQueueRepo(db).claim("o1");
    expect(calls[0]).toMatchObject({ rpc: "claim_job_step", args: { p_owner: "o1", p_lease_seconds: LEASE_SECONDS } });
    expect(calls[1]).toMatchObject({ table: "jobs", ops: [["select", "document_id"], ["eq", "id", "j1"], ["single"]] });
    expect(claimed).toEqual({
      id: "s1", jobId: "j1", kind: "extract_page", pageNo: 4, pass: 2, args: { a: 1 }, status: "running", schemaFailures: 1,
      providerFailures: 0, leaseExpiries: 1, notBefore: "2026-10-07T10:00:00Z", leaseOwner: "o1", lastError: "bad row",
      documentId: "d1",
    });
  });

  it("returns null when nothing is runnable", async () => {
    const { db } = fakeDb([{ data: [], error: null }]);
    expect(await createQueueRepo(db).claim("o1")).toBeNull();
  });

  it("finishes only the step it still holds, and reports a lost lease as false", async () => {
    const until = new Date("2026-10-07T10:01:00Z");
    const { db, calls } = fakeDb([{ data: [{ id: "s1" }], error: null }, { data: [], error: null }]);
    const repo = createQueueRepo(db);
    expect(await repo.finish(STEP, "o1", { status: "queued", notBefore: until, waitReason: "groq_minute" })).toBe(true);
    expect(calls[0].table).toBe("job_steps");
    expect(calls[0].ops).toEqual([
      ["update", { status: "queued", not_before: until.toISOString(), wait_reason: "groq_minute", locked_until: null, lease_owner: null }],
      ["eq", "id", "s1"],
      ["eq", "lease_owner", "o1"],
      ["eq", "status", "running"],
      ["select", "id"],
    ]);
    expect(await repo.finish(STEP, "o1", { status: "done", result: null, lastError: null })).toBe(false);
  });

  it("enqueues idempotently on the job_steps_once key, with pass defaulting to 1", async () => {
    const { db, calls } = fakeDb([{ data: null, error: null }]);
    await createQueueRepo(db).enqueue("j1", [
      { kind: "select_pages", pageNo: null },
      { kind: "pdf_text", pageNo: 26, args: { from: 26 } },
      { kind: "extract_page", pageNo: 4, pass: 2, args: { reread: true } },
    ]);
    expect(calls[0].ops).toEqual([
      [
        "upsert",
        [
          { job_id: "j1", kind: "select_pages", page_no: null, pass: 1, args: {} },
          { job_id: "j1", kind: "pdf_text", page_no: 26, pass: 1, args: { from: 26 } },
          { job_id: "j1", kind: "extract_page", page_no: 4, pass: 2, args: { reread: true } },
        ],
        { onConflict: "job_id,kind,page_no,pass", ignoreDuplicates: true },
      ],
    ]);
  });

  it("creates the job and its first step, reusing the live job when one already exists", async () => {
    const created = fakeDb([{ data: { id: "j1" }, error: null }, { data: null, error: null }]);
    expect(await createQueueRepo(created.db).createJob("d1", "ingest_pdf", { kind: "pdf_text", pageNo: 1 })).toBe("j1");
    expect(created.calls[0].ops[0]).toEqual(["insert", { kind: "ingest_pdf", document_id: "d1" }]);
    expect(created.calls[1].ops[0][0]).toBe("upsert");

    const raced = fakeDb([
      { data: null, error: { message: "duplicate key", code: "23505" } },
      { data: { id: "j0" }, error: null },
      { data: null, error: null },
    ]);
    expect(await createQueueRepo(raced.db).createJob("d1", "ingest_pdf", { kind: "pdf_text", pageNo: 1 })).toBe("j0");
    expect(raced.calls[1].ops).toEqual([["select", "id"], ["eq", "document_id", "d1"], ["is", "cancelled_at", null], ["single"]]);
  });

  it("throws a DbError on a database failure, never a raw message", async () => {
    const { db } = fakeDb([{ data: null, error: { message: "boom", code: "08006" } }]);
    const failure = await createQueueRepo(db).claim("o1").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("ingestion.claim (08006)");
    expect((failure as Error).message).not.toContain("boom");
  });
});
