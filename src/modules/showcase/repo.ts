import type { HoldsPosition } from "@/lib/desk-types";
import { dbError } from "@/lib/supabase/errors";
import { readAllPages } from "@/lib/supabase/paging";
import type { Db } from "@/lib/supabase/types";
import { isIsoDate } from "@/modules/casefile";
import { HOLDS_POSITIONS, ITEM_KINDS } from "@/modules/research";
import type {
  ItemKind, PublicCompanyRow, PublicConceptLink, PublicConceptRow, PublicFactCheck, PublicItemRow, PublicRevisionRow, PublicSnapshot, PublicVideoRow, ShowcaseRepo,
  VideoSegment,
} from "./types";

// Explicit column lists (rule 9): anon holds column-level grants, and select=* returns 42501 (SDD ledger, Task 3).
export const ITEM_COLUMNS =
  "id, kind, slug, title, company_id, theme_id, published_at, data_as_of, learning_objective, holds_position, revision_id, rev_no, body_md, structured, revised_at, file_no";
export const REVISION_COLUMNS = "id, item_id, rev_no, body_md, structured, change_reason, created_at";
export const COMPANY_COLUMNS = "id, slug, name, nse_symbol, sector";
/** Plan 4: the only concept columns anon can read. A description and an edge are never named here. */
export const CONCEPT_COLUMNS = "id, slug, name";
export const CONCEPT_LINK_COLUMNS = "item_id, revision_id, concept_id, position";
/** Plan 5b: the only video columns anon can read (migration 0022). A channel, YouTube's description, its privacy state and a fetch problem are not among them. */
export const VIDEO_COLUMNS = "item_id, youtube_id, duration_seconds, yt_published_at";
export const VIDEO_TRANSCRIPT_COLUMNS = "item_id, segments";
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

type Nullable<T> = { [K in keyof T]: T[K] | null };
type ItemRecord = Nullable<{
  id: string; kind: string; slug: string; title: string; company_id: string; theme_id: string; published_at: string; data_as_of: string;
  learning_objective: string; holds_position: string; revision_id: string; rev_no: number; body_md: string; structured: unknown; revised_at: string; file_no: number;
}>;

/** Rule 2: a timestamp must be readable before any view turns it into a date (istDate throws on garbage). */
const isTimestamp = (v: string | null): v is string => v !== null && !Number.isNaN(new Date(v).getTime());
// D52: a read is never public. The SQL gate refuses one; this is the second wall, so loosening the gate later (spec s12) changes nothing here.
// Plan 5b: a "video" is a public kind, but only with a row in public_videos (see `listedItemsOnly`): the kind alone admits nothing.
const PUBLIC_KINDS: readonly string[] = ITEM_KINDS.filter((k) => k !== "reading_note");
const isKind = (v: string): v is ItemKind => PUBLIC_KINDS.includes(v);
const asPosition = (v: string | null): HoldsPosition | null => ((HOLDS_POSITIONS as readonly string[]).includes(v ?? "") ? (v as HoldsPosition) : null);

function toItem(r: ItemRecord): PublicItemRow[] {
  if (!r.id || !r.slug || !r.title || !r.revision_id || !r.kind || !isKind(r.kind) || !isTimestamp(r.published_at) || !isTimestamp(r.revised_at)) return [];
  return [{
    id: r.id, kind: r.kind, slug: r.slug, title: r.title, companyId: r.company_id, themeId: r.theme_id, publishedAt: r.published_at,
    dataAsOf: isIsoDate(r.data_as_of) ? r.data_as_of : null, learningObjective: r.learning_objective, holdsPosition: asPosition(r.holds_position),
    revisionId: r.revision_id, revNo: r.rev_no ?? 1, bodyMd: r.body_md ?? "", structured: r.structured ?? {}, revisedAt: r.revised_at, fileNo: r.file_no,
  }];
}

/** A transcript is the segments the database stored: whole seconds that never go back, text of 1 to 500 characters, nothing else. Else it is no transcript. */
function toSegments(value: unknown): VideoSegment[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5000) return null;
  let previous = 0;
  const out: VideoSegment[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== "object" || entry === null || Object.keys(entry).length !== 2) return null;
    const { s, t } = entry as { s?: unknown; t?: unknown };
    if (typeof s !== "number" || !Number.isInteger(s) || s < previous || typeof t !== "string" || t.length < 1 || t.length > 500) return null;
    previous = s;
    out.push({ s, t });
  }
  return out;
}

/**
 * Plan 5b: a video item is public only through public_videos. An item of kind video with no row there (the view is unreadable, or the
 * item is not a listed video) is dropped with every revision of it, so no builder can show a title, a feed entry or a sitemap line of it.
 */
export function listedItemsOnly(items: PublicItemRow[], revisions: PublicRevisionRow[], videos: PublicVideoRow[]): { items: PublicItemRow[]; revisions: PublicRevisionRow[] } {
  const listed = new Set(videos.map((v) => v.itemId));
  const dropped = new Set(items.filter((i) => i.kind === "video" && !listed.has(i.id)).map((i) => i.id));
  return dropped.size === 0 ? { items, revisions } : { items: items.filter((i) => !dropped.has(i.id)), revisions: revisions.filter((r) => !dropped.has(r.itemId)) };
}

