import { istDate } from "@/lib/dates";
import { isRecord } from "@/lib/records";
import { buildViewBlocks, isIsoDate, readCaseFile } from "@/modules/casefile";
import { embedUrl, formatClock, thumbnailUrl } from "@/modules/distribution/public";
import { ordinal, revisionsOf } from "./site";
import type { PublicSnapshot, TranscriptLine, VideoChapter, VideoSegment, VideoSummary, VideoView } from "./types";
import { hasVideos, listedVideos, videoHref } from "./video-list";

// Plan 5b (spec s7.7): the page model and the summaries of the videos `listedVideos` admits. His words: title, objective, body, chapter titles.
// The machine's: the id, the duration, the dates, the transcript and the clocks.

export { hasVideos, listedVideos, videoHref };

/** "1:02:05" or "3:42"; null when YouTube gave no duration (a live stream not yet processed). */
const durationLabel = (seconds: number | null) => (seconds === null ? null : formatClock(seconds));

export function listVideoSummaries(s: PublicSnapshot): VideoSummary[] {
  return listedVideos(s)
    .sort((a, b) => b.item.revisedAt.localeCompare(a.item.revisedAt))
    .map(({ item, row }) => ({
      slug: item.slug, title: item.title, learningObjective: item.learningObjective ?? "", revisedOn: istDate(item.revisedAt),
      durationLabel: durationLabel(row.durationSeconds), href: videoHref(item.slug),
    }));
}

export function buildVideoView(s: PublicSnapshot, slug: string): VideoView | null {
  const found = listedVideos(s).find((v) => v.item.slug === slug);
  if (!found) return null;
  const { item, row, chapters } = found;
  // The id must be one the address builders accept; the page itself loads no picture (spec amendment s).
  if (thumbnailUrl(row.youtubeId) === null || embedUrl(row.youtubeId) === null) return null;
  const { revNo, revCount } = ordinal(s, item);
  return {
    slug, title: item.title, learningObjective: item.learningObjective ?? "", youtubeId: row.youtubeId, durationLabel: durationLabel(row.durationSeconds),
    uploadedOn: row.publishedAt ? istDate(row.publishedAt) : null, revisedOn: istDate(item.revisedAt),
    firstWrittenOn: istDate(revisionsOf(s, item.id)[0]?.createdAt ?? item.publishedAt), revNo, revCount,
    body: buildViewBlocks(item.bodyMd, readCaseFile(item.structured), s.today),
    chapters: chapters.map((c): VideoChapter => ({ s: c.s, clock: formatClock(c.s), title: c.title })),
    holdsPosition: item.companyId ? item.holdsPosition : null, dataAsOf: isIsoDate(item.dataAsOf) ? item.dataAsOf : null,
  };
}

/** What the page needs to fetch and check its transcript: the item, and the sha the current revision names. Null: not a listed video. */
export function transcriptKey(s: PublicSnapshot, slug: string): { itemId: string; sha: unknown } | null {
  const found = listedVideos(s).find((v) => v.item.slug === slug);
  return found && isRecord(found.item.structured) ? { itemId: found.item.id, sha: found.item.structured.transcriptSha } : null;
}

/** The segments exactly as stored, each with the clock of its start. The text is never changed. */
export const transcriptLines = (segments: readonly VideoSegment[]): TranscriptLine[] => segments.map((g) => ({ s: g.s, clock: formatClock(g.s), text: g.t }));
