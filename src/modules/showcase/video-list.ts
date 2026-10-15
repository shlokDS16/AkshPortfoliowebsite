import { isRecord } from "@/lib/records";
import { thumbnailUrl } from "@/modules/distribution/public";
import type { PublicItemRow, PublicSnapshot, PublicVideoRow } from "./types";

// Plan 5b (spec s7.7). A video is listed only when ALL of these hold, each re-checked here though the database already insists (defence in
// depth, as `files()` does for the 30-day lag): the item is of kind video; public_videos has a row for it; the row's YouTube id is a real
// id and is the one the item's current revision names; the revision's record is `video/1`. Anything less is not listed anywhere: no page,
// no summary, no feed entry, no sitemap line. Nothing here reads a channel, YouTube's own description, a privacy state or a fetch problem:
// the snapshot has no field for them. His words: title, objective, body, chapter titles. The machine's: the id, the duration, the dates.

export type ListedVideo = { item: PublicItemRow; row: PublicVideoRow; chapters: { s: number; title: string }[] };

export const videoHref = (slug: string) => `/videos/${slug}`;

/** His chapter list as the gate accepted it (starts whole, rising, a title of 1 to 100 characters); a damaged list is none, never part of one. */
function chaptersOf(structured: Record<string, unknown>): { s: number; title: string }[] {
  const raw = structured.chapters;
  if (!Array.isArray(raw)) return [];
  const out: { s: number; title: string }[] = [];
  for (const entry of raw as unknown[]) {
    if (!isRecord(entry) || typeof entry.s !== "number" || !Number.isInteger(entry.s) || entry.s < 0 || typeof entry.title !== "string") return [];
    if (entry.title.trim() === "" || entry.title.length > 100 || (out.length > 0 && entry.s <= out[out.length - 1].s)) return [];
    out.push({ s: entry.s, title: entry.title });
  }
  return out;
}

/** Every video the public can open, in the order of the snapshot. */
export function listedVideos(s: PublicSnapshot): ListedVideo[] {
  const rows = new Map((s.videos ?? []).map((v) => [v.itemId, v]));
  return s.items.flatMap((item): ListedVideo[] => {
    const row = rows.get(item.id);
    const structured = item.structured;
    if (item.kind !== "video" || !row || thumbnailUrl(row.youtubeId) === null || !isRecord(structured)) return [];
    if (structured.schema !== "video/1" || structured.youtubeId !== row.youtubeId) return [];
    return [{ item, row, chapters: chaptersOf(structured) }];
  });
}

export const hasVideos = (s: PublicSnapshot) => listedVideos(s).length > 0;
