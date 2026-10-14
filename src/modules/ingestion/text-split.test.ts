import { describe, expect, it } from "vitest";
import { splitTextPages } from "./text-split";

const SIZE = 100;
const TAIL = 20;

describe("splitTextPages", () => {
  it("keeps short text as one page, trimmed", () => {
    expect(splitTextPages("  Revenue 1,284.00  \n", SIZE, TAIL)).toEqual(["Revenue 1,284.00"]);
  });

  it("returns no page for text that is only space", () => {
    expect(splitTextPages(" \n\t\n ", SIZE, TAIL)).toEqual([]);
  });

  it("cuts at a line break near the page size, never in the middle of a line when it can help it", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `Line number ${String(i + 1).padStart(2, "0")} with 1,${i}00.00`);
    const pages = splitTextPages(lines.join("\n"), SIZE, TAIL);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join("\n")).toBe(lines.join("\n"));
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(SIZE + TAIL);
    for (const page of pages) expect(lines.some((l) => page.startsWith(l))).toBe(true);
  });

  it("falls back to a space, then to a hard cut, for text with no line breaks", () => {
    const words = splitTextPages("word ".repeat(60).trim(), SIZE, TAIL);
    expect(words.every((p) => !p.startsWith("ord") && !p.endsWith("wor"))).toBe(true);
    const solid = splitTextPages("x".repeat(250), SIZE, TAIL);
    expect(solid.map((p) => p.length)).toEqual([100, 100, 50]);
  });

  it("folds a short last page into the one before it, so no page is a near-empty scan-sized stub", () => {
    const pages = splitTextPages("x".repeat(110), SIZE, TAIL);
    expect(pages).toHaveLength(1);
    expect(pages[0].length).toBe(111); // the stub is joined on a new line
    expect(splitTextPages("x".repeat(125), SIZE, TAIL).map((p) => p.length)).toEqual([100, 25]);
  });

  it("is deterministic, so a repeated step writes the same pages", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Row ${i} 1,${i}00.00 2,${i}00.00`).join("\n");
    expect(splitTextPages(text, SIZE, TAIL)).toEqual(splitTextPages(text, SIZE, TAIL));
  });

  it("reads Windows line endings and drops NUL", () => {
    expect(splitTextPages("a\r\nb\u0000c", SIZE, TAIL)).toEqual(["a\nbc"]);
  });

  it("a page is 8,000 characters with the real settings", () => {
    const pages = splitTextPages("Revenue from operations 1,284.00 1,102.00\n".repeat(600), 8000, 50);
    expect(pages.length).toBe(4);
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(8050);
  });
});
