import { isRecord } from "@/lib/records";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { SOURCE_COLUMNS, sourceFromRecord, type SourceRecord } from "./repo";
import type { VideoSourceRow } from "./types";

// The desk's list of videos (/desk/videos): one read of each of four tables through the ADMIN's session, merged here, so the list costs four
// queries however many videos there are (a few hundred at most) and each row carries what `videoStatus` needs. Read only.

export type VideoListRow = {
  itemId: string;
  title: string;
  visibility: string;
  companyNamed: boolean;
  dataAsOf: string | null;
  createdAt: string;
  source: VideoSourceRow | null;
  /** The newest revision's record. */
  structured: unknown;
  latestTranscriptId: string | null;
};

export async function listVideoRows(db: Db, limit = 100): Promise<VideoListRow[]> {
  const items = await db.from("items").select("id, title, visibility, company_id, data_as_of, created_at").eq("kind", "video").order("created_at", { ascending: false }).limit(limit);
  if (items.error) throw dbError("videos.listItems", items.error);
  const rows = items.data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [sources, revisions] = await Promise.all([
    db.from("video_sources").select(SOURCE_COLUMNS).in("item_id", ids),
    db.from("item_revisions").select("item_id, structured, created_at").in("item_id", ids).order("created_at", { ascending: false }),
  ]);
  if (sources.error) throw dbError("videos.listSources", sources.error);
  if (revisions.error) throw dbError("videos.listRevisions", revisions.error);
  const byItem = new Map((sources.data ?? []).map((s) => [s.item_id, sourceFromRecord(s as SourceRecord)]));
  const sourceIds = [...byItem.values()].map((s) => s.id);
  const transcripts = sourceIds.length === 0 ? { data: [], error: null } : await db.from("video_transcripts").select("id, video_source_id, created_at").in("video_source_id", sourceIds).order("created_at", { ascending: false });
  if (transcripts.error) throw dbError("videos.listTranscripts", transcripts.error);
  // Both reads are newest first, so the first row seen for a key is its newest.
  const newestRecord = new Map<string, unknown>();
  for (const r of revisions.data ?? []) if (!newestRecord.has(r.item_id)) newestRecord.set(r.item_id, r.structured);
  const newestTranscript = new Map<string, string>();
  for (const t of transcripts.data ?? []) if (!newestTranscript.has(t.video_source_id)) newestTranscript.set(t.video_source_id, t.id);
  return rows.map((r) => {
    const source = byItem.get(r.id) ?? null;
    const structured = newestRecord.get(r.id);
    return {
      itemId: r.id, title: r.title, visibility: r.visibility, companyNamed: r.company_id !== null, dataAsOf: r.data_as_of, createdAt: r.created_at, source,
      structured: isRecord(structured) ? structured : {}, latestTranscriptId: source ? (newestTranscript.get(source.id) ?? null) : null,
    };
  });
}
