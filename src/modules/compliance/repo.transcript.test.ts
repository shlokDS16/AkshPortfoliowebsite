import { describe, expect, it } from "vitest";
import { createTableDb } from "@/test/fakes/table-db";
import { createSupabaseComplianceRepo } from "./repo";

const ITEM = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const OTHER_ITEM = "11111111-2222-4333-8444-555555555555";
const REV = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const SRC = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_SRC = "99999999-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TR = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TR_OTHER = "22222222-3333-4444-8555-666666666666";

const item = (kind: string) => ({ id: ITEM, kind, title: "T", slug: null, learning_objective: null, company_id: null, holds_position: null, data_as_of: null, visibility: "private" });
const revision = (structured: Record<string, unknown>) => ({ id: REV, item_id: ITEM, body_md: "b", structured, change_reason: null, concept_ids: null });
const tables = (kind: string, structured: Record<string, unknown>) => ({
  items: [item(kind)],
  item_revisions: [revision(structured)],
  lint_allowances: [],
  video_sources: [
    { id: SRC, item_id: ITEM, youtube_id: "dQw4w9WgXcQ" },
    { id: OTHER_SRC, item_id: OTHER_ITEM, youtube_id: "aaaaaaaaaaa" },
  ],
  video_transcripts: [
    { id: TR, video_source_id: SRC, segments: [{ s: 0, t: "Hello world." }, { s: 31, t: "Second line here" }], text_sha256: "a".repeat(64), created_at: "2026-10-16T00:00:00+00:00" },
    { id: TR_OTHER, video_source_id: OTHER_SRC, segments: [{ s: 0, t: "Someone else's words." }], text_sha256: "b".repeat(64), created_at: "2026-10-16T00:00:00+00:00" },
  ],
});

describe("loadPublishContext: a video revision's transcript (rule 12.2)", () => {
  it("loads the stored segment texts joined by a newline, the text the hash is taken over", async () => {
    const { db } = createTableDb(tables("video", { schema: "video/1", transcriptId: TR, chapters: [] }));
    const ctx = await createSupabaseComplianceRepo(db).loadPublishContext(ITEM, REV);
    expect(ctx?.transcript).toBe("Hello world.\nSecond line here");
  });

  it("is null when the revision names no transcript, a malformed id, or another video's transcript", async () => {
    for (const structured of [{ schema: "video/1", chapters: [] }, { transcriptId: "not-a-uuid" }, { transcriptId: TR_OTHER }, { transcriptId: 7 }]) {
      const { db } = createTableDb(tables("video", structured));
      expect((await createSupabaseComplianceRepo(db).loadPublishContext(ITEM, REV))?.transcript, JSON.stringify(structured)).toBeNull();
    }
  });

  it("never reads the video tables for any other kind, even when the structured data names a transcript", async () => {
    const { db, log } = createTableDb(tables("learning", { transcriptId: TR }));
    const ctx = await createSupabaseComplianceRepo(db).loadPublishContext(ITEM, REV);
    expect(ctx?.transcript).toBeNull();
    expect(log.filter((l) => l.table.startsWith("video_"))).toEqual([]);
  });
});
