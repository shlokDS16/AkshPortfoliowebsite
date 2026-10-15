import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseKnowledgeRepo } from "./repo";

type Result = { data: unknown; error: { message: string; code?: string } | null };

/** A query-builder stub: records every call with its table; answers each awaited read with the next of `answers`. */
function stubDb(answers: Result[] = []) {
  const calls: string[] = [];
  const inserted: unknown[] = [];
  let next = 0;
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "order", "or", "delete"]) {
    chain[name] = (...args: unknown[]) => {
      calls.push(`${name}:${args.map((a) => JSON.stringify(a)).join(",")}`);
      return chain;
    };
  }
  chain.insert = (payload: unknown) => {
    inserted.push(payload);
    calls.push("insert");
    return chain;
  };
  chain.range = (from: number, to: number) => {
    calls.push(`range:${from},${to}`);
    return chain;
  };
  chain.then = (resolve: (v: unknown) => unknown) => resolve(answers[next++] ?? { data: [], error: null });
  return { db: { from: (t: string) => (calls.push(`from:${t}`), chain) } as unknown as Db, calls, inserted };
}

const [LO, HI] = [randomUUID(), randomUUID()].sort() as [string, string];
const linkRow = (item: string, concept: string, position: number) => ({ item_id: item, revision_id: `r-${item}`, concept_id: concept, position });

describe("links come from the admin view concept_links only", () => {
  it("reads a concept's links in a stable order and maps the rows", async () => {
    const { db, calls } = stubDb([{ data: [linkRow("i1", LO, 2)], error: null }]);
    const links = await createSupabaseKnowledgeRepo(db).linksForConcept(LO);
    expect(links).toEqual([{ itemId: "i1", revisionId: "r-i1", conceptId: LO, position: 2 }]);
    expect(calls).toEqual(expect.arrayContaining(["from:concept_links", `eq:"concept_id","${LO}"`, 'order:"item_id",{"ascending":true}', "range:0,999"]));
  });

  it("drops a row the view leaves half empty, and asks nothing for a malformed id", async () => {
    const { db, calls } = stubDb([{ data: [{ item_id: null, revision_id: "r", concept_id: LO, position: 1 }, linkRow("i1", LO, 1)], error: null }]);
    const repo = createSupabaseKnowledgeRepo(db);
    expect(await repo.linksForConcept(LO)).toHaveLength(1);
    const before = calls.length;
    expect(await repo.linksForConcept("x) or (1=1")).toEqual([]);
    expect(calls).toHaveLength(before);
  });

  it("reads every page of allLinks until a short one", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => linkRow(`i${i}`, LO, 1));
    const { db, calls } = stubDb([
      { data: full, error: null },
      { data: [linkRow("last", HI, 1)], error: null },
    ]);
    const links = await createSupabaseKnowledgeRepo(db).allLinks();
    expect(links).toHaveLength(1001);
    expect(calls).toEqual(expect.arrayContaining(["range:0,999", "range:1000,1999"]));
  });

  it("reads the links of given items in chunks of 100", async () => {
    const ids = Array.from({ length: 150 }, () => randomUUID());
    const { db, calls } = stubDb();
    await createSupabaseKnowledgeRepo(db).linksForItems(ids);
    expect(calls.filter((c) => c.startsWith("in:"))).toHaveLength(2);
    expect(calls.filter((c) => c === "from:concept_links")).toHaveLength(2);
  });

  it("fails as a DbError", async () => {
    const { db } = stubDb([{ data: null, error: { message: "boom", code: "XX000" } }]);
    await expect(createSupabaseKnowledgeRepo(db).allLinks()).rejects.toBeInstanceOf(DbError);
  });
});

describe("edges (concept_edges)", () => {
  it("reads the edges with the concept at either end, through a filter built from a checked uuid", async () => {
    const { db, calls } = stubDb([{ data: [{ concept_a: LO, concept_b: HI }], error: null }]);
    const repo = createSupabaseKnowledgeRepo(db);
    expect(await repo.edgesFor(LO)).toEqual([{ conceptA: LO, conceptB: HI }]);
    expect(calls).toEqual(expect.arrayContaining(["from:concept_edges", `or:"concept_a.eq.${LO},concept_b.eq.${LO}"`]));
    const before = calls.length;
    expect(await repo.edgesFor("a,concept_b.not.is.null")).toEqual([]);
    expect(calls).toHaveLength(before);
  });

  it("inserts one row with a < b whichever way the pair comes", async () => {
    const { db, inserted } = stubDb();
    const repo = createSupabaseKnowledgeRepo(db);
    await repo.insertEdge(HI, LO);
    await repo.insertEdge(LO, HI);
    expect(inserted).toEqual([
      { concept_a: LO, concept_b: HI },
      { concept_a: LO, concept_b: HI },
    ]);
  });

  it("a double tap is quiet: a duplicate is not an error, anything else is", async () => {
    const dup = stubDb([{ data: null, error: { message: "duplicate key", code: "23505" } }]);
    await expect(createSupabaseKnowledgeRepo(dup.db).insertEdge(LO, HI)).resolves.toBeUndefined();
    const other = stubDb([{ data: null, error: { message: "denied", code: "42501" } }]);
    await expect(createSupabaseKnowledgeRepo(other.db).insertEdge(LO, HI)).rejects.toBeInstanceOf(DbError);
  });

  it("deletes by the normalised pair, and only with real ids", async () => {
    const { db, calls } = stubDb();
    const repo = createSupabaseKnowledgeRepo(db);
    await repo.deleteEdge(HI, LO);
    expect(calls).toEqual(expect.arrayContaining(["from:concept_edges", "delete:", `eq:"concept_a","${LO}"`, `eq:"concept_b","${HI}"`]));
    await expect(repo.deleteEdge("x", LO)).rejects.toThrow();
  });
});
