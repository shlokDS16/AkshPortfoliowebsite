// Publishing rules 1 and 2. Case-insensitive, word-boundary, matched against the folded views from
// normalise.ts (so patterns assume single spaces, Latin letters and no invisible characters). False
// positives are the safe direction (ADR-001 s5); Aksh clears educational uses of rule 1 phrases with a
// sentence allowance. Rule 2 phrases can never be allowanced.
//
// Deliberately NOT listed: bare "buying", "bought", "sold", "selling" and bare "TP"/"SL" tokens. They
// appear in factual sentences ("the company sold 2 million pumps", "SL Rao, the CFO"); the actionable
// forms are caught by the phrases and TP/SL level forms below. Compounds that are corporate-finance
// vocabulary (buy-back, sell-side, sell-off, exit multiple, exit run-rate) have narrow lookaheads.
export type TextRule = "1" | "2";
export type LexiconEntry = { id: string; rule: TextRule; pattern: RegExp; message: string };

const ACTIONABLE = "Reads as a recommendation to act. Write what you expected and why instead.";
const PERFORMANCE = "Reads as a performance claim. Public pages may not show track records.";

const RUPEE = String.fromCharCode(0x20b9);
const CURRENCY_SIGN = `[${RUPEE}$]`;
const CURRENCY_WORD = "\\b(?:rs|inr|usd)\\b\\.?";
// A magnitude, or a unit that makes the number a company operating target rather than a price target.
const UNIT_AFTER = "%|per ?cent|crores?|cr\\b|lakhs?|mn\\b|millions?|bn\\b|billions?|subscribers|units|customers|stores|tonnes|mw\\b";
const NUMBER = `\\d[\\d,]*(?:\\.\\d+)?(?!\\d|,\\d|\\.\\d)(?!\\s*(?:${UNIT_AFTER}))`;
const PCT = "(?:%|per ?cent)";

export const LEXICON: readonly LexiconEntry[] = [
  { id: "buy", rule: "1", pattern: /\bbuy\b(?!\s+(?:back|side)\b)/i, message: ACTIONABLE },
  { id: "sell", rule: "1", pattern: /\bsell\b(?!\s+(?:off|side)\b)/i, message: ACTIONABLE },
  { id: "accumulate", rule: "1", pattern: /\baccumulate\b/i, message: ACTIONABLE },
  { id: "add-on-dips", rule: "1", pattern: /\badd on dips\b/i, message: ACTIONABLE },
  { id: "exit", rule: "1", pattern: /\bexit\b(?!\s+(?:multiples?|run ?rates?|rates?)\b)/i, message: ACTIONABLE },
  { id: "book-profit", rule: "1", pattern: /\bbook(?:s|ed|ing)?\s+profits?\b/i, message: ACTIONABLE },
  { id: "target-price", rule: "1", pattern: /\btarget prices?\b/i, message: ACTIONABLE },
  { id: "price-target", rule: "1", pattern: /\bprice targets?\b/i, message: ACTIONABLE },
  {
    id: "target-of",
    rule: "1",
    pattern: new RegExp(`\\btargets?\\s+(?:price\\s+)?of\\s+(?:(?:${CURRENCY_SIGN}|${CURRENCY_WORD})\\s*(?:${NUMBER}|$)|${NUMBER})`, "i"),
    message: ACTIONABLE,
  },
  { id: "stop-loss", rule: "1", pattern: /\bstop[- ]?loss(?:es)?\b/i, message: ACTIONABLE },
  // TP/SL level forms only: a separator or 3+ glued digits, so "Exhibit TP1/SL2" and "SL Rao" pass.
  { id: "tp-level", rule: "1", pattern: /\btp(?:\s*[:=]\s*|\s+)\d|\btp\d{3,}/i, message: ACTIONABLE },
  { id: "sl-level", rule: "1", pattern: /\bsl(?:\s*[:=]\s*|\s+)\d|\bsl\d{3,}/i, message: ACTIONABLE },
  { id: "buying-opportunity", rule: "1", pattern: /\bbuying opportunit(?:y|ies)\b/i, message: ACTIONABLE },
  { id: "time-to", rule: "1", pattern: /\btime to (?:buy|sell|exit|accumulate)\b/i, message: ACTIONABLE },
  { id: "upside-of", rule: "1", pattern: /\bupside of\b/i, message: ACTIONABLE },
  { id: "multibagger", rule: "1", pattern: /\bmulti-?baggers?\b/i, message: ACTIONABLE },
  { id: "will-rally", rule: "1", pattern: /\bwill rally\b/i, message: ACTIONABLE },
  { id: "will-fall", rule: "1", pattern: /\bwill fall\b/i, message: ACTIONABLE },
  { id: "undervalued-by", rule: "1", pattern: new RegExp(`\\bundervalued by\\s+~?\\d+(?:\\.\\d+)?\\s*${PCT}`, "i"), message: ACTIONABLE },
  { id: "returned-pct", rule: "2", pattern: new RegExp(`\\breturned\\s+~?\\d+(?:\\.\\d+)?\\s*${PCT}`, "i"), message: PERFORMANCE },
  { id: "my-calls", rule: "2", pattern: /\bmy calls\b/i, message: PERFORMANCE },
  { id: "hit-rate", rule: "2", pattern: /\bhit rate\b/i, message: PERFORMANCE },
  { id: "beat-the-nifty", rule: "2", pattern: /\bbeat(?:s|ing)?\s+the\s+nifty\b/i, message: PERFORMANCE },
  { id: "cagr-of-my", rule: "2", pattern: /\bcagr of my (?:ideas|picks|calls|portfolio)\b/i, message: PERFORMANCE },
];

/**
 * Rule 3: a price, return or valuation number. Checked only when the item names a company.
 * Covers labelled valuation figures, CMP/LTP (current market price, last traded price) and per-share prices.
 */
export const PRICE_NUMBER = new RegExp(
  [
    "\\b(?:price|priced|trading at|trades at|market cap|valuation|p/e|pe of|ev/ebitda|p/b|returned|return of)\\b[^.\\n]{0,40}?\\d",
    "\\b(?:cmp|ltp)\\b",
    `(?:${CURRENCY_SIGN}|${CURRENCY_WORD})\\s*\\d[\\d,]*(?:\\.\\d+)?\\s*per\\s+share\\b`,
  ].join("|"),
  "i",
);

/** Words (2+ letters) that appear in the lexicon patterns, derived so a new lexicon word gets hyphen joins for free. */
const PATTERN_WORDS = LEXICON.flatMap((entry) => entry.pattern.source.replace(/\\[a-zA-Z]/g, " ").match(/[a-z]{2,}/gi) ?? []);
// Compounds and singulars that the pattern text spells with optional characters.
const COMPOUND_WORDS = ["target", "booking", "stoploss", "multibagger", "multibaggers", "buyback"];

/**
 * Letters-only lowercase words that may be split by a hyphen or underscore inside one token
 * ("tar-get", "stop-loss", "a-d-d"); normalise.ts joins such splits back into these words.
 */
export const KEYWORDS: ReadonlySet<string> = new Set([...PATTERN_WORDS, ...COMPOUND_WORDS].map((word) => word.toLowerCase()));
