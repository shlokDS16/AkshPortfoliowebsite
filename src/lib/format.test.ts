import { describe, expect, it } from "vitest";
import { clipWithEllipsis, formatCount, formatDate, formatFileNo, formatNumber, formatTime, positionText, positionWord, withheldText } from "./format";

describe("format", () => {
  it("writes dates as '2 Sep 2026' and reads timestamps in IST", () => {
    expect(formatDate("2026-09-02")).toBe("2 Sep 2026");
    expect(formatDate("2026-10-04T19:00:00Z")).toBe("5 Oct 2026");
    expect(formatTime("2026-10-04T08:35:00Z")).toBe("14:05");
  });

  it("groups numbers the Indian way with a true minus sign", () => {
    expect(formatNumber(1284)).toBe("1,284");
    expect(formatNumber(128400)).toBe("1,28,400");
    expect(formatNumber(-4.2)).toBe("−4.2");
    expect(formatNumber(31.44)).toBe("31.4");
    expect(formatNumber(31.44, 0)).toBe("31");
  });

  it("pads file numbers and counts nouns", () => {
    expect(formatFileNo(3)).toBe("03");
    expect(formatFileNo(12)).toBe("12");
    expect(formatCount(1, "test")).toBe("1 test");
    expect(formatCount(3, "test")).toBe("3 tests");
  });

  it("words the position for the strip and the disclosure (design-dna 13.2)", () => {
    expect(positionText("yes")).toBe("Aksh holds a position");
    expect(positionText("no")).toBe("Aksh holds no position");
    expect(positionText("not_disclosed")).toBe("Position not disclosed");
    expect(positionText(null)).toBe("Position not disclosed");
    expect(positionWord("not_disclosed")).toBe("Not disclosed");
    expect(withheldText("2026-11-12")).toBe("[withheld until 12 Nov 2026]");
  });
});

describe("clipWithEllipsis", () => {
  it("leaves short text alone and cuts long text with an ellipsis", () => {
    expect(clipWithEllipsis("short", 10)).toBe("short");
    expect(clipWithEllipsis("abcdefghij", 10)).toBe("abcdefghij");
    expect(clipWithEllipsis("abcdefghijk", 10)).toBe("abcdefghij…");
  });

  it("counts code points, so a surrogate pair is never split", () => {
    expect(clipWithEllipsis("😀".repeat(5), 3)).toBe("😀😀😀…");
  });
});
