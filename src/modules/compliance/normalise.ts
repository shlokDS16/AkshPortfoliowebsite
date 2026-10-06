// Pre-pass for the lexicon match. The lint matches against these folded views of a sentence, but always
// reports the sentence exactly as Aksh typed it (see lint.ts). Folding only ever helps a pattern match;
// false positives are the safe direction (ADR-001 s5).
import { KEYWORDS } from "./lexicon";

// Zero-width, soft hyphen, bidi controls, invisible operators and the BOM.
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

// Cyrillic and Greek letters that read as Latin letters, mapped to the Latin letter they imitate.
const CONFUSABLES: Record<string, string> = {
  // Cyrillic lower
  "\u0430": "a", "\u0435": "e", "\u043E": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x",
  "\u043A": "k", "\u043C": "m", "\u0442": "t", "\u043D": "h", "\u0432": "b", "\u0456": "i", "\u0458": "j", "\u0455": "s",
  // Cyrillic upper
  "\u0410": "A", "\u0415": "E", "\u041E": "O", "\u0420": "P", "\u0421": "C", "\u0423": "Y", "\u0425": "X",
  "\u041A": "K", "\u041C": "M", "\u0422": "T", "\u041D": "H", "\u0412": "B", "\u0406": "I", "\u0408": "J", "\u0405": "S",
  // Greek lower
  "\u03BF": "o", "\u03B1": "a", "\u03B5": "e", "\u03C1": "p", "\u03C4": "t", "\u03C5": "u", "\u03BA": "k", "\u03BD": "v",
  // Greek upper
  "\u039F": "O", "\u0391": "A", "\u0395": "E", "\u03A1": "P", "\u03A4": "T", "\u03A5": "Y", "\u039A": "K", "\u039D": "N",
  "\u0392": "B", "\u0397": "H", "\u0399": "I", "\u039C": "M", "\u03A7": "X", "\u0396": "Z",
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "g");

// A run of 3 to 12 single letters separated by spaces or dots: "B U Y", "s.e.l.l", "I B U Y".
const LETTER_RUN = /(?<![A-Za-z0-9])[A-Za-z](?:[ .][A-Za-z]){2,11}(?![A-Za-z0-9])/g;
const INTRA_WORD_SPLIT = /[A-Za-z0-9][-_\u2010-\u2015\u2212][A-Za-z0-9]/;
const SPLIT_CHARS = /[-_\u2010-\u2015\u2212]+/;

/** NFKC, invisible characters removed (or turned into a space), confusables mapped to Latin, whitespace collapsed. */
export function foldText(text: string, invisibleAs: "" | " " = ""): string {
  return text
    .normalize("NFKC")
    .replace(INVISIBLE, invisibleAs)
    .replace(CONFUSABLE_RE, (ch) => CONFUSABLES[ch] ?? ch)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keeps each letter-spaced run and appends every contiguous joined piece of 3+ letters, so "I B U Y" also
 * offers "IBU", "BUY" and "IBUY" to the matcher.
 */
export function joinLetterRuns(text: string): string {
  return text.replace(LETTER_RUN, (run) => {
    const letters = run.replace(/[ .]/g, "");
    const pieces: string[] = [];
    for (let len = 3; len <= letters.length; len++) {
      for (let start = 0; start + len <= letters.length; start++) pieces.push(letters.slice(start, start + len));
    }
    return `${run} ${pieces.join(" ")}`;
  });
}

// A keyword spans at most this many letters, and so at most this many letter-bearing segments. Capping the
// window keeps the join linear in the token length (a pasted row of ISO dates is one huge token).
const MAX_WINDOW = Math.max(...[...KEYWORDS].map((word) => word.length));

function mergeToken(token: string): string {
  const segments = token.split(SPLIT_CHARS).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < segments.length; ) {
    let end = i + 1;
    let letters = "";
    const limit = Math.min(segments.length, i + MAX_WINDOW);
    for (let j = i; j < limit; j++) {
      letters += segments[j].replace(/[^A-Za-z]/g, "").toLowerCase();
      if (letters.length > MAX_WINDOW) break;
      if (j > i && KEYWORDS.has(letters)) end = j + 1; // keep the longest match
    }
    out.push(segments.slice(i, end).join(""));
    i = end;
  }
  return out.join(" ");
}

/** "tar-get" becomes "target", "target-price" becomes "target price", "buy_now" becomes "buy now". */
export function joinHyphenSplits(text: string): string {
  return text
    .split(" ")
    .map((token) => (INTRA_WORD_SPLIT.test(token) ? mergeToken(token) : token))
    .join(" ");
}

/** The full pre-pass. Hyphen joins run first so "B U-Y" and "a-d-d on dips" are both seen as plain words. */
export function normalise(text: string, invisibleAs: "" | " " = ""): string {
  return joinLetterRuns(joinHyphenSplits(foldText(text, invisibleAs)));
}

/**
 * The strings a pattern is tried against. Two views, because a zero-width character can sit inside a
 * word ("bu<ZWSP>y") or stand in for the space between two words ("buy<ZWSP>now").
 */
export function matchViews(text: string): string[] {
  return [...new Set([normalise(text, ""), normalise(text, " ")])];
}
