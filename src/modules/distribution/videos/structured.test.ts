import { describe, expect, it } from "vitest";
import { initialVideoStructured, nextVideoStructured, transcriptText, VIDEO_SCHEMA } from "./structured";

const ID = "dQw4w9WgXcQ";
const TR = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SHA = "ab".repeat(32);

describe("a video revision's structured record (schema video/1)", () => {
  it("starts with the schema, the YouTube id and an empty chapters array, so the gate's 12.4 check has a list to read", () => {
    expect(initialVideoStructured(ID)).toEqual({ schema: VIDEO_SCHEMA, youtubeId: ID, chapters: [] });
    expect(VIDEO_SCHEMA).toBe("video/1");
  });

  it("adds a transcript by id and hash, and carries the chapters", () => {
    const prev = { schema: "video/1", youtubeId: ID, chapters: [{ s: 0, title: "A" }, { s: 5, title: "B" }, { s: 9, title: "C" }] };
    expect(nextVideoStructured(prev, ID, { transcript: { id: TR, sha: SHA } })).toEqual({ ...prev, transcriptId: TR, transcriptSha: SHA });
  });

  it("sets chapters and keeps the transcript it already had", () => {
    const prev = { schema: "video/1", youtubeId: ID, transcriptId: TR, transcriptSha: SHA, chapters: [] };
    const chapters = [{ s: 0, title: "A" }, { s: 5, title: "B" }, { s: 9, title: "C" }];
    expect(nextVideoStructured(prev, ID, { chapters })).toEqual({ ...prev, chapters });
  });

  it("always writes a chapters array, even from an empty or damaged previous record", () => {
    for (const prev of [{}, { chapters: "none" }, { chapters: null }, { chapters: [{ s: "x", title: 3 }, "junk"] }]) {
      const out = nextVideoStructured(prev, ID, {});
      expect(Array.isArray(out.chapters)).toBe(true);
      expect(out.chapters).toEqual([]);
      expect(out.schema).toBe("video/1");
      expect(out.youtubeId).toBe(ID);
    }
  });

  it("writes nothing but the schema's own keys: no machine title, description or stray field", () => {
    const prev = { schema: "video/1", youtubeId: ID, ytTitle: "from YouTube", extra: { a: 1 }, chapters: [] };
    expect(Object.keys(nextVideoStructured(prev, ID, {})).sort()).toEqual(["chapters", "schema", "youtubeId"]);
  });

  it("keeps a chapter exactly as {s, title}", () => {
    const prev = { chapters: [{ s: 0, title: "  Spaced  ", extra: 1 }] };
    expect(nextVideoStructured(prev, ID, {}).chapters).toEqual([{ s: 0, title: "  Spaced  " }]);
  });
});

describe("transcriptText", () => {
  it("joins the segment texts with a newline and no trailing newline: the text the database hash is taken over", () => {
    expect(transcriptText([{ s: 0, t: "Hello world." }, { s: 31, t: "Second line here" }])).toBe("Hello world.\nSecond line here");
  });
});

describe("chaptersOf", () => {
  it("reads the entries that are a whole second and a title, and nothing from a record without a list", async () => {
    const { chaptersOf } = await import("./structured");
    expect(chaptersOf([{ s: 0, title: "One" }, { s: "x", title: "Bad" }, { s: 5 }, { s: 60, title: "Two" }])).toEqual([{ s: 0, title: "One" }, { s: 60, title: "Two" }]);
    expect(chaptersOf(undefined)).toEqual([]);
    expect(chaptersOf("x")).toEqual([]);
  });
});
