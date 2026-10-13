import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { readUnsortedPages } from "./unsorted-read";

const A = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const B = "1c0a4d2f-8b53-4d66-8f2e-3a7b9c4d5e6f";

function stub(rows: unknown, error: unknown = null) {
  const ops: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "in", "is", "eq"]) builder[op] = (...a: unknown[]) => (ops.push([op, ...a]), builder);
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve);
  return { db: { from: vi.fn(() => builder) } as unknown as Db, ops };
}

describe("readUnsortedPages", () => {
  it("adds up the pages let go by a document's finished classify steps, and leaves out documents with none", async () => {
    const { db, ops } = stub([
      { document_id: A, job_steps: [{ result: { kept: 0, letGo: "schema", unsortedPages: 3 } }, { result: { kept: 2 } }, { result: { letGo: "provider", unsortedPages: 10 } }] },
      { document_id: B, job_steps: [{ result: { kept: 1, tokens: 40 } }] },
    ]);
    const out = await readUnsortedPages(db, [A, B]);
    expect(out.get(A)).toBe(13);
    expect(out.has(B)).toBe(false);
    expect(ops).toContainEqual(["eq", "job_steps.kind", "classify_pages"]);
    expect(ops).toContainEqual(["eq", "job_steps.status", "done"]);
    expect(ops).toContainEqual(["in", "document_id", [A, B]]);
  });

  it("ignores a result that is not a number of pages", async () => {
    const { db } = stub([{ document_id: A, job_steps: [{ result: null }, { result: [1] }, { result: { unsortedPages: "4" } }, { result: { unsortedPages: -2 } }] }]);
    expect((await readUnsortedPages(db, [A])).size).toBe(0);
  });

  it("asks nothing when there are no documents, and throws a tagged error when the read fails", async () => {
    const none = stub([]);
    expect((await readUnsortedPages(none.db, [])).size).toBe(0);
    expect(none.db.from).not.toHaveBeenCalled();
    await expect(readUnsortedPages(stub(null, { message: "boom", code: "X" }).db, [A])).rejects.toThrow();
  });
});
