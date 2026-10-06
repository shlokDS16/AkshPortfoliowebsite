import { describe, expect, it } from "vitest";
import { sentenceHash } from "./hash";
import { normaliseSentence, splitSentences } from "./sentences";

describe("splitSentences", () => {
  it("splits on sentence ends and line breaks and drops blanks", () => {
    expect(splitSentences("One. Two? Three!\n\n## Heading\nFour")).toEqual(["One.", "Two?", "Three!", "## Heading", "Four"]);
  });

  it("keeps numbers with commas and decimals inside one sentence", () => {
    expect(splitSentences("TP 2,400 in 1.5 years. Next.")).toEqual(["TP 2,400 in 1.5 years.", "Next."]);
  });

  it("treats a single newline as a soft wrap", () => {
    expect(splitSentences("My target\nprice is 3000.\nNext one here.")).toEqual(["My target price is 3000.", "Next one here."]);
    expect(splitSentences("Windows\r\nline\r\nends.")).toEqual(["Windows line ends."]);
  });

  it("breaks blocks at blank lines", () => {
    expect(splitSentences("First para\nwraps\n\nSecond para")).toEqual(["First para wraps", "Second para"]);
  });

  it("starts a new block at list items, quotes and table rows, and keeps wrapped list items together", () => {
    expect(splitSentences("Intro\n- one\n- two wraps\nonto a line\n* three\n+ four\n1. five\n2) six\n> quoted\n| a | b |\nTail")).toEqual([
      "Intro",
      "- one",
      "- two wraps onto a line",
      "* three",
      "+ four",
      "1. five",
      "2) six",
      "> quoted",
      "| a | b |",
      "Tail",
    ]);
  });

  it("does not treat a leading minus sign or emphasis as a list marker", () => {
    expect(splitSentences("a fall of\n-5% in a day\n*sharp*")).toEqual(["a fall of -5% in a day *sharp*"]);
  });

  it("keeps a heading on its own line even without a blank line after it", () => {
    expect(splitSentences("Text\n### What would prove me wrong\nIf margins shrink.")).toEqual([
      "Text",
      "### What would prove me wrong",
      "If margins shrink.",
    ]);
  });
});

describe("sentenceHash", () => {
  it("is a 64-char hex digest of the normalised sentence", () => {
    expect(sentenceHash("Why I avoid target prices.")).toMatch(/^[0-9a-f]{64}$/);
    expect(sentenceHash("why i  avoid TARGET prices.")).toBe(sentenceHash("Why I avoid target prices."));
    expect(normaliseSentence("  A   B ")).toBe("a b");
  });

  it("survives re-wrapping", () => {
    const wrapped = splitSentences("Why I avoid\ntarget prices.")[0];
    expect(sentenceHash(wrapped)).toBe(sentenceHash("Why I avoid target prices."));
    expect(sentenceHash("Why I avoid\ntarget prices.")).toBe(sentenceHash("Why I avoid target prices."));
  });
});
