import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { readDigest, readDigestCounts } from "./digest-read";
import { DIGEST_CLAIM_WORDS, DIGEST_MAX_CLAIMS } from "./caps";
import { DIGEST_SYSTEM_PROMPT } from "./prompts";
import { digestCount, digestToggle, latestDigest } from "./digest-view";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";

/** A PostgREST stand-in that answers each table with its rows and records the chain asked for. */
function stub(answers: Record<string, unknown>) {
  const calls: { table: string; ops: unknown[][] }[] = [];
  const from = (table: string) => {
    const ops: unknown[][] = [];
    calls.push({ table, ops });
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "order"]) builder[op] = (...a: unknown[]) => (ops.push([op, ...a]), builder);
    const result = () => ({ data: answers[table], error: null });
    builder.maybeSingle = () => Promise.resolve(result());
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return builder;
  };
  return { db: { from: vi.fn(from) } as unknown as Db, calls };
}
const row = (extraction_id: string, ord: number, on_page: boolean) => ({ extraction_id, ord, section: "Outlook", claim: `claim ${ord}`, line: `line ${ord}`, on_page, created_at: "x" });

describe("readDigest", () => {
  it("returns the newest extraction's claims only, without ids", async () => {
    const { db, calls } = stub({ documents: { kind: "pdf" }, document_digests: [row("new", 0, true), row("new", 1, false), row("old", 0, true)] });
    expect(await readDigest(db, DOC, 4)).toEqual([
      { section: "Outlook", claim: "claim 0", line: "line 0", onPage: true },
      { section: "Outlook", claim: "claim 1", line: "line 1", onPage: false },
    ]);
    const ops = calls.find((c) => c.table === "document_digests")!.ops;
    expect(ops).toContainEqual(["eq", "document_id", DOC]);
    expect(ops).toContainEqual(["eq", "page_no", 4]);
  });

  it("returns nothing for a voice note without reading its digests, and for a document that is gone", async () => {
    const voice = stub({ documents: { kind: "audio" }, document_digests: [row("e", 0, true)] });
    expect(await readDigest(voice.db, DOC, 1)).toEqual([]);
    expect(voice.calls.some((c) => c.table === "document_digests")).toBe(false);
    expect(await readDigest(stub({ documents: null }).db, DOC, 1)).toEqual([]);
  });
});

describe("readDigestCounts", () => {
  it("counts the stored claims of each document and asks nothing for none", async () => {
    const { db } = stub({ document_digests: [{ document_id: "a" }, { document_id: "a" }, { document_id: "b" }] });
    expect([...(await readDigestCounts(db, ["a", "b", "c"]))]).toEqual([["a", 2], ["b", 1]]);
    const none = stub({});
    expect((await readDigestCounts(none.db, [])).size).toBe(0);
    expect(none.db.from).not.toHaveBeenCalled();
  });
});

describe("the digest prompt", () => {
  it("states the claim and word limits the code enforces", () => {
    expect(DIGEST_SYSTEM_PROMPT).toContain(`no more than ${DIGEST_MAX_CLAIMS} claims`);
    expect(DIGEST_SYSTEM_PROMPT).toContain(`at most ${DIGEST_CLAIM_WORDS} words`);
  });
});

describe("digest copy", () => {
  it("counts claims and words the toggle for one and many", () => {
    expect(digestCount(1)).toBe("1 claim on this page");
    expect(digestCount(3)).toBe("3 claims on this page");
    expect(digestToggle(2, false)).toBe("Show 2 claims the page check could not confirm");
    expect(digestToggle(1, true)).toBe("Hide 1 claim the page check could not confirm");
    expect(latestDigest([])).toEqual([]);
  });
});
