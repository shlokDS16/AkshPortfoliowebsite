import { addDays, isPastLag, PUBLICATION_LAG_DAYS } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { isRecord } from "@/lib/records";
import { MAX_CHAPTER_TITLE, MAX_CHAPTERS, type VideoPrivacy } from "./types";

// What the desk says about one video (spec s7.6): the rule 12 checklist rows and the one status line of the list and the page. Pure and
// advisory: the database gate (migration 0023) decides and records, and these sentences are the ones it records, so a row here and a
// refusal there read the same. The sentences are pending Shlok's approval (spec s15, the T6 and T7 reports).

export const OFF_LINE = "Video listing is not set up yet (Shlok adds a YouTube key).";
export const STALE_DAYS = 7;

export type VideoFacts = {
  /** The YouTube settings are unset: nothing has been or will be fetched. */
  off: boolean;
  source: { youtubeId: string; ownChannel: boolean | null; privacy: VideoPrivacy | null; fetchedAt: string | null; fetchProblem: string | null } | null;
  /** The newest revision's record. */
  structured: unknown;
  /** The newest stored transcript of this video, if any. */
  latestTranscriptId: string | null;
  companyNamed: boolean;
  dataAsOf: string | null;
  /** The India date today and the clock, both from the server. */
  today: string;
  now: number;
  /** The item is public (it passed the gate); a company video may still be inside the 30-day lag. */
  listed: boolean;
};
export type VideoCheck = { id: string; name: string; state: "pass" | "fail" | "manual"; detail: string };
export type VideoStatus = { code: "off" | "waiting" | "gone" | "lagged" | "listed" | "public-on-youtube" | "not-listed"; line: string; detail: string; tone: "ok" | "warn" | "bad" | "muted" };

const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

/** Rule 12.4, as the database tests it: no chapters, or 3 to 100, the first at 0, strictly rising, each title 1 to 100 characters. */
function chaptersOk(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return 0;
  if (value.length < 3 || value.length > MAX_CHAPTERS) return null;
  let previous = -1;
  for (const [i, entry] of (value as unknown[]).entries()) {
    if (!isRecord(entry) || typeof entry.s !== "number" || !Number.isInteger(entry.s) || typeof entry.title !== "string") return null;
    if ((i === 0 && entry.s !== 0) || entry.s <= previous || entry.title.length < 1 || entry.title.length > MAX_CHAPTER_TITLE) return null;
    previous = entry.s;
  }
  return value.length;
}

/** 12.1: the first thing wrong with the YouTube side, or null. */
function youtubeProblem(f: VideoFacts): string | null {
  const s = f.source;
  if (!s || s.fetchedAt === null) return "YouTube data has not been fetched yet.";
  if (record(f.structured).youtubeId !== s.youtubeId) return "This revision does not match the video's YouTube link.";
  if (s.ownChannel !== true) return "This video is not from your channel.";
  if (s.privacy !== "unlisted" && s.privacy !== "public") return "This video is private or gone on YouTube.";
  if (f.now - Date.parse(s.fetchedAt) > STALE_DAYS * 86_400_000) return "YouTube data is more than 7 days old. Fetch it again.";
  return null;
}

export function videoChecks(f: VideoFacts): VideoCheck[] {
  const struct = record(f.structured);
  const checks: VideoCheck[] = [];
  const yt = youtubeProblem(f);
  checks.push({
    id: "rule-12-1", name: "From YouTube, your channel", state: yt ? "fail" : "pass",
    detail: yt ?? `${f.source?.privacy === "public" ? "Public" : "Unlisted"} on YouTube, fetched in the last ${STALE_DAYS} days.`,
  });
  const hasTranscript = typeof struct.transcriptId === "string" && typeof struct.transcriptSha === "string";
  const newer = hasTranscript && f.latestTranscriptId !== null && f.latestTranscriptId !== struct.transcriptId;
  checks.push({
    id: "rule-12-2", name: "Transcript", state: !hasTranscript ? "fail" : newer ? "manual" : "pass",
    detail: !hasTranscript ? "A video needs its transcript before it is listed." : newer ? "A newer transcript is stored. Use it to put it in the next revision." : "The transcript is in this revision and is checked word by word.",
  });
  if (f.companyNamed) {
    const ok = f.dataAsOf !== null && isPastLag(f.dataAsOf, f.today);
    checks.push({
      id: "rule-12-3", name: "Company and date", state: ok ? "pass" : "fail",
      detail: ok ? `Figures to ${formatDate(f.dataAsOf as string)}` : "A video that names a company needs a figures-to date at least 30 days old.",
    });
  }
  const n = chaptersOk(struct.chapters);
  checks.push({
    id: "rule-12-4", name: "Chapters", state: n === null ? "fail" : "pass",
    detail: n === null ? "Chapters must start at 0:00, number 3 to 100, rise in time and each have a title of 1 to 100 characters." : n === 0 ? "No chapters." : `${n} chapters.`,
  });
  return checks;
}

const status = (code: VideoStatus["code"], tone: VideoStatus["tone"], line: string, detail = line): VideoStatus => ({ code, tone, line, detail });

/** The one line of the list and the sentence on the page, from the machine's facts. Never changes anything. */
export function videoStatus(f: VideoFacts): VideoStatus {
  const s = f.source;
  // A listed video says so (and says when it is gone) whether or not the key is still set: the page is public either way.
  if (f.listed && s?.privacy === "gone") return status("gone", "bad", "This video is no longer on YouTube. Unpublish it here.");
  if (f.listed) {
    if (f.companyNamed && f.dataAsOf !== null && !isPastLag(f.dataAsOf, f.today)) {
      return status("lagged", "ok", `Passed the gate. Listed from ${formatDate(addDays(f.dataAsOf, PUBLICATION_LAG_DAYS))}`);
    }
    return status("listed", "ok", "Listed", s?.privacy === "public" ? "Listed on the site." : "Listed on the site. You can now make it Public on YouTube.");
  }
  if (f.off) return status("off", "muted", OFF_LINE);
  if (!s || s.fetchedAt === null) return status("waiting", "muted", "Waiting for YouTube");
  if (s.privacy === "public") return status("public-on-youtube", "warn", "Public on YouTube but not listed here", "This video is Public on YouTube but not listed here. Check it before sharing.");
  const first = videoChecks(f).find((c) => c.state === "fail");
  return status("not-listed", "muted", first ? `Not listed: ${first.detail}` : "Not listed: run the publishing gate.");
}
