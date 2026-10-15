import { ItemNotFoundError } from "@/lib/errors";
import { jsonEqual } from "@/lib/json-equal";
import { addRevision, getItemWithHistory, isItemId, updateItemMeta, type ResearchRepo, type Revision } from "@/modules/research";
import { parseCaptions } from "./captions";
import { parseChapters } from "./chapters";
import { captionsErrorCode, VideoError } from "./errors";
import { fileSha256, textSha256, wordCount } from "./hash";
import type { VideosRepo } from "./repo";
import { nextVideoStructured, type VideoStructured } from "./structured";
import type { Chapter, TranscriptRow, VideoSourceRow } from "./types";

// What the desk's four video buttons do (spec s7.1, s7.5, s7.6). Each of "Use this transcript", "Use this title" and "Use chapters from
// the description" makes ONE new revision with the body and the record carried, one thing changed, and a change reason from a fixed
// template (it publishes with the revision, so it is the machine's wording, never YouTube's). YouTube's title and description are
// machine data: they reach the item only when he presses; the transcript is never edited anywhere.

export type VideoDeps = { videos: VideosRepo; research: ResearchRepo };
export type VideoChange = { changed: boolean; pendingGate: boolean };

/** Change reasons, fixed text. Pending Shlok's approval (listed in the Task 7 report). */
export const CHANGE_REASON = {
  transcript: "Transcript set from the caption file.",
  title: "Title set from the YouTube title.",
  chapters: "Chapters set from the YouTube description.",
} as const;

async function loadVideo(deps: VideoDeps, itemId: string): Promise<{ source: VideoSourceRow; latest: Revision }> {
  if (!isItemId(itemId)) throw new VideoError("video-not-found");
  const [source, history] = await Promise.all([deps.videos.findByItem(itemId), getItemWithHistory(deps.research, itemId)]);
  const latest = history?.revisions[0];
  if (!source || !latest || history?.item.kind !== "video") throw new VideoError("video-not-found");
  return { source, latest };
}

/** The Studio caption file: parsed, stored as machine text with its hash, linked to no revision yet. */
export async function addTranscript(deps: VideoDeps, itemId: string, file: { name: string; bytes: Uint8Array }): Promise<TranscriptRow> {
  if (!isItemId(itemId)) throw new VideoError("video-not-found");
  const source = await deps.videos.findByItem(itemId);
  if (!source) throw new VideoError("video-not-found");
  const parsed = parseCaptions(file.bytes, file.name);
  if (!parsed.ok) throw new VideoError(captionsErrorCode(parsed.reason));
  // The database computes the hash and the word count itself and ignores these; the row it returns has its own, and that is what is linked.
  return deps.videos.insertTranscript({
    videoSourceId: source.id,
    fileSha256: fileSha256(file.bytes),
    segments: parsed.segments,
    textSha256: textSha256(parsed.segments),
    words: wordCount(parsed.segments),
  });
}

/** One revision with the body carried and `structured` replaced by `next`; nothing is written when it equals the newest. */
async function reviseWith(deps: VideoDeps, itemId: string, latest: Revision, next: VideoStructured, reason: string): Promise<VideoChange> {
  // jsonb keeps no key order, so the comparison ignores it.
  if (jsonEqual(latest.structured, next)) return { changed: false, pendingGate: false };
  const result = await addRevision(deps.research, { itemId, bodyMd: latest.bodyMd, structured: next, conceptIds: null, changeReason: reason, author: "aksh" });
  return { changed: true, pendingGate: result.pendingGate };
}

/** "Use this transcript": the newest stored transcript, by id and the database's hash. */
export async function applyTranscript(deps: VideoDeps, itemId: string): Promise<VideoChange> {
  const { source, latest } = await loadVideo(deps, itemId);
  const transcript = await deps.videos.latestTranscript(source.id);
  if (!transcript) throw new VideoError("video-no-transcript");
  const next = nextVideoStructured(latest.structured, source.youtubeId, { transcript: { id: transcript.id, sha: transcript.textSha256 } });
  return reviseWith(deps, itemId, latest, next, CHANGE_REASON.transcript);
}

/** "Use chapters from the description": his chapter lines from his own YouTube description, copied exactly. */
export async function applyChapters(deps: VideoDeps, itemId: string): Promise<VideoChange> {
  const { source, latest } = await loadVideo(deps, itemId);
  if (source.ytDescription === null) throw new VideoError("video-no-yt-data");
  const parsed = parseChapters(source.ytDescription);
  if (parsed.reason !== null) throw new VideoError("video-no-chapters");
  const chapters: Chapter[] = parsed.chapters;
  return reviseWith(deps, itemId, latest, nextVideoStructured(latest.structured, source.youtubeId, { chapters }), CHANGE_REASON.chapters);
}

/** "Use this title": YouTube's title becomes the item's title. A public item is frozen (the research service refuses it, before any revision). */
export async function applyTitle(deps: VideoDeps, itemId: string): Promise<VideoChange> {
  const { source, latest } = await loadVideo(deps, itemId);
  const title = source.ytTitle?.trim();
  if (!title) throw new VideoError("video-no-yt-data");
  const item = (await getItemWithHistory(deps.research, itemId))?.item;
  if (!item) throw new ItemNotFoundError(itemId);
  if (item.title === title) return { changed: false, pendingGate: false };
  await updateItemMeta(deps.research, itemId, { title });
  const result = await addRevision(deps.research, {
    itemId,
    bodyMd: latest.bodyMd,
    structured: nextVideoStructured(latest.structured, source.youtubeId, {}),
    conceptIds: null,
    changeReason: CHANGE_REASON.title,
    author: "aksh",
  });
  return { changed: true, pendingGate: result.pendingGate };
}
