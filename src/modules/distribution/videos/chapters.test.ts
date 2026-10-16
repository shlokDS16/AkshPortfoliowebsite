import { describe, expect, it } from "vitest";
import { parseChapters } from "./chapters";

const NEED_THREE = "YouTube chapters need at least 3 lines that start with a time.";

describe("parseChapters", () => {
  it("reads YouTube's chapter lines, ignoring the prose around them", () => {
    const description = ["How I read an annual report.", "", "0:00 Intro", "1:05 The balance sheet", "12:30 What would prove me wrong", "", "Not advice."].join("\n");
    expect(parseChapters(description)).toEqual({
      chapters: [
        { s: 0, title: "Intro" },
        { s: 65, title: "The balance sheet" },
        { s: 750, title: "What would prove me wrong" },
      ],
      reason: null,
    });
  });

  it("reads hours, zero-padded times and CRLF, and keeps each title exactly as typed", () => {
    const out = parseChapters("00:00 start - here\r\n05:00  Two  spaces inside\r\n1:00:00 One hour\r\n");
    expect(out.reason).toBeNull();
    expect(out.chapters).toEqual([
      { s: 0, title: "start - here" },
      { s: 300, title: "Two  spaces inside" },
      { s: 3600, title: "One hour" },
    ]);
  });

  it("refuses two entries", () => {
    const out = parseChapters("0:00 One\n1:00 Two\n");
    expect(out.chapters).toEqual([]);
    expect(out.reason).toBe(NEED_THREE);
  });

  it("refuses a list that does not start at 0:00", () => {
    const out = parseChapters("0:05 One\n1:00 Two\n2:00 Three\n");
    expect(out.chapters).toEqual([]);
    expect(out.reason).toBe("The first chapter must start at 0:00.");
  });

  it("refuses times that do not rise", () => {
    expect(parseChapters("0:00 One\n2:00 Two\n1:00 Three\n").reason).toBe("Chapter times must rise.");
    expect(parseChapters("0:00 One\n1:00 Two\n1:00 Three\n").reason).toBe("Chapter times must rise.");
  });

  it("refuses a title over 100 characters instead of cutting it", () => {
    const out = parseChapters(`0:00 One\n1:00 Two\n2:00 ${"x".repeat(101)}\n`);
    expect(out.chapters).toEqual([]);
    expect(out.reason).toBe("A chapter title is longer than 100 characters.");
  });

  it("refuses more than 100 chapters", () => {
    const lines = Array.from({ length: 101 }, (_, i) => `${Math.floor(i / 60)}:${String(i % 60).padStart(2, "0")} Part ${i}`);
    expect(parseChapters(lines.join("\n")).reason).toBe("A video can have at most 100 chapters.");
  });

  it("does not read a time inside a sentence, or an impossible time, as a chapter", () => {
    expect(parseChapters("Recorded at 10:00 today\nAt 0:00 nothing\n").reason).toBe(NEED_THREE);
    expect(parseChapters("0:00 One\n1:75 Two\n2:00 Three\n3:00 Four\n").chapters.map((c) => c.title)).toEqual(["One", "Three", "Four"]);
  });

  it("says plainly when the description has none", () => {
    expect(parseChapters("").reason).toBe(NEED_THREE);
  });
});
