import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseComplianceRepo } from "./repo";

type Result = { data: unknown; error: null };
const ITEM = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const REV = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";

/** One answer per table. A themes query records its `in` ids and `is` filters. */
function stubDb(answers: Record<string, Result>) {
  const themeQueries: string[] = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const same = () => chain;
    for (const name of ["select", "eq", "order", "limit"]) chain[name] = same;
    chain.in = (col: string, values: string[]) => {
      if (table === "themes") themeQueries.push(`in:${col}:${values.join(",")}`);
      return chain;
    };
    chain.is = (col: string, value: unknown) => {
      if (table === "themes") themeQueries.push(`is:${col}:${String(value)}`);
      return chain;
    };
    chain.maybeSingle = async () => answers[table];
    chain.then = (resolve: (v: unknown) => unknown) => resolve(answers[table]);
    return chain;
  };
  return { db: { from } as unknown as Db, themeQueries };
}

const ITEM_ROW = {
  id: ITEM, kind: "learning", title: "T", slug: null, learning_objective: null, company_id: null, holds_position: null,
  data_as_of: null, visibility: "private", company: null, theme: null,
};
const answers = (conceptIds: string[] | null, themes: { id: string; slug: string; name: string }[]): Record<string, Result> => ({
  items: { data: ITEM_ROW, error: null },
  item_revisions: { data: { id: REV, body_md: "b", structured: {}, change_reason: null, concept_ids: conceptIds }, error: null },
  lint_allowances: { data: [], error: null },
  themes: { data: themes, error: null },
});

describe("loadPublishContext: the live concepts of the revision being gated", () => {
  it("returns names and slugs in the revision's own order, and asks only for live rows", async () => {
    const { db, themeQueries } = stubDb(answers(["b", "a"], [
      { id: "a", slug: "alpha", name: "Alpha" },
      { id: "b", slug: "beta", name: "Beta" },
    ]));
    const ctx = await createSupabaseComplianceRepo(db).loadPublishContext(ITEM, REV);
    expect(ctx?.conceptNames).toEqual(["Beta", "Alpha"]);
    expect(ctx?.conceptSlugs).toEqual(["beta", "alpha"]);
    expect(themeQueries).toEqual(expect.arrayContaining(["in:id:b,a", "is:archived_at:null"]));
  });

  it("an archived concept is not returned by the query, so it is never linted or shown", async () => {
    const { db } = stubDb(answers(["a", "gone"], [{ id: "a", slug: "alpha", name: "Alpha" }]));
    const ctx = await createSupabaseComplianceRepo(db).loadPublishContext(ITEM, REV);
    expect(ctx?.conceptNames).toEqual(["Alpha"]);
  });

  it("a revision with no links (null or empty) asks for no concepts", async () => {
    for (const ids of [null, []]) {
      const { db, themeQueries } = stubDb(answers(ids, [{ id: "x", slug: "x", name: "X" }]));
      const ctx = await createSupabaseComplianceRepo(db).loadPublishContext(ITEM, REV);
      expect(ctx).toMatchObject({ conceptNames: [], conceptSlugs: [] });
      expect(themeQueries).toEqual([]);
    }
  });
});
