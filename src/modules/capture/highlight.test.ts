import { describe, expect, it } from "vitest";
import { highlightCapture } from "./highlight";

const none = new Set<string>();
const known = { symbols: new Set(["KAVPUMP"]), themes: new Set(["capital-cycle"]), ignoredSymbols: none, ignoredThemes: none };

describe("highlightCapture (the parser's own spans)", () => {
  it("colours the prefix key, known and unknown symbols and themes, and links; colour never changes the text", () => {
    const raw = "t: $KAVPUMP dealers wait #capex and $NEWCO https://example.in/ar.pdf";
    const tokens = highlightCapture(raw, known);
    expect(tokens.map((t) => t.text).join("")).toBe(raw);
    expect(tokens.filter((t) => t.kind !== "plain")).toEqual([
      { text: "t:", kind: "key" },
      { text: "$KAVPUMP", kind: "company" },
      { text: "#capex", kind: "theme-new" },
      { text: "$NEWCO", kind: "company-new" },
      { text: "https://example.in/ar.pdf", kind: "url" },
    ]);
  });

  it("matches symbols case-insensitively, as parseCapture upper-cases them", () => {
    expect(highlightCapture("$kavpump", known)).toEqual([{ text: "$kavpump", kind: "company" }]);
    expect(highlightCapture("#Capital-Cycle", known)).toEqual([{ text: "#Capital-Cycle", kind: "theme" }]);
  });

  it("leaves plain text alone", () => {
    expect(highlightCapture("read the annual report", known)).toEqual([{ text: "read the annual report", kind: "plain" }]);
  });

  it("$500 and $5M stay plain: they are amounts, as parseCapture reads them", () => {
    expect(highlightCapture("paid $500 for $5M", known)).toEqual([{ text: "paid $500 for $5M", kind: "plain" }]);
  });

  it("a #frag inside a URL is part of the URL, not a theme", () => {
    const tokens = highlightCapture("see https://x.in/a#frag now", known);
    expect(tokens.filter((t) => t.kind !== "plain")).toEqual([{ text: "https://x.in/a#frag", kind: "url" }]);
  });

  it("an ignored $AND is plain", () => {
    const ignored = { ...known, ignoredSymbols: new Set(["AND"]) };
    const tokens = highlightCapture("$AND $KAVPUMP", ignored);
    expect(tokens.find((t) => t.text === "$AND")?.kind).toBe("plain");
    expect(tokens.filter((t) => t.kind !== "plain")).toEqual([{ text: "$KAVPUMP", kind: "company" }]);
  });

  it("a prefix after leading whitespace keeps the span on the key itself", () => {
    expect(highlightCapture("  l: margins", known)[1]).toEqual({ text: "l:", kind: "key" });
  });
});
