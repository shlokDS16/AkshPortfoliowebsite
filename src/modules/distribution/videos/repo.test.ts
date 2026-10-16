import { describe, expect, it } from "vitest";
import { createTableDb } from "@/test/fakes/table-db";
import { createSupabaseVideosRepo } from "./repo";

const ITEM = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const OTHER_ITEM = "11111111-2222-4333-8444-555555555555";
const SRC = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const TR = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TR_OTHER = "22222222-3333-4444-8555-666666666666";
const source = (over: Record<string, unknown> = {}) => ({
  id: SRC, item_id: ITEM, youtube_id: "dQw4w9WgXcQ", channel_id: "UC0123456789abcdefghijkl", own_channel: true, yt_title: "A title", yt_description: "d",
  duration_seconds: 90, privacy: "unlisted", yt_published_at: "2026-09-01T10:00:00+00:00", fetched_at: "2026-10-16T00:00:00+00:00", fetch_problem: null,
  created_at: "2026-10-15T00:00:00+00:00", ...over,
});
const transcript = (over: Record<string, unknown> = {}) => ({
  id: TR, video_source_id: SRC, source: "captions_file", file_sha256: "f".repeat(64), segments: [{ s: 0, t: "Hello." }, { s: 31, t: "World." }],
  text_sha256: "a".repeat(64), words: 2, created_at: "2026-10-16T01:00:00+00:00", ...over,
});

describe("the videos repo (the admin's session; row-level security does the gating)", () => {
  it("reads a source by item or by YouTube id, with the machine columns in their own fields", async () => {
    const { db } = createTableDb({ video_sources: [source(), source({ id: "x", item_id: OTHER_ITEM, youtube_id: "aaaaaaaaaaa" })] });
    const repo = createSupabaseVideosRepo(db);
    expect(await repo.findByItem(ITEM)).toEqual({
      id: SRC, itemId: ITEM, youtubeId: "dQw4w9WgXcQ", channelId: "UC0123456789abcdefghijkl", ownChannel: true, ytTitle: "A title", ytDescription: "d",
      durationSeconds: 90, privacy: "unlisted", ytPublishedAt: "2026-09-01T10:00:00+00:00", fetchedAt: "2026-10-16T00:00:00+00:00", fetchProblem: null,
      createdAt: "2026-10-15T00:00:00+00:00",
    });
    expect((await repo.findByYoutubeId("aaaaaaaaaaa"))?.itemId).toBe(OTHER_ITEM);
    expect(await repo.findByItem("nope")).toBeNull();
    expect(await repo.findByYoutubeId("zzzzzzzzzzz")).toBeNull();
  });

  it("reads an unknown privacy value as null, never as a made-up one", async () => {
    const { db } = createTableDb({ video_sources: [source({ privacy: "weird" })] });
    expect((await createSupabaseVideosRepo(db).findByItem(ITEM))?.privacy).toBeNull();
  });

  it("inserts exactly the item and the YouTube id, nothing from the machine's columns", async () => {
    const { db, tables } = createTableDb({ video_sources: [] });
    await createSupabaseVideosRepo(db).insertSource(ITEM, "dQw4w9WgXcQ").catch(() => undefined);
    expect(tables.video_sources).toEqual([{ item_id: ITEM, youtube_id: "dQw4w9WgXcQ" }]);
  });

  it("inserts a transcript with only its allowed columns and reads back the database's own hash", async () => {
    const { db, tables } = createTableDb({ video_transcripts: [] });
    await createSupabaseVideosRepo(db)
      .insertTranscript({ videoSourceId: SRC, fileSha256: "f".repeat(64), segments: [{ s: 0, t: "Hello." }], textSha256: "b".repeat(64), words: 1 })
      .catch(() => undefined);
    expect(Object.keys(tables.video_transcripts[0] ?? {}).sort()).toEqual(["file_sha256", "segments", "source", "text_sha256", "video_source_id", "words"]);
    expect(tables.video_transcripts[0]?.source).toBe("captions_file");
  });

  it("reads the newest transcript of a source, with segments restored to {s, t}", async () => {
    const { db } = createTableDb({
      video_transcripts: [transcript(), transcript({ id: "newer", created_at: "2026-10-16T02:00:00+00:00", segments: [{ s: 0, t: "Newer." }], text_sha256: "c".repeat(64) })],
    });
    const out = await createSupabaseVideosRepo(db).latestTranscript(SRC);
    expect(out?.id).toBe("newer");
    expect(out?.segments).toEqual([{ s: 0, t: "Newer." }]);
    expect(await createSupabaseVideosRepo(db).latestTranscript("none")).toBeNull();
  });

  it("drops anything in stored segments that is not exactly {s, t}", async () => {
    const { db } = createTableDb({ video_transcripts: [transcript({ segments: [{ s: 0, t: "ok" }, { s: 1, t: "extra key", extra: 1 }, { s: "x", t: "bad" }, "junk", { s: 5, t: 7 }] })] });
    expect((await createSupabaseVideosRepo(db).latestTranscript(SRC))?.segments).toEqual([{ s: 0, t: "ok" }]);
  });

  it("gives a transcript for an item only when that item's own source owns it", async () => {
    const { db } = createTableDb({
      video_sources: [source(), source({ id: "other-src", item_id: OTHER_ITEM, youtube_id: "aaaaaaaaaaa" })],
      video_transcripts: [transcript(), transcript({ id: TR_OTHER, video_source_id: "other-src" })],
    });
    const repo = createSupabaseVideosRepo(db);
    expect((await repo.transcriptForItem(ITEM, TR))?.id).toBe(TR);
    expect(await repo.transcriptForItem(ITEM, TR_OTHER)).toBeNull();
    expect(await repo.transcriptForItem(OTHER_ITEM, TR)).toBeNull();
    expect(await repo.transcriptForItem("no-item", TR)).toBeNull();
    expect(await repo.transcriptForItem(ITEM, "not-a-uuid")).toBeNull();
  });

  it("says a database failure by operation and code, not by message", async () => {
    const { db, failOn } = createTableDb({ video_sources: [] });
    failOn.set("video_sources", `duplicate key value violates unique constraint "video_sources_youtube_id_key" Key (youtube_id)=(secret)`);
    const error = await createSupabaseVideosRepo(db).insertSource(ITEM, "dQw4w9WgXcQ").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).toContain("videos.insertSource");
  });
});
