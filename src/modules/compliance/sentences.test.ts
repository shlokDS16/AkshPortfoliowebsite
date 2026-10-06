import { describe, expect, it } from "vitest";
import { normaliseSentence, sentenceHash, splitSentences } from "./sentences";

describe("splitSentences", () => {
  it("splits on sentence ends and line breaks and drops blanks", () => {
    expect(splitSentences("One. Two? Three!\n\n## Heading\nFour")).toEqual(["One.", "Two?", "Three!", "## Heading", "Four"]);
  });

  it("keeps numbers with commas and decimals inside one sentence", () => {
    expect(splitSentences("TP 2,400 in 1.5 years. Next.")).toEqual(["TP 2,400 in 1.5 years.", "Next."]);
  });
});

describe("sentenceHash", () => {
  it("is a 64-char hex digest of the normalised sentence", () => {
    expect(sentenceHash("Why I avoid target prices.")).toMatch(/^[0-9a-f]{64}$/);
    expect(sentenceHash("why i  avoid TARGET prices.")).toBe(sentenceHash("Why I avoid target prices."));
    expect(normaliseSentence("  A   B ")).toBe("a b");
  });
});
