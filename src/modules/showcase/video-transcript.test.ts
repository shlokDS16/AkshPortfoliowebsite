import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { transcriptMatches } from "./video-transcript";

const segments = [{ s: 0, t: "Hello world." }, { s: 30, t: "Second line here" }];
// sha256 of the segment texts joined by a newline, no trailing newline: the value migration 0022's trigger computes.
const sha = createHash("sha256").update("Hello world.\nSecond line here", "utf8").digest("hex");

describe("transcriptMatches", () => {
  it("is true only when the stored text hashes to the sha the current revision names", () => {
    expect(sha).toBe("54cf37a1" + sha.slice(8));
    expect(transcriptMatches(segments, sha)).toBe(true);
  });

  it("is false for another text, a changed segment, a missing or malformed sha", () => {
    expect(transcriptMatches([{ s: 0, t: "Hello world." }], sha)).toBe(false);
    expect(transcriptMatches([{ s: 0, t: "Hello world!" }, { s: 30, t: "Second line here" }], sha)).toBe(false);
    expect(transcriptMatches(segments, undefined)).toBe(false);
    expect(transcriptMatches(segments, sha.toUpperCase())).toBe(false);
    expect(transcriptMatches(segments, "abc")).toBe(false);
  });

  it("hashes the UTF-8 bytes, so accents count", () => {
    const accented = [{ s: 0, t: "é" }, { s: 1, t: "b" }];
    expect(transcriptMatches(accented, createHash("sha256").update("é\nb", "utf8").digest("hex"))).toBe(true);
  });
});
