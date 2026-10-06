import { describe, expect, it } from "vitest";
import { sentenceHash } from "./hash";
import { splitSentences } from "./sentences";

describe("splitSentences is abbreviation-aware", () => {
  it("does not end a sentence after a listed abbreviation", () => {
    expect(splitSentences("Tata Ltd. reported Rs. 2,400 crore. Sl. No. 1 lists. See approx. 5 items.")).toEqual([
      "Tata Ltd. reported Rs. 2,400 crore.",
      "Sl. No. 1 lists.",
      "See approx. 5 items.",
    ]);
  });

  it.each([
    "Priced at Rs. 2400 per share.",
    "Reported by Pvt. Ltd. firms.",
    "Acme Co. Ltd. and Beta Corp. Inc. merged.",
    "Mr. Rao, Mrs. Rao, Ms. Rao and Dr. Rao spoke.",
    "Opened on St. Mark's road in Sept. 2025.",
    "Results for Jan. 2026 and Dec. 2025 differ.",
    "Ratios vs. peers, viz. margins, e.g. EBITDA, i.e. profit, etc. all rose.",
    "Nos. 4 and 5 are open.",
  ])("keeps one sentence: %s", (text) => {
    expect(splitSentences(text)).toEqual([text]);
  });

  it("keeps single capital initials with the name", () => {
    expect(splitSentences("Written by S. K. Goenka. Next sentence.")).toEqual(["Written by S. K. Goenka.", "Next sentence."]);
  });

  it("never splits inside decimals", () => {
    expect(splitSentences("Rs. 2,400.50 per share at 2.5x book. Done.")).toEqual(["Rs. 2,400.50 per share at 2.5x book.", "Done."]);
  });

  it("still splits at an ordinary full stop, question mark and exclamation mark", () => {
    expect(splitSentences("It rose. Did it? Yes!")).toEqual(["It rose.", "Did it?", "Yes!"]);
  });

  it("returns a trailing abbreviation as its own sentence", () => {
    expect(splitSentences("Report by Acme Ltd.")).toEqual(["Report by Acme Ltd."]);
    expect(splitSentences("First sentence. Written by Acme Ltd.")).toEqual(["First sentence.", "Written by Acme Ltd."]);
  });

  it("changes the hash of a sentence that used to split at an abbreviation", () => {
    // Documented: before this change "Priced at Rs." and "2400 per share." were two sentences. No allowances
    // were stored yet, so nothing needs migrating.
    expect(sentenceHash("Priced at Rs. 2400 per share.")).not.toBe(sentenceHash("Priced at Rs."));
  });

  it("stays linear on a long run of initials and abbreviations", () => {
    const start = performance.now();
    const pieces = splitSentences("A. B. C. ".repeat(30_000) + "Done.");
    expect(pieces).toHaveLength(1);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
