import { describe, expect, it } from "vitest";
import { parseCapture } from "./parse";

describe("parseCapture: grammar table (spec s5)", () => {
  it.each([
    ["$RELIANCE capex cycle", { kind: "note", symbols: ["RELIANCE"] }],
    ["$reliance capex cycle", { kind: "note", symbols: ["RELIANCE"] }],
    ["#capital-cycle late stage", { kind: "note", themes: ["capital-cycle"] }],
    ["t: $TCS deal wins slowing", { kind: "thesis", symbols: ["TCS"] }],
    ["T: upper-case prefix", { kind: "thesis" }],
    ["l: what a capex cycle looks like", { kind: "learning" }],
    ["p: my checklist before reading an annual report", { kind: "process" }],
    ["see https://example.com/ar-2026.pdf.", { kind: "note", urls: ["https://example.com/ar-2026.pdf"] }],
    ["Margins expanding at the cement majors", { kind: "note", symbols: [], themes: [], urls: [] }],
  ])("%j", (raw, expected) => {
    expect(parseCapture(raw)).toMatchObject(expected);
  });
});

describe("parseCapture: edge cases", () => {
  it("strips the prefix from the body and uses the first line as title and change reason", () => {
    const parsed = parseCapture("t: $TCS deal wins slowing\nmore detail here");
    expect(parsed.body).toBe("$TCS deal wins slowing\nmore detail here");
    expect(parsed.firstLine).toBe("$TCS deal wins slowing");
    expect(parsed.title).toBe("$TCS deal wins slowing");
  });

  it("only treats a prefix at the very start as a kind", () => {
    expect(parseCapture("note t: not a thesis").kind).toBe("note");
    expect(parseCapture("tl: not a prefix").kind).toBe("note");
  });

  it("ignores dollar amounts, Markdown headings and URL fragments", () => {
    const parsed = parseCapture("# Heading with $5 move https://x.com/page#frag");
    expect(parsed.symbols).toEqual([]);
    expect(parsed.themes).toEqual([]);
  });

  it("keeps NSE symbols with & and - and de-duplicates in order", () => {
    expect(parseCapture("$M&M and $BAJAJ-AUTO, then $m&m again.").symbols).toEqual(["M&M", "BAJAJ-AUTO"]);
  });

  it("drops trailing punctuation from symbols", () => {
    expect(parseCapture("Watching $INFY.").symbols).toEqual(["INFY"]);
  });

  it("titles an empty capture and caps long titles", () => {
    expect(parseCapture("   ").title).toBe("Untitled capture");
    expect(parseCapture("x".repeat(300)).title.length).toBeLessThanOrEqual(120);
  });
});

