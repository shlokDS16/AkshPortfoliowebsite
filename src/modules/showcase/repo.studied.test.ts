import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseShowcaseRepo, loadSnapshot, STUDIED_COLUMNS } from "./repo";

// Phase 5d (spec s7): the outside sources a company file shows come from public_studied, the one view anon may read, by an explicit
// column list. The read is optional (D60): a view that is not there yet, or a timeout, means no block, never a failed public page.

type Call = { target: string; columns: string };
function fakeDb(rows: Record<string, unknown[]>, failing: string[] = []) {
  const calls: Call[] = [];
  const db = {
    from(target: string) {
      return {
        select(columns: string) {
          calls.push({ target, columns });
          const result = failing.includes(target) ? { data: null, error: { message: "relation does not exist", code: "42P01" } } : { data: rows[target] ?? [], error: null };
          const query = { order: () => query, range: () => query, then: (resolve: (v: unknown) => void) => resolve(result) };
          return query;
        },
      };
    },
    async rpc() {
      return { data: [], error: null };
    },
  } as unknown as Db;
  return { db, calls };
}

const HASH = "a".repeat(64);
const row = {
  item_id: "i1", position: 1, kind: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk", saved_on: "2026-10-03", note: "Worth watching for the margin bridge.",
  title: "A talk on margins", site_name: "Margin Channel", channel_url: "https://www.youtube.com/@margin", thumb_path: `yt/${HASH}.jpg`, thumb_sha256: HASH,
};

describe("the public studied read", () => {
  it("names exactly the columns anon can read: never an id of the link, a private note, the video id, a problem or a date of reading", () => {
    expect(STUDIED_COLUMNS).toBe("item_id, position, kind, url, saved_on, note, title, site_name, channel_url, thumb_path, thumb_sha256");
    for (const forbidden of ["youtube_id", "fetch", "meta_sha", "link_id", "checked_at", "*"]) expect(STUDIED_COLUMNS).not.toContain(forbidden);
  });

  it("reads public_studied with that list and maps a row to camel case", async () => {
    const { db, calls } = fakeDb({ public_studied: [row] });
    const studied = await createSupabaseShowcaseRepo(db).listStudied();
    expect(calls).toEqual([{ target: "public_studied", columns: STUDIED_COLUMNS }]);
    expect(studied).toEqual([
      {
        itemId: "i1", position: 1, kind: "youtube", url: row.url, savedOn: "2026-10-03", note: row.note, title: "A talk on margins", siteName: "Margin Channel",
        channelUrl: "https://www.youtube.com/@margin", thumbPath: `yt/${HASH}.jpg`, thumbSha256: HASH,
      },
    ]);
  });

  it("keeps a row whose machine data the view masked (null title, name, channel, picture)", async () => {
    const masked = { ...row, title: null, site_name: null, channel_url: null, thumb_path: null, thumb_sha256: null, note: null };
    const [one] = await createSupabaseShowcaseRepo(fakeDb({ public_studied: [masked] }).db).listStudied();
    expect(one).toMatchObject({ title: null, siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null, note: "" });
  });

  it("drops a row with no file, a bad place, an unknown kind, an address that is not https or a date that is not one", async () => {
    const bad = [{ ...row, item_id: null }, { ...row, position: 0 }, { ...row, kind: "pdf" }, { ...row, url: "http://example.com/a" }, { ...row, url: "javascript:alert(1)" }, { ...row, saved_on: "yesterday" }];
    expect(await createSupabaseShowcaseRepo(fakeDb({ public_studied: bad }).db).listStudied()).toEqual([]);
  });

  it("is optional: a failed read gives no rows, logs only the code, and the snapshot still loads", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { db } = fakeDb({}, ["public_studied"]);
    expect(await createSupabaseShowcaseRepo(db).listStudied()).toEqual([]);
    expect(log).toHaveBeenCalledWith("showcase: studied sources unavailable", "42P01");
    const snapshot = await loadSnapshot(createSupabaseShowcaseRepo(db), "2026-10-17");
    expect(snapshot.studied).toEqual([]);
    log.mockRestore();
  });

  it("puts the rows in the snapshot", async () => {
    const snapshot = await loadSnapshot(createSupabaseShowcaseRepo(fakeDb({ public_studied: [row] }).db), "2026-10-17");
    expect(snapshot.studied).toHaveLength(1);
  });
});
