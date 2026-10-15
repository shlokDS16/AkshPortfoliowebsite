import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { PublicItemLockedError } from "@/lib/errors";
import { errorCode, errorText } from "@/lib/messages";
import { createItem } from "@/modules/research";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { VIDEO_ERROR_TEXT, VideoError, type VideoErrorCode } from "./errors";
import { textSha256, wordCount } from "./hash";
import type { VideosRepo } from "./repo";
import { addTranscript, applyChapters, applyTitle, applyTranscript } from "./service";
import { initialVideoStructured } from "./structured";
import type { TranscriptRow, VideoSourceRow } from "./types";

const YT = "dQw4w9WgXcQ";
const DB_HASH_PREFIX = "d"; // the fake database seals its own hash, to prove the service uses the database's value, not its own

type Fake = VideosRepo & { sources: VideoSourceRow[]; transcripts: TranscriptRow[]; sent: unknown[] };
function fakeVideos(): Fake {
  const sources: VideoSourceRow[] = [];
  const transcripts: TranscriptRow[] = [];
  const sent: unknown[] = [];
  return {
    sources,
    transcripts,
    sent,
    async findByItem(itemId) {
      return sources.find((s) => s.itemId === itemId) ?? null;
    },
    async findByYoutubeId(id) {
      return sources.find((s) => s.youtubeId === id) ?? null;
    },
    async insertSource(itemId, youtubeId) {
      throw new Error(`unused ${itemId} ${youtubeId}`);
    },
    async insertTranscript(input) {
      sent.push(input);
      const row: TranscriptRow = {
        id: randomUUID(), videoSourceId: input.videoSourceId, source: "captions_file", fileSha256: input.fileSha256, segments: input.segments,
        textSha256: DB_HASH_PREFIX + textSha256(input.segments).slice(1), words: wordCount(input.segments), createdAt: new Date(2026, 9, 16, 0, transcripts.length).toISOString(),
      };
      transcripts.push(row);
      return row;
    },
    async latestTranscript(sourceId) {
      return [...transcripts].filter((t) => t.videoSourceId === sourceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    },
    async transcriptForItem() {
      return null;
    },
  };
}

let research: MemoryResearchRepo;
let videos: Fake;
let itemId: string;
let sourceId: string;
const deps = () => ({ research, videos });
const source = (patch: Partial<VideoSourceRow> = {}): VideoSourceRow => ({
  id: sourceId, itemId, youtubeId: YT, channelId: "UC0123456789abcdefghijkl", ownChannel: true, ytTitle: "How I read an annual report", ytDescription: "Notes.\n\n0:00 Intro\n1:00 Balance sheet\n2:30 Cash flow",
  durationSeconds: 600, privacy: "unlisted", ytPublishedAt: "2026-09-01T10:00:00+00:00", fetchedAt: "2026-10-16T00:00:00+00:00", fetchProblem: null, createdAt: "2026-10-15T00:00:00+00:00", ...patch,
});
const VTT = new TextEncoder().encode("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello world.\n\n00:00:40.000 --> 00:00:42.000\nSecond line here\n");
const latest = () => research.revisions.filter((r) => r.itemId === itemId).sort((a, b) => b.revNo - a.revNo)[0];
const revisionCount = () => research.revisions.filter((r) => r.itemId === itemId).length;

beforeEach(async () => {
  research = createMemoryResearchRepo();
  videos = fakeVideos();
  const { item } = await createItem(research, { kind: "video", title: `Video ${YT}`, bodyMd: "My own description of the video.", structured: initialVideoStructured(YT) });
  itemId = item.id;
  sourceId = randomUUID();
  videos.sources.push(source());
});

describe("addTranscript: the Studio caption file, stored as machine text and never edited", () => {
  it("parses the file, stores the segments with the file's hash, and returns the row the database sealed", async () => {
    const row = await addTranscript(deps(), itemId, { name: "captions.en.vtt", bytes: VTT });
    expect(row.segments).toEqual([{ s: 1, t: "Hello world." }, { s: 40, t: "Second line here" }]);
    expect(videos.sent).toEqual([expect.objectContaining({ videoSourceId: sourceId, fileSha256: expect.stringMatching(/^[0-9a-f]{64}$/), words: 5 })]);
    expect(row.textSha256).toMatch(/^d/);
    expect(revisionCount()).toBe(1);
  });

  it("makes no revision: the transcript is linked only on his press of 'Use this transcript'", async () => {
    await addTranscript(deps(), itemId, { name: "x.vtt", bytes: VTT });
    expect(latest().structured).toEqual(initialVideoStructured(YT));
  });

  it.each([
    ["not a caption file", new TextEncoder().encode("just words"), "video-captions-invalid"],
    ["an HTML page", new TextEncoder().encode("<html></html>"), "video-captions-invalid"],
    ["over 1 MB", new Uint8Array(1_048_577), "video-captions-too-big"],
  ] as const)("refuses %s with %s and stores nothing", async (_label, bytes, code) => {
    const error = await addTranscript(deps(), itemId, { name: "x.vtt", bytes }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VideoError);
    expect((error as VideoError).code).toBe(code);
    expect(videos.transcripts).toEqual([]);
  });

  it("refuses an item with no video source, and an id that is not an item id", async () => {
    for (const id of [randomUUID(), "not-an-id"]) {
      const error = await addTranscript(deps(), id, { name: "x.vtt", bytes: VTT }).catch((e: unknown) => e);
      expect((error as VideoError).code).toBe("video-not-found");
    }
  });
});

describe("applyTranscript: one revision with the body carried and the transcript linked by id and the database's hash", () => {
  it("links the newest stored transcript", async () => {
    await addTranscript(deps(), itemId, { name: "old.vtt", bytes: new TextEncoder().encode("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOld.\n") });
    const newest = await addTranscript(deps(), itemId, { name: "new.vtt", bytes: VTT });
    const out = await applyTranscript(deps(), itemId);
    expect(out).toMatchObject({ changed: true, pendingGate: false });
    expect(latest()).toMatchObject({
      bodyMd: "My own description of the video.",
      structured: { schema: "video/1", youtubeId: YT, transcriptId: newest.id, transcriptSha: newest.textSha256, chapters: [] },
      changeReason: "Transcript set from the caption file.",
      author: "aksh",
    });
    expect(revisionCount()).toBe(2);
  });

  it("does nothing the second time", async () => {
    await addTranscript(deps(), itemId, { name: "x.vtt", bytes: VTT });
    await applyTranscript(deps(), itemId);
    expect(await applyTranscript(deps(), itemId)).toMatchObject({ changed: false });
    expect(revisionCount()).toBe(2);
  });

  it("carries the chapters it already had", async () => {
    await addTranscript(deps(), itemId, { name: "x.vtt", bytes: VTT });
    await applyChapters(deps(), itemId);
    await applyTranscript(deps(), itemId);
    expect((latest().structured as { chapters: unknown[] }).chapters).toHaveLength(3);
  });

  it("asks for a transcript first", async () => {
    const error = await applyTranscript(deps(), itemId).catch((e: unknown) => e);
    expect((error as VideoError).code).toBe("video-no-transcript");
    expect(revisionCount()).toBe(1);
  });

  it("on a public item the new revision waits for the gate", async () => {
    await addTranscript(deps(), itemId, { name: "x.vtt", bytes: VTT });
    research.setVisibility(itemId, "public");
    expect(await applyTranscript(deps(), itemId)).toMatchObject({ changed: true, pendingGate: true });
  });
});

describe("applyTitle: YouTube's title becomes his title on his press", () => {
  it("sets the item title exactly as YouTube sent it and makes one revision with the body and record carried", async () => {
    const before = latest();
    const out = await applyTitle(deps(), itemId);
    expect(out).toMatchObject({ changed: true });
    expect(research.items.get(itemId)?.title).toBe("How I read an annual report");
    expect(latest().bodyMd).toBe(before.bodyMd);
    expect(latest().structured).toEqual(before.structured);
    expect(latest().changeReason).toBe("Title set from the YouTube title.");
    expect(revisionCount()).toBe(2);
  });

  it("keeps YouTube's text out of the revision's record", async () => {
    await applyTitle(deps(), itemId);
    expect(JSON.stringify(latest().structured)).not.toContain("annual report");
  });

  it("does nothing when the title is already that", async () => {
    await applyTitle(deps(), itemId);
    expect(await applyTitle(deps(), itemId)).toMatchObject({ changed: false });
    expect(revisionCount()).toBe(2);
  });

  it("asks for a fetch first when YouTube has not answered", async () => {
    videos.sources[0] = source({ ytTitle: null, fetchedAt: null });
    const error = await applyTitle(deps(), itemId).catch((e: unknown) => e);
    expect((error as VideoError).code).toBe("video-no-yt-data");
  });

  it("is refused on a public item, which is frozen, and makes no revision", async () => {
    research.setVisibility(itemId, "public");
    await expect(applyTitle(deps(), itemId)).rejects.toBeInstanceOf(PublicItemLockedError);
    expect(revisionCount()).toBe(1);
  });
});

describe("applyChapters: his own chapter lines from the YouTube description, copied exactly", () => {
  it("writes the chapters into the record and carries the body", async () => {
    const out = await applyChapters(deps(), itemId);
    expect(out).toMatchObject({ changed: true });
    expect(latest().structured).toMatchObject({ chapters: [{ s: 0, title: "Intro" }, { s: 60, title: "Balance sheet" }, { s: 150, title: "Cash flow" }] });
    expect(latest().bodyMd).toBe("My own description of the video.");
    expect(latest().changeReason).toBe("Chapters set from the YouTube description.");
  });

  it("keeps the transcript it already had", async () => {
    const row = await addTranscript(deps(), itemId, { name: "x.vtt", bytes: VTT });
    await applyTranscript(deps(), itemId);
    await applyChapters(deps(), itemId);
    expect(latest().structured).toMatchObject({ transcriptId: row.id, transcriptSha: row.textSha256 });
  });

  it("does nothing the second time", async () => {
    await applyChapters(deps(), itemId);
    expect(await applyChapters(deps(), itemId)).toMatchObject({ changed: false });
  });

  it("refuses a description that has no accepted chapter list", async () => {
    videos.sources[0] = source({ ytDescription: "0:00 Only one\n1:00 Two" });
    const error = await applyChapters(deps(), itemId).catch((e: unknown) => e);
    expect((error as VideoError).code).toBe("video-no-chapters");
    expect(revisionCount()).toBe(1);
  });

  it("asks for a fetch first when there is no description yet", async () => {
    videos.sources[0] = source({ ytDescription: null, fetchedAt: null });
    expect(((await applyChapters(deps(), itemId).catch((e: unknown) => e)) as VideoError).code).toBe("video-no-yt-data");
  });
});

describe("the error messages", () => {
  it.each(Object.keys(VIDEO_ERROR_TEXT) as VideoErrorCode[])("%s shows as itself with the same text in messages.ts", (code) => {
    expect(errorCode(new VideoError(code))).toBe(code);
    expect(errorText(code)).toBe(VIDEO_ERROR_TEXT[code]);
  });
});
