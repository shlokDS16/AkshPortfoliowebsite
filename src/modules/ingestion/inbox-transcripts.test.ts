import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { readTranscripts } from "./inbox-transcripts";

function dbWith(rows: { document_id: string; text: string }[], error: { message: string } | null = null) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {
    select: (...a: unknown[]) => (calls.push(["select", ...a]), builder),
    in: (...a: unknown[]) => (calls.push(["in", ...a]), builder),
    eq: (...a: unknown[]) => (calls.push(["eq", ...a]), Promise.resolve({ data: error ? null : rows, error })),
  };
  return { db: { from: vi.fn(() => builder) } as unknown as Db, calls };
}

describe("readTranscripts", () => {
  it("reads page 1 of the given voice notes, by explicit columns, and keeps those with words", async () => {
    const { db, calls } = dbWith([
      { document_id: "a", text: "Dealers say orders are up." },
      { document_id: "b", text: "   " },
    ]);
    const out = await readTranscripts(db, ["a", "b"]);
    expect([...out]).toEqual([["a", "Dealers say orders are up."]]);
    expect(calls).toEqual([["select", "document_id, text"], ["in", "document_id", ["a", "b"]], ["eq", "page_no", 1]]);
  });

  it("asks nothing for no documents", async () => {
    const { db } = dbWith([]);
    expect((await readTranscripts(db, [])).size).toBe(0);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("throws a database error named for the read (the inbox page logs the name only)", async () => {
    const { db } = dbWith([], { message: "down" });
    await expect(readTranscripts(db, ["a"])).rejects.toMatchObject({ name: "DbError", op: "inbox.transcripts" });
  });
});
