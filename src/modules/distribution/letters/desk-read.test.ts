import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { buildRichSnapshot } from "@/test/fakes/showcase-snapshot";
import { createFakeRpc, fakeReads } from "@/test/fakes/letters-kit";
import { listLetterRows, mondayLetterLine, publicRevisionIds, readCandidates } from "./desk-read";

describe("the candidates the desk shows (spec s8.3), read fresh", () => {
  it("offers the public changes since the last sent letter, and counts all of them", async () => {
    const reads = fakeReads(createFakeRpc());
    const snapshot = buildRichSnapshot();
    for (const item of snapshot.items) reads.passes.set(item.revisionId, "2026-10-01T05:00:00Z");
    reads.last = "2026-09-30T05:00:00Z";
    const out = await readCandidates({ reads, snapshot: async () => snapshot, today: "2026-10-06" });
    expect(out.total).toBeGreaterThan(0);
    expect(out.candidates.length).toBe(Math.min(out.total, 20));
    expect(out.today).toBe("2026-10-06");
  });

  it("offers nothing when the last letter went out after every pass", async () => {
    const reads = fakeReads(createFakeRpc());
    const snapshot = buildRichSnapshot();
    for (const item of snapshot.items) reads.passes.set(item.revisionId, "2026-10-01T05:00:00Z");
    reads.last = "2026-10-05T05:00:00Z";
    expect(await readCandidates({ reads, snapshot: async () => snapshot, today: "2026-10-06" })).toMatchObject({ candidates: [], total: 0 });
  });
});

describe("the letters list", () => {
  const item = (id: string, title: string) => ({ id, title, visibility: "private", created_at: "2026-10-16T05:00:00+00:00" });
  const dbOf = (data: unknown[], error: { message: string } | null = null) => {
    const calls: [string, ...unknown[]][] = [];
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "order", "limit"]) chain[op] = (...a: unknown[]) => (calls.push([op, ...a]), chain);
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve);
    return { db: { from: (t: string) => (calls.push(["from", t]), chain) } as unknown as Db, calls };
  };

  it("lists the letter items newest first with their sends, and marks a subject that is still the label", async () => {
    const rpc = createFakeRpc();
    const reads = fakeReads(rpc);
    const sent = await rpc.approve("00000000-0000-4000-8000-0000000000aa", "i2", "r2", "self_test");
    const { db, calls } = dbOf([item("i1", "Untitled letter, 16 Oct 2026"), item("i2", "What changed")]);
    const rows = await listLetterRows(db, reads);
    expect(calls).toContainEqual(["eq", "kind", "letter"]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(rows.map((r) => [r.itemId, r.subjectIsLabel, r.sends.length])).toEqual([["i1", true, 0], ["i2", false, 1]]);
    expect(rows[1]!.sends[0]!.id).toBe(sent.id);
  });

  it("an empty table reads no sends", async () => {
    const reads = fakeReads(createFakeRpc());
    expect(await listLetterRows(dbOf([]).db, reads)).toEqual([]);
  });

  it("a failed read throws without row text", async () => {
    const error = await listLetterRows(dbOf([], { message: 'row "secret"' }).db, fakeReads(createFakeRpc())).catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain("secret");
  });
});

describe("the revisions the public site shows now (for the checklist's 13.2 row)", () => {
  it("is the set of current public revision ids, and null when the public site cannot be read", async () => {
    const snapshot = buildRichSnapshot();
    const ids = await publicRevisionIds(async () => snapshot);
    expect(ids).toEqual(new Set(snapshot.items.map((i) => i.revisionId)));
    expect(await publicRevisionIds(async () => { throw new Error("down"); })).toBeNull();
  });
});

describe("the Monday line's data (spec s8.1 step 1)", () => {
  const db = {} as Db;
  const MONDAY = new Date("2026-10-19T05:00:00Z");
  const read = (total: number) => vi.fn(async () => ({ candidates: [], total, today: "2026-10-19" }));

  it("reads nothing on any day but Monday in India", async () => {
    const spy = read(5);
    expect(await mondayLetterLine(db, new Date("2026-10-20T05:00:00Z"), spy)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("on a Monday gives the line with the count of every change, not only the twenty offered", async () => {
    expect(await mondayLetterLine(db, MONDAY, read(27))).toBe("Letter: 27 changes since your last letter.");
  });

  it("on a Monday with nothing waiting gives nothing", async () => {
    expect(await mondayLetterLine(db, MONDAY, read(0))).toBeNull();
  });
});
