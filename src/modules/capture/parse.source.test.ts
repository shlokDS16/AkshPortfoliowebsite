import { describe, expect, it } from "vitest";
import { CAPTURE_KINDS, captureSpans, parseCapture } from "./parse";

const URL = "https://example.com/post/1";

describe("the s: prefix saves a source (Phase 5d)", () => {
  it("reads s: as the kind source, in either case, and keeps the link", () => {
    for (const raw of [`s: ${URL}`, `S: ${URL}`, `  s:${URL}`]) {
      const parsed = parseCapture(raw);
      expect(parsed.kind, raw).toBe("source");
      expect(parsed.urls).toEqual([URL]);
    }
  });

  it("still reads companies, concepts and his own words around the link", () => {
    const parsed = parseCapture(`s: ${URL} $TCS #moats why the bull case is thin`);
    expect(parsed).toMatchObject({ kind: "source", symbols: ["TCS"], themes: ["moats"], body: `${URL} $TCS #moats why the bull case is thin` });
  });

  it("marks the prefix span so the capture box colours it like the others", () => {
    expect(captureSpans(`s: ${URL}`)[0]).toMatchObject({ kind: "prefix", value: "s", start: 0, end: 2 });
  });

  it("does not read an s: that is not at the start, and leaves the other prefixes as they were", () => {
    expect(parseCapture(`ps: ${URL}`).kind).toBe("note");
    expect(parseCapture(`note s: ${URL}`).kind).toBe("note");
    expect(parseCapture("t: x").kind).toBe("thesis");
    expect(parseCapture("v: x").kind).toBe("video");
  });

  it("lists source among the kinds", () => {
    expect(CAPTURE_KINDS).toContain("source");
  });
});
