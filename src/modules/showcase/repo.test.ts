import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { COMPANY_COLUMNS, createSupabaseShowcaseRepo, ITEM_COLUMNS, REVISION_COLUMNS } from "./repo";

function fakeDb(rows: Record<string, unknown[]>) {
  const calls: { target: string; columns: string }[] = [];
  const db = {
    from(target: string) {
      return {
        select(columns: string) {
          calls.push({ target, columns });
          const query = { order: () => query, then: (resolve: (v: unknown) => void) => resolve({ data: rows[target] ?? [], error: null }) };
          return query;
        },
      };
    },
    async rpc(fn: string, args: unknown) {
      calls.push({ target: fn, columns: JSON.stringify(args) });
      return { data: rows[fn] ?? [], error: null };
    },
  } as unknown as Db;
  return { db, calls };
}

const itemRow = {
  id: "i1", kind: "thesis", slug: "kav", title: "T", company_id: "c1", theme_id: null, published_at: "2026-08-05T05:00:00Z", data_as_of: "2026-08-22",
  learning_objective: "L", holds_position: "no", revision_id: "r1", rev_no: 3, body_md: "b", structured: {}, revised_at: "2026-08-20T05:00:00Z", file_no: 1,
};

describe("showcase repo", () => {
  it("reads only the four public views and one RPC, always with explicit column lists (rule 9)", async () => {
    const { db, calls } = fakeDb({ capture_days: [{ day: "2026-10-05" }] });
    const repo = createSupabaseShowcaseRepo(db);
    await Promise.all([repo.listItems(), repo.listRevisions(), repo.listCompanies(), repo.captureDays(30)]);
    expect(calls).toEqual([
      { target: "public_items", columns: ITEM_COLUMNS },
      { target: "public_item_revisions", columns: REVISION_COLUMNS },
      { target: "public_companies", columns: COMPANY_COLUMNS },
      { target: "capture_days", columns: '{"p_days":30}' },
    ]);
    for (const c of calls) expect(c.columns).not.toContain("*");
  });

  it("maps rows to camelCase and drops rows a view returned without identity", async () => {
    const { db } = fakeDb({ public_items: [itemRow, { id: null, slug: null }] });
    const items = await createSupabaseShowcaseRepo(db).listItems();
    expect(items).toEqual([
      { id: "i1", kind: "thesis", slug: "kav", title: "T", companyId: "c1", themeId: null, publishedAt: "2026-08-05T05:00:00Z", dataAsOf: "2026-08-22",
        learningObjective: "L", holdsPosition: "no", revisionId: "r1", revNo: 3, bodyMd: "b", structured: {}, revisedAt: "2026-08-20T05:00:00Z", fileNo: 1 },
    ]);
  });

  it("rule 2: an unreadable date, kind or position never reaches a view", async () => {
    const { db } = fakeDb({
      public_items: [
        { ...itemRow, id: "bad-ts", revised_at: "not a time" },
        { ...itemRow, id: "bad-kind", kind: "memo" },
        { ...itemRow, id: "bad-date", data_as_of: "2026-02-30", holds_position: "maybe" },
      ],
      public_item_revisions: [
        { id: "r1", item_id: "i1", rev_no: 1, body_md: "b", structured: {}, change_reason: null, created_at: "garbage" },
        { id: "r2", item_id: "i1", rev_no: 2, body_md: "b", structured: {}, change_reason: null, created_at: "2026-08-05T05:00:00Z" },
      ],
      capture_days: [{ day: "2026-10-05" }, { day: "yesterday" }, { day: "2026-13-01" }],
    });
    const repo = createSupabaseShowcaseRepo(db);
    const items = await repo.listItems();
    expect(items.map((i) => i.id)).toEqual(["bad-date"]);
    expect(items[0]).toMatchObject({ dataAsOf: null, holdsPosition: null });
    expect((await repo.listRevisions()).map((r) => r.id)).toEqual(["r2"]);
    expect(await repo.captureDays(30)).toEqual(["2026-10-05"]);
  });
});
