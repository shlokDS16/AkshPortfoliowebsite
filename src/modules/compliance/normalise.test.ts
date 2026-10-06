import { describe, expect, it } from "vitest";
import { foldText, joinHyphenSplits, joinLetterRuns, matchViews, normalise } from "./normalise";

describe("foldText", () => {
  it("applies NFKC (full-width and ligature forms)", () => {
    expect(foldText("\uFF42\uFF55\uFF59 \uFB01x")).toBe("buy fix");
  });

  it("strips zero-width characters, the soft hyphen, the BOM and bidi marks", () => {
    expect(foldText("b\u200Bu\u200Cy\u200D \u2060s\u00ADell\uFEFF\u200E")).toBe("buy sell");
  });

  it("can turn invisible characters into spaces instead", () => {
    expect(foldText("buy\u200Bnow", " ")).toBe("buy now");
  });

  it("maps a Cyrillic word that imitates a lexicon word back to Latin", () => {
    // Cyrillic s, e (Latin l, l): "sell"
    expect(foldText("\u0455\u0435ll")).toBe("sell");
    // Cyrillic a, c, e in "accumulate"
    expect(foldText("\u0430\u0441\u0441umul\u0430t\u0435")).toBe("accumulate");
  });

  it("folds each documented confusable", () => {
    const pairs: Record<string, string> = {
      "\u0430": "a", "\u0435": "e", "\u043E": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x",
      "\u043A": "k", "\u043C": "m", "\u0442": "t", "\u043D": "h", "\u0432": "b", "\u0456": "i", "\u0458": "j", "\u0455": "s",
      "\u03BF": "o", "\u03B1": "a", "\u03B5": "e", "\u03C1": "p", "\u03C4": "t", "\u03C5": "u", "\u03BA": "k", "\u03BD": "v",
    };
    for (const [from, to] of Object.entries(pairs)) {
      expect(foldText(from)).toBe(to);
      // Greek capitals upsilon and nu look like Y and N, not like their lower-case Latin partners u and v.
      const upper = from === "\u03C5" ? "Y" : from === "\u03BD" ? "N" : to.toUpperCase();
      expect(foldText(from.toUpperCase())).toBe(upper);
    }
  });

  it("collapses every whitespace kind to one space", () => {
    expect(foldText("  add\u00A0\u00A0on\u202Fdips\t now\n here ")).toBe("add on dips now here");
  });
});

describe("joinLetterRuns", () => {
  it("offers the joined word for letter-spaced and dotted runs", () => {
    expect(joinLetterRuns("B U Y now")).toContain("BUY");
    expect(joinLetterRuns("s.e.l.l it")).toContain("sell");
  });

  it("offers every joined piece so a stray leading letter cannot hide the word", () => {
    expect(joinLetterRuns("I B U Y")).toEqual("I B U Y IBU BUY IBUY");
  });

  it("leaves runs of fewer than three letters and ordinary words alone", () => {
    expect(joinLetterRuns("T P is a note")).toBe("T P is a note");
    expect(joinLetterRuns("Plan A or B")).toBe("Plan A or B");
  });
});

describe("joinHyphenSplits", () => {
  it.each([
    ["tar-get", "target"],
    ["target-price", "target price"],
    ["tar-get-price", "target price"],
    ["buy_now", "buy now"],
    ["stop-loss", "stoploss"],
    ["s-e-l-l", "sell"],
    ["book-profit", "book profit"],
    ["tar\u2010get", "target"],
  ])("%s -> %s", (input, expected) => {
    expect(joinHyphenSplits(input)).toBe(expected);
  });

  it("leaves tokens without an intra-word split untouched", () => {
    expect(joinHyphenSplits("a - b and -- ok")).toBe("a - b and -- ok");
  });
});

describe("matchViews", () => {
  it("returns one view when the text has no invisible characters", () => {
    expect(matchViews("plain text")).toEqual(["plain text"]);
  });

  it("returns a stripped and a spaced view when an invisible character is present", () => {
    expect(matchViews("buy\u200Bnow")).toEqual(["buynow", "buy now"]);
  });

  it("runs the whole pipeline", () => {
    expect(normalise("T\u0430r-get\u00A0pr\u0456ce")).toBe("Target price");
  });
});
