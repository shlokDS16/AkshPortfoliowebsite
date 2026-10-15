import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseResearchRepo } from "./repo";

const REVISION_ROW = {
  id: "r1",
  item_id: "i1",
  rev_no: 2,
  body_md: "b",
  structured: {},
  schema_version: 1,
  change_reason: null,
  author: "aksh",
  created_at: "2026-10-15T00:00:00Z",
  concept_ids: ["a", "b"] as string[] | null,
};

/** Records what is inserted into item_revisions and answers with REVISION_ROW. */
function stubDb(row: typeof REVISION_ROW) {
  const state: { inserted: Record<string, unknown> | null; selected: string | null } = { inserted: null, selected: null };
  const chain: Record<string, unknown> = {};
  chain.insert = (payload: Record<string, unknown>) => {
    state.inserted = payload;
    return chain;
  };
  chain.select = (columns: string) => {
    state.selected = columns;
    return chain;
  };
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.single = async () => ({ data: row, error: null });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [row], error: null });
  return { db: { from: () => chain } as unknown as Db, state };
}

const NEW_ROW = { itemId: "i1", bodyMd: "b", structured: {}, changeReason: null, author: "aksh" as const };

describe("research repo and concept_ids", () => {
  it("writes the array when given", async () => {
    const { db, state } = stubDb(REVISION_ROW);
    await createSupabaseResearchRepo(db).insertRevision({ ...NEW_ROW, conceptIds: ["a", "b"] });
    expect(state.inserted).toMatchObject({ concept_ids: ["a", "b"] });
  });

  it("writes an empty array as an empty array", async () => {
    const { db, state } = stubDb(REVISION_ROW);
    await createSupabaseResearchRepo(db).insertRevision({ ...NEW_ROW, conceptIds: [] });
    expect(state.inserted).toMatchObject({ concept_ids: [] });
  });

  it("omits the key when null, so the database carries the previous links", async () => {
    const { db, state } = stubDb(REVISION_ROW);
    await createSupabaseResearchRepo(db).insertRevision({ ...NEW_ROW, conceptIds: null });
    expect(state.inserted).not.toBeNull();
    expect(Object.keys(state.inserted ?? {})).not.toContain("concept_ids");
  });

  it("reads concept_ids into Revision.conceptIds, null stays null", async () => {
    const { db, state } = stubDb(REVISION_ROW);
    const repo = createSupabaseResearchRepo(db);
    expect((await repo.insertRevision({ ...NEW_ROW, conceptIds: null })).conceptIds).toEqual(["a", "b"]);
    expect(state.selected).toContain("concept_ids");
    const legacy = stubDb({ ...REVISION_ROW, concept_ids: null });
    expect((await createSupabaseResearchRepo(legacy.db).listRevisions("i1"))[0].conceptIds).toBeNull();
  });
});
