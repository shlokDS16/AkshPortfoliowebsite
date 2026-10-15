import { describe, expect, it } from "vitest";
import { createTableDb } from "@/test/fakes/table-db";
import { listVideoRows } from "./list";

const ID_A = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const ID_B = "11111111-2222-4333-8444-555555555555";
const SRC_A = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const item = (id: string, over: Record<string, unknown> = {}) => ({
  id, kind: "video", title: `Video ${id.slice(0, 4)}`, visibility: "private", company_id: null, data_as_of: null, created_at: "2026-10-15T00:00:00+00:00", ...over,
});
const source = (over: Record<string, unknown> = {}) => ({
  id: SRC_A, item_id: ID_A, youtube_id: "dQw4w9WgXcQ", channel_id: "UCx", own_channel: true, yt_title: "T", yt_description: "d", duration_seconds: 90,
  privacy: "unlisted", yt_published_at: null, fetched_at: "2026-10-16T00:00:00+00:00", fetch_problem: null, created_at: "2026-10-15T00:00:00+00:00", ...over,
});

describe("listVideoRows (the desk list, one read of each table)", () => {
  it("gives every video item newest first with its source, its newest revision's record and its newest stored transcript", async () => {
    const { db } = createTableDb({
      items: [item(ID_A, { created_at: "2026-10-14T00:00:00+00:00" }), item(ID_B), { ...item("33333333-4444-4555-8666-777777777777"), kind: "learning" }],
      video_sources: [source()],
      item_revisions: [
        { item_id: ID_A, structured: { schema: "video/1", chapters: [] }, created_at: "2026-10-15T00:00:00+00:00" },
        { item_id: ID_A, structured: { schema: "video/1", youtubeId: "dQw4w9WgXcQ", chapters: [] }, created_at: "2026-10-16T00:00:00+00:00" },
      ],
      video_transcripts: [
        { id: "t-old", video_source_id: SRC_A, created_at: "2026-10-15T00:00:00+00:00" },
        { id: "t-new", video_source_id: SRC_A, created_at: "2026-10-16T00:00:00+00:00" },
      ],
    });
    const rows = await listVideoRows(db);
    expect(rows.map((r) => r.itemId)).toEqual([ID_B, ID_A]);
    expect(rows[0]).toMatchObject({ itemId: ID_B, source: null, structured: {}, latestTranscriptId: null, companyNamed: false });
    expect(rows[1]).toMatchObject({ itemId: ID_A, title: "Video 0b6f", visibility: "private", latestTranscriptId: "t-new", structured: { youtubeId: "dQw4w9WgXcQ" } });
    expect(rows[1].source).toMatchObject({ youtubeId: "dQw4w9WgXcQ", privacy: "unlisted", durationSeconds: 90 });
  });

  it("marks a video that names a company, with its figures-to date", async () => {
    const { db } = createTableDb({ items: [item(ID_A, { company_id: "c1", data_as_of: "2026-08-22" })], video_sources: [], item_revisions: [], video_transcripts: [] });
    expect((await listVideoRows(db))[0]).toMatchObject({ companyNamed: true, dataAsOf: "2026-08-22" });
  });

  it("reads nothing else when there is no video", async () => {
    const { db, log } = createTableDb({ items: [] });
    expect(await listVideoRows(db)).toEqual([]);
    expect(log.map((l) => l.table)).toEqual(["items"]);
  });

  it("caps the list", async () => {
    const { db } = createTableDb({ items: [item(ID_A), item(ID_B)], video_sources: [], item_revisions: [], video_transcripts: [] });
    expect(await listVideoRows(db, 1)).toHaveLength(1);
  });
});