describe("parseCapture: robustness", () => {
  it("returns an empty note for empty or whitespace-only input", () => {
    for (const raw of ["", "   ", "\n\t \n"]) {
      expect(parseCapture(raw)).toEqual({
        kind: "note",
        symbols: [],
        themes: [],
        urls: [],
        title: "Untitled capture",
        firstLine: "",
        body: "",
      });
    }
  });

  it("returns an empty body for a bare prefix", () => {
    expect(parseCapture("t:")).toMatchObject({ kind: "thesis", body: "", title: "Untitled capture" });
  });

  it("trims the input and keeps tokens in the body", () => {
    const parsed = parseCapture("   $TCS  looks cheap  \n  ");
    expect(parsed.body).toBe("$TCS  looks cheap");
    expect(parsed.firstLine).toBe("$TCS  looks cheap");
  });

  it("does not treat a dollar followed by digits as a symbol", () => {
    expect(parseCapture("$500 move, $5M deal, $1").symbols).toEqual([]);
  });

  it("rejects symbols longer than 20 characters instead of truncating", () => {
    expect(parseCapture("$ABCDEFGHIJKLMNOPQRSTUVWXYZ").symbols).toEqual([]);
    expect(parseCapture("$ABCDEFGHIJKLMNOPQRST").symbols).toEqual(["ABCDEFGHIJKLMNOPQRST"]);
  });

  it("rejects themes longer than 48 characters instead of truncating", () => {
    expect(parseCapture(`#a${"b".repeat(60)}`).themes).toEqual([]);
    expect(parseCapture(`#a${"b".repeat(47)}`).themes).toHaveLength(1);
  });

  it.each([".", ",", ")", ";", ":", "!", "?"])("drops trailing %s from symbols, themes and urls", (p) => {
    const parsed = parseCapture(`$TCS${p} #moat${p} https://a.com/x${p}`);
    expect(parsed.symbols).toEqual(["TCS"]);
    expect(parsed.themes).toEqual(["moat"]);
    expect(parsed.urls).toEqual(["https://a.com/x"]);
  });

  it("drops a trailing hyphen from symbols and themes", () => {
    expect(parseCapture("$TCS- #moat-").symbols).toEqual(["TCS"]);
    expect(parseCapture("$TCS- #moat-").themes).toEqual(["moat"]);
  });

  it("lower-cases and de-duplicates themes in first-seen order", () => {
    expect(parseCapture("#Moat #capital-cycle #MOAT").themes).toEqual(["moat", "capital-cycle"]);
  });

  it("requires a theme to start with a letter", () => {
    expect(parseCapture("#1 #2026-plan #-x").themes).toEqual([]);
  });

  it("does not read a URL fragment as a theme, even without whitespace before it", () => {
    const parsed = parseCapture("https://x.com/page#frag and https://y.com/#top");
    expect(parsed.themes).toEqual([]);
    expect(parsed.urls).toEqual(["https://x.com/page#frag", "https://y.com/#top"]);
  });

  it("collects unique urls in order", () => {
    const parsed = parseCapture("http://a.com https://b.com/x http://a.com");
    expect(parsed.urls).toEqual(["http://a.com", "https://b.com/x"]);
  });

  it("finds tokens on later lines and after a prefix", () => {
    const parsed = parseCapture("l: first line\n$HDFCBANK on line two\n#banks");
    expect(parsed.kind).toBe("learning");
    expect(parsed.symbols).toEqual(["HDFCBANK"]);
    expect(parsed.themes).toEqual(["banks"]);
  });

  it("handles CRLF line endings in the first line", () => {
    const parsed = parseCapture("t: $TCS slowing\r\nmore");
    expect(parsed.firstLine).toBe("$TCS slowing");
    expect(parsed.title).toBe("$TCS slowing");
  });

  it("removes URLs from the title and falls back when nothing is left", () => {
    expect(parseCapture("read https://a.com/x today").title).toBe("read today");
    expect(parseCapture("https://a.com/x").title).toBe("Untitled capture");
  });

  it("caps the title at 120 characters including the ellipsis", () => {
    const title = parseCapture("word ".repeat(100)).title;
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith("...")).toBe(true);
  });

  it("does not choke on non-ASCII text next to tokens", () => {
    const rupee = String.fromCharCode(0x20b9);
    const parsed = parseCapture(`${rupee}500 target for $TCS${rupee} and #moat${rupee}`);
    expect(parsed.symbols).toEqual(["TCS"]);
    expect(parsed.themes).toEqual(["moat"]);
  });

  it("parses 10,000 characters well under 50 ms", () => {
    const chunk = "$TCS #moat see https://a.com/x $5 words words ";
    const raw = chunk.repeat(Math.ceil(10_000 / chunk.length)).slice(0, 10_000);
    const start = performance.now();
    parseCapture(raw);
    expect(performance.now() - start).toBeLessThan(50);
    const worst = performance.now();
    parseCapture(`$${"A".repeat(9_998)}`);
    parseCapture(" ".repeat(10_000));
    expect(performance.now() - worst).toBeLessThan(50);
  });
});