export function createSupabaseShowcaseRepo(db: Db): ShowcaseRepo {
  return {
    async listItems() {
      const { data, error } = await db.from("public_items").select(ITEM_COLUMNS).order("published_at", { ascending: true });
      if (error) throw dbError("showcase.listItems", error);
      return ((data ?? []) as unknown as ItemRecord[]).flatMap(toItem);
    },
    async listRevisions() {
      const { data, error } = await db.from("public_item_revisions").select(REVISION_COLUMNS).order("created_at", { ascending: true });
      if (error) throw dbError("showcase.listRevisions", error);
      return (data ?? []).flatMap((r): PublicRevisionRow[] =>
        r.id && r.item_id && isTimestamp(r.created_at)
          ? [{ id: r.id, itemId: r.item_id, revNo: r.rev_no ?? 1, bodyMd: r.body_md ?? "", structured: r.structured ?? {}, changeReason: r.change_reason, createdAt: r.created_at }]
          : [],
      );
    },
    async listCompanies() {
      const { data, error } = await db.from("public_companies").select(COMPANY_COLUMNS).order("name", { ascending: true });
      if (error) throw dbError("showcase.listCompanies", error);
      return (data ?? []).flatMap((c): PublicCompanyRow[] =>
        c.id && c.slug && c.name ? [{ id: c.id, slug: c.slug, name: c.name, symbol: c.nse_symbol, sector: c.sector }] : [],
      );
    },
    async factChecks() {
      // public_fact_checks is granted to anon only (migration 0009): this must be the cookie-less public client (rule 10).
      // Optional: the line is a caption, so any failure (function not yet migrated, stale schema cache, timeout) means no
      // line, never a failed public page. Only the code is logged (rule: no provider text in logs).
      const { data, error } = await db.rpc("public_fact_checks", {});
      if (error) {
        console.error("showcase: fact checks unavailable", error.code ?? "no code");
        return [];
      }
      return (data ?? []).flatMap((r): PublicFactCheck[] =>
        r.item_id && r.fact_id && Number.isInteger(r.page_no) && (r.page_no as number) >= 1 ? [{ itemId: r.item_id, factId: r.fact_id, pageNo: r.page_no as number }] : [],
      );
    },
    async listConcepts() {
      // Optional (D60): a view that is not there yet, a stale schema cache or a timeout means no concept pages, never a failed public page.
      // Only the code is logged.
      const { data, error } = await db.from("public_themes").select(CONCEPT_COLUMNS).order("name", { ascending: true });
      if (error) {
        console.error("showcase: concepts unavailable", error.code ?? "no code");
        return [];
      }
      return (data ?? []).flatMap((c): PublicConceptRow[] => (c.id && c.slug && c.name ? [{ id: c.id, slug: c.slug, name: c.name }] : []));
    },
    async listConceptLinks() {
      // Up to eight rows per gated revision, so this is the one read that can pass PostgREST's 1000-row answer: page it, in a stable order.
      const { data, error } = await readAllPages((from, to) =>
        db.from("public_concept_links").select(CONCEPT_LINK_COLUMNS).order("revision_id").order("position").order("concept_id").range(from, to),
      );
      if (error) {
        console.error("showcase: concept links unavailable", error.code ?? "no code");
        return [];
      }
      return (data ?? []).flatMap((l): PublicConceptLink[] =>
        l.item_id && l.revision_id && l.concept_id && Number.isInteger(l.position) && (l.position as number) >= 1
          ? [{ itemId: l.item_id, revisionId: l.revision_id, conceptId: l.concept_id, position: l.position as number }]
          : [],
      );
    },
    async listVideos() {
      // Optional (D60): a view that is not there yet or a timeout means no video is listed, never a failed public page. Only the code is logged.
      const { data, error } = await db.from("public_videos").select(VIDEO_COLUMNS).order("yt_published_at", { ascending: true });
      if (error) {
        console.error("showcase: videos unavailable", error.code ?? "no code");
        return [];
      }
      return (data ?? []).flatMap((v): PublicVideoRow[] =>
        v.item_id && v.youtube_id && YOUTUBE_ID.test(v.youtube_id)
          ? [{ itemId: v.item_id, youtubeId: v.youtube_id, durationSeconds: Number.isInteger(v.duration_seconds) && (v.duration_seconds as number) > 0 ? (v.duration_seconds as number) : null, publishedAt: isTimestamp(v.yt_published_at) ? v.yt_published_at : null }]
          : [],
      );
    },
    async videoTranscript(itemId) {
      // The view returns the transcript the CURRENT public revision names, and none for a private, failed, pending or lagged item.
      const { data, error } = await db.from("public_video_transcripts").select(VIDEO_TRANSCRIPT_COLUMNS).eq("item_id", itemId).maybeSingle();
      if (error) throw dbError("showcase.videoTranscript", error);
      return data ? toSegments(data.segments) : null;
    },
    async captureDays(days) {
      // capture_days is granted to anon only: this must be the cookie-less public client (rule 10).
      const { data, error } = await db.rpc("capture_days", { p_days: days });
      if (error) throw dbError("showcase.captureDays", error);
      return (data ?? []).map((r: { day: string }) => r.day).filter(isIsoDate);
    },
  };
}

export async function loadSnapshot(repo: ShowcaseRepo, today: string): Promise<PublicSnapshot> {
  const [all, allRevisions, companies, captureDays, factChecks, concepts, conceptLinks, videos] = await Promise.all([
    repo.listItems(), repo.listRevisions(), repo.listCompanies(), repo.captureDays(30), repo.factChecks(), repo.listConcepts(), repo.listConceptLinks(), repo.listVideos(),
  ]);
  const { items, revisions } = listedItemsOnly(all, allRevisions, videos);
  return { items, revisions, companies, captureDays, factChecks, concepts, conceptLinks, videos, today };
}
