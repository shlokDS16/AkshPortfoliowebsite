import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { COMPANY_COLUMNS, CONCEPT_COLUMNS, CONCEPT_LINK_COLUMNS, createSupabaseShowcaseRepo, ITEM_COLUMNS, loadSnapshot, REVISION_COLUMNS } from "./repo";

function fakeDb(rows: Record<string, unknown[]>, failingRpc: string[] = [], failingViews: string[] = []) {
  const calls: { target: string; columns: string }[] = [];
  const db = {
    from(target: string) {
      return {
        select(columns: string) {
          calls.push({ target, columns });
          const failing = failingViews.includes(target);
          const result = failing ? { data: null, error: { message: `relation "public.${target}" does not exist`, code: "42P01" } } : { data: rows[target] ?? [], error: null };
          const query = { order: () => query, range: () => query, then: (resolve: (v: unknown) => void) => resolve(result) };
          return query;
        },
      };
    },
    async rpc(fn: string, args: unknown) {
      calls.push({ target: fn, columns: JSON.stringify(args) });
      if (failingRpc.includes(fn)) return { data: null, error: { message: "Could not find the function public.public_fact_checks", code: "PGRST202" } };
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
  it("reads only the five public views and two RPCs, always with explicit column lists (rule 9)", async () => {
    const { db, calls } = fakeDb({ capture_days: [{ day: "2026-10-05" }] });
    const repo = createSupabaseShowcaseRepo(db);
    await Promise.all([repo.listItems(), repo.listRevisions(), repo.listCompanies(), repo.captureDays(30), repo.factChecks(), repo.listConcepts(), repo.listConceptLinks()]);
    expect(calls).toEqual([
      { target: "public_items", columns: ITEM_COLUMNS },
      { target: "public_item_revisions", columns: REVISION_COLUMNS },
      { target: "public_companies", columns: COMPANY_COLUMNS },
      { target: "capture_days", columns: '{"p_days":30}' },
      { target: "public_fact_checks", columns: "{}" },
      { target: "public_themes", columns: CONCEPT_COLUMNS },
      { target: "public_concept_links", columns: CONCEPT_LINK_COLUMNS },
    ]);
    // The concept views are read through their public names only: the admin view, the edges and the description never.
    expect(CONCEPT_COLUMNS).toBe("id, slug, name");
    expect(CONCEPT_LINK_COLUMNS).toBe("item_id, revision_id, concept_id, position");
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

  it("maps public_fact_checks rows to item, fact and page and drops anything malformed", async () => {
    const { db } = fakeDb({
      public_fact_checks: [
        { item_id: "i1", fact_id: "F1", page_no: 131 },
        { item_id: null, fact_id: "F2", page_no: 4 },
        { item_id: "i1", fact_id: "F3", page_no: 0 },
        { item_id: "i1", fact_id: "F4", page_no: 2.5 },
        { item_id: "i1", fact_id: "F5", page_no: null },
      ],
    });
    expect(await createSupabaseShowcaseRepo(db).factChecks()).toEqual([{ itemId: "i1", factId: "F1", pageNo: 131 }]);
  });

  it("a failing public_fact_checks call degrades to no checks, logs only the code, and never throws", async () => {
    const { db } = fakeDb({}, ["public_fact_checks"]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await createSupabaseShowcaseRepo(db).factChecks()).toEqual([]);
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).toContain("PGRST202");
      expect(JSON.stringify(log.mock.calls)).not.toContain("Could not find");
    } finally {
      log.mockRestore();
    }
  });

  it("the public snapshot still builds when the check read fails, with the three views and capture days intact", async () => {
    const { db } = fakeDb({ public_items: [itemRow], capture_days: [{ day: "2026-10-05" }] }, ["public_fact_checks"]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const snap = await loadSnapshot(createSupabaseShowcaseRepo(db), "2026-10-12");
      expect(snap.factChecks).toEqual([]);
      expect(snap.items.map((i) => i.id)).toEqual(["i1"]);
      expect(snap.captureDays).toEqual(["2026-10-05"]);
    } finally {
      log.mockRestore();
    }
  });

  it("the other reads stay strict: a failing capture_days call still rejects the snapshot", async () => {
    const { db } = fakeDb({}, ["capture_days"]);
    await expect(loadSnapshot(createSupabaseShowcaseRepo(db), "2026-10-12")).rejects.toThrow();
  });

  it("maps public_themes and public_concept_links, drops malformed rows, and keeps a position with a gap as it is", async () => {
    const { db } = fakeDb({
      public_themes: [{ id: "k1", slug: "moats", name: "Moats" }, { id: "k2", slug: null, name: "No slug" }, { id: null, slug: "x", name: "No id" }],
      public_concept_links: [
        { item_id: "i1", revision_id: "r1", concept_id: "k1", position: 5 },
        { item_id: "i1", revision_id: "r1", concept_id: "k1", position: 0 },
        { item_id: "i1", revision_id: "r1", concept_id: "k1", position: 1.5 },
        { item_id: null, revision_id: "r1", concept_id: "k1", position: 1 },
        { item_id: "i1", revision_id: "r1", concept_id: null, position: 1 },
      ],
    });
    const repo = createSupabaseShowcaseRepo(db);
    expect(await repo.listConcepts()).toEqual([{ id: "k1", slug: "moats", name: "Moats" }]);
    expect(await repo.listConceptLinks()).toEqual([{ itemId: "i1", revisionId: "r1", conceptId: "k1", position: 5 }]);
  });

  it("a failing concept read degrades to none, logs only the code, and never throws (D60)", async () => {
    const { db } = fakeDb({}, [], ["public_themes", "public_concept_links"]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const repo = createSupabaseShowcaseRepo(db);
      expect(await repo.listConcepts()).toEqual([]);
      expect(await repo.listConceptLinks()).toEqual([]);
      expect(log).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(log.mock.calls)).toContain("42P01");
      expect(JSON.stringify(log.mock.calls)).not.toContain("does not exist");
    } finally {
      log.mockRestore();
    }
  });

  it("the snapshot builds without concepts when their views are missing, and carries them when they are there", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const missing = await loadSnapshot(createSupabaseShowcaseRepo(fakeDb({ public_items: [itemRow], capture_days: [{ day: "2026-10-05" }] }, [], ["public_themes", "public_concept_links"]).db), "2026-10-12");
      expect(missing.concepts).toEqual([]);
      expect(missing.conceptLinks).toEqual([]);
      expect(missing.items.map((i) => i.id)).toEqual(["i1"]);
      const there = await loadSnapshot(
        createSupabaseShowcaseRepo(fakeDb({ public_items: [itemRow], capture_days: [], public_themes: [{ id: "k1", slug: "moats", name: "Moats" }] }).db),
        "2026-10-12",
      );
      expect(there.concepts).toEqual([{ id: "k1", slug: "moats", name: "Moats" }]);
    } finally {
      log.mockRestore();
    }
  });
});
