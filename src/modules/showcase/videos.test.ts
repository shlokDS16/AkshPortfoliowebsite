import { describe, expect, it } from "vitest";
import { buildSeedSnapshot, VIDEO_CHAPTERS, VIDEO_ID, VIDEO_SEGMENTS, withVideo } from "@/test/fakes/showcase-snapshot";
import { derivedProblems } from "./derived-scan";
import { buildVideoView, hasVideos, listedVideos, listVideoSummaries, transcriptLines, videoHref } from "./videos";

const seed = buildSeedSnapshot();
const world = withVideo(seed);

describe("which videos are listed", () => {
  it("is empty in the deploy state: no video item, no page, no summary", () => {
    expect(listedVideos(seed)).toEqual([]);
    expect(hasVideos(seed)).toBe(false);
    expect(listVideoSummaries(seed)).toEqual([]);
    expect(buildVideoView(seed, "v1-reading-the-ageing-table")).toBeNull();
  });

  it("lists a video item that has a public_videos row and a record naming the same YouTube id", () => {
    expect(listedVideos(world).map((v) => v.item.id)).toEqual(["v1"]);
    expect(hasVideos(world)).toBe(true);
  });

  it("fails closed: no row, a different YouTube id, a record that is not video/1 or a malformed id is not listed", () => {
    const noRow = { ...world, videos: [] };
    const missing = { ...world, videos: undefined };
    const other = withVideo(seed, { structured: { schema: "video/1", youtubeId: "AAAAAAAAAAA", chapters: [] } });
    const notVideo = withVideo(seed, { structured: { schema: "case/1" } });
    const badId = withVideo(seed, {}, { youtubeId: "short" });
    for (const s of [noRow, missing, other, notVideo, badId]) {
      expect(listedVideos(s)).toEqual([]);
      expect(buildVideoView(s, "v1-reading-the-ageing-table")).toBeNull();
    }
  });

  it("never lists a read or another kind through a stray row in public_videos", () => {
    const s = { ...seed, videos: [{ itemId: "n0", youtubeId: VIDEO_ID, durationSeconds: 10, publishedAt: null }] };
    expect(listedVideos(s)).toEqual([]);
  });
});

describe("the summaries and the view", () => {
  it("summarises newest revision first with his title and objective as they are, a duration label and the page address", () => {
    const two = withVideo(
      world,
      { id: "v2", title: "An earlier talk", revisedAt: "2026-09-01T05:00:00Z", publishedAt: "2026-09-01T05:00:00Z", structured: { schema: "video/1", youtubeId: "AAAAAAAAAAA", chapters: [] } },
      { youtubeId: "AAAAAAAAAAA" },
    );
    expect(listVideoSummaries(two).map((v) => v.title)).toEqual(["Reading the ageing table", "An earlier talk"]);
    expect(listVideoSummaries(world)).toEqual([
      { slug: "v1-reading-the-ageing-table", title: "Reading the ageing table", learningObjective: "How to read who pays late.", revisedOn: "2026-09-25", durationLabel: "1:02:05", href: "/videos/v1-reading-the-ageing-table" },
    ]);
    expect(videoHref("x")).toBe("/videos/x");
  });

  it("builds the page model: his words as written, the machine's facts as facts", () => {
    const v = buildVideoView(world, "v1-reading-the-ageing-table")!;
    expect(v).toMatchObject({
      slug: "v1-reading-the-ageing-table", title: "Reading the ageing table", learningObjective: "How to read who pays late.", youtubeId: VIDEO_ID,
      durationLabel: "1:02:05", uploadedOn: "2026-09-24", revisedOn: "2026-09-25", firstWrittenOn: "2026-09-25",
      revNo: 1, revCount: 1, holdsPosition: null, dataAsOf: null,
    });
    expect(v.chapters).toEqual([
      { s: 0, clock: "0:00", title: "Why receivables" },
      { s: 95, clock: "1:35", title: "Reading the ageing table" },
      { s: 3725, clock: "1:02:05", title: "What to ask next" },
    ]);
    expect(v.body.length).toBeGreaterThan(0);
  });

  it("reads chapters defensively: a damaged list is no chapters, never a half list", () => {
    for (const chapters of [undefined, "x", [{ s: 0 }], [{ s: -1, title: "a" }], [{ s: 0, title: "a" }, { s: 0, title: "b" }], [{ s: 0, title: "" }]]) {
      const s = withVideo(seed, { structured: { schema: "video/1", youtubeId: VIDEO_ID, chapters } });
      expect(buildVideoView(s, "v1-reading-the-ageing-table")!.chapters, JSON.stringify(chapters)).toEqual([]);
    }
  });

  it("a company video carries the position and figures-to date so the page can print its disclosure", () => {
    const s = withVideo(seed, { companyId: "c1", holdsPosition: "no", dataAsOf: "2026-08-22" });
    expect(buildVideoView(s, "v1-reading-the-ageing-table")).toMatchObject({ holdsPosition: "no", dataAsOf: "2026-08-22" });
  });
});

describe("the transcript lines", () => {
  it("are the segments exactly, with a clock for each start", () => {
    expect(transcriptLines(VIDEO_SEGMENTS)).toEqual([
      { s: 0, clock: "0:00", text: "Today we look at how receivables are reported." },
      { s: 30, clock: "0:30", text: "The ageing table is where the story starts." },
      { s: 3700, clock: "1:01:40", text: "So the question to carry away is who pays late." },
    ]);
  });
});

describe("what the machine adds", () => {
  it("holds no id, percent, rupee sign or rupee figure in anything it builds", () => {
    const v = buildVideoView(world, "v1-reading-the-ageing-table")!;
    const text = JSON.stringify([v.chapters, v.durationLabel, v.uploadedOn, listVideoSummaries(world), transcriptLines(VIDEO_SEGMENTS)]);
    expect(derivedProblems(text)).toEqual([]);
    expect(VIDEO_CHAPTERS).toHaveLength(3);
  });
});
