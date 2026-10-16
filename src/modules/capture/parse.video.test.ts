import { describe, expect, it } from "vitest";
import { captureSpans, parseCapture } from "./parse";

const URL = "https://youtu.be/dQw4w9WgXcQ";

describe("the v: prefix files a video (Phase 5b)", () => {
  it("reads v: as the kind video, in either case, and keeps the link", () => {
    for (const raw of [`v: ${URL}`, `V: ${URL}`, `  v:${URL}`]) {
      const parsed = parseCapture(raw);
      expect(parsed.kind, raw).toBe("video");
      expect(parsed.urls).toEqual([URL]);
    }
  });

  it("still reads companies, concepts and his own words around the link", () => {
    const parsed = parseCapture(`v: ${URL} how I read a filing $TCS #moats`);
    expect(parsed.kind).toBe("video");
    expect(parsed.symbols).toEqual(["TCS"]);
    expect(parsed.themes).toEqual(["moats"]);
    expect(parsed.body).toBe(`${URL} how I read a filing $TCS #moats`);
  });

  it("marks the prefix span so the capture box colours it like the others", () => {
    expect(captureSpans(`v: ${URL}`)[0]).toMatchObject({ kind: "prefix", value: "v", start: 0, end: 2 });
  });

  it("does not read a v: that is not at the start, or the other four prefixes differently", () => {
    expect(parseCapture(`dev: ${URL}`).kind).toBe("note");
    expect(parseCapture(`note v: ${URL}`).kind).toBe("note");
    expect(parseCapture("t: thesis text").kind).toBe("thesis");
    expect(parseCapture("l: lesson").kind).toBe("learning");
    expect(parseCapture("p: step").kind).toBe("process");
    expect(parseCapture("r: a book").kind).toBe("reading_note");
  });
});
