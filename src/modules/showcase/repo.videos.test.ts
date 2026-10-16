import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseShowcaseRepo, loadSnapshot, VIDEO_COLUMNS, VIDEO_TRANSCRIPT_COLUMNS } from "./repo";

// Plan 5b: video items reach the snapshot deliberately. `ITEM_KINDS` now includes "video", so repo.ts would admit one by accident; these
// tests pin that a video item is listed only with a row of public_videos, and that only the listed columns are ever read.

type Result = { data: unknown; error: { message: string; code: string } | null };
type Call = { target: string; columns: string; eq?: [string, unknown] };

function fakeDb(rows: Record<string, unknown[]>, failing: string[] = []) {
  const calls: Call[] = [];
  const db = {
    from(target: string) {
      return {
        select(columns: string) {
          const call: Call = { target, columns };
          calls.push(call);
          const result = (): Result =>
            failing.includes(target) ? { data: null, error: { message: `relation "${target}" is unreadable`, code: "42P01" } } : { data: rows[target] ?? [], error: null };
          const query = {
            order: () => query,
            range: () => query,
            eq: (column: string, value: unknown) => {
              call.eq = [column, value];
              return query;
            },
            maybeSingle: async () => {
              const r = result();
              return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
            },
            then: (resolve: (v: unknown) => void) => resolve(result()),
          };
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

const videoItem = {
  id: "v1", kind: "video", slug: "a-video-abc123", title: "A video", company_id: null, theme_id: null, published_at: "2026-10-01T05:00:00Z", data_as_of: null,
  learning_objective: "What a reader learns.", holds_position: null, revision_id: "vr1", rev_no: 1, body_md: "His description.", structured: { schema: "video/1" },
  revised_at: "2026-10-01T05:00:00Z", file_no: null,
};
const videoRow = { item_id: "v1", youtube_id: "dQw4w9WgXcQ", duration_seconds: 212, yt_published_at: "2026-09-30T08:30:00+00:00" };
const revision = (id: string, itemId: string) => ({ id, item_id: itemId, rev_no: 1, body_md: "b", structured: {}, change_reason: null, created_at: "2026-10-01T05:00:00Z" });

describe("the public videos read", () => {
  it("names exactly the columns anon can read, never a channel, a description, a privacy state or a fetch problem", () => {
    expect(VIDEO_COLUMNS).toBe("item_id, youtube_id, duration_seconds, yt_published_at");
    expect(VIDEO_TRANSCRIPT_COLUMNS).toBe("item_id, segments");
    for (const forbidden of ["channel", "description", "privacy", "fetch", "yt_title", "own_channel", "*"]) {
      expect(VIDEO_COLUMNS).not.toContain(forbidden);
      expect(VIDEO_TRANSCRIPT_COLUMNS).not.toContain(forbidden);
    }
  });

  it("reads public_videos with that list and maps a row; a row without an item or a valid YouTube id is dropped", async () => {
    const { db, calls } = fakeDb({
      public_videos: [videoRow, { ...videoRow, item_id: null }, { ...videoRow, item_id: "v2", youtube_id: "not an id" }, { ...videoRow, item_id: "v3", duration_seconds: null, yt_published_at: "garbage" }],
    });
    const videos = await createSupabaseShowcaseRepo(db).listVideos();
    expect(calls).toEqual([{ target: "public_videos", columns: VIDEO_COLUMNS }]);
    expect(videos).toEqual([
      { itemId: "v1", youtubeId: "dQw4w9WgXcQ", durationSeconds: 212, publishedAt: "2026-09-30T08:30:00+00:00" },
      { itemId: "v3", youtubeId: "dQw4w9WgXcQ", durationSeconds: null, publishedAt: null },
    ]);
  });

  it("a failing video read degrades to none, logs only the code, and never throws (D60)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await createSupabaseShowcaseRepo(fakeDb({}, ["public_videos"]).db).listVideos()).toEqual([]);
      expect(JSON.stringify(log.mock.calls)).toContain("42P01");
      expect(JSON.stringify(log.mock.calls)).not.toContain("unreadable");
    } finally {
      log.mockRestore();
    }
  });

  it("reads one item's transcript through the anon view and returns exactly {s, t} segments; anything malformed is no transcript", async () => {
    const good = fakeDb({ public_video_transcripts: [{ item_id: "v1", segments: [{ s: 0, t: "Hello." }, { s: 30, t: "Second." }] }] });
    expect(await createSupabaseShowcaseRepo(good.db).videoTranscript("v1")).toEqual([{ s: 0, t: "Hello." }, { s: 30, t: "Second." }]);
    expect(good.calls).toEqual([{ target: "public_video_transcripts", columns: VIDEO_TRANSCRIPT_COLUMNS, eq: ["item_id", "v1"] }]);
    const bad: unknown[] = [[], "text", [{ s: 0, t: "" }], [{ s: -1, t: "x" }], [{ s: 1.5, t: "x" }], [{ s: 0, t: "x", extra: 1 }], [{ s: 0, t: "x".repeat(501) }], [{ s: 30, t: "a" }, { s: 10, t: "b" }]];
    for (const segments of bad) {
      const { db } = fakeDb({ public_video_transcripts: [{ item_id: "v1", segments }] });
      expect(await createSupabaseShowcaseRepo(db).videoTranscript("v1"), JSON.stringify(segments)).toBeNull();
    }
    expect(await createSupabaseShowcaseRepo(fakeDb({}).db).videoTranscript("v1")).toBeNull();
  });

  it("a failing transcript read throws (the page keeps its last good copy), unlike the optional list", async () => {
    await expect(createSupabaseShowcaseRepo(fakeDb({}, ["public_video_transcripts"]).db).videoTranscript("v1")).rejects.toThrow();
  });
});

describe("the snapshot and video items", () => {
  it("carries a video item that has a public_videos row, with its revisions", async () => {
    const { db } = fakeDb({ public_items: [videoItem], public_item_revisions: [revision("vr1", "v1")], public_videos: [videoRow] });
    const snap = await loadSnapshot(createSupabaseShowcaseRepo(db), "2026-10-12");
    expect(snap.items.map((i) => i.id)).toEqual(["v1"]);
    expect(snap.revisions.map((r) => r.id)).toEqual(["vr1"]);
    expect(snap.videos).toEqual([{ itemId: "v1", youtubeId: "dQw4w9WgXcQ", durationSeconds: 212, publishedAt: "2026-09-30T08:30:00+00:00" }]);
  });

  it("drops a video item, and every revision of it, when public_videos has no row for it or cannot be read: nothing of it is listed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const rows = {
        public_items: [videoItem, { ...videoItem, id: "n1", kind: "learning", slug: "a-note" }],
        public_item_revisions: [revision("vr1", "v1"), revision("nr1", "n1")],
        public_videos: [],
      };
      const none = await loadSnapshot(createSupabaseShowcaseRepo(fakeDb(rows).db), "2026-10-12");
      expect(none.items.map((i) => i.id)).toEqual(["n1"]);
      expect(none.revisions.map((r) => r.id)).toEqual(["nr1"]);
      const down = await loadSnapshot(createSupabaseShowcaseRepo(fakeDb({ ...rows, public_videos: [videoRow] }, ["public_videos"]).db), "2026-10-12");
      expect(down.items.map((i) => i.id)).toEqual(["n1"]);
      expect(down.videos).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });
});
