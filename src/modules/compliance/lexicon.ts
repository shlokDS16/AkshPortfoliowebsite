// Publishing rules 1 and 2. Case-insensitive, word-boundary, matched against the folded views from
// normalise.ts (so patterns assume single spaces, Latin letters and no invisible characters). False
// positives are the safe direction (ADR-001 s5); Aksh clears educational uses of rule 1 phrases with a
// sentence allowance. Rule 2 phrases can never be allowanced.
//
// Deliberately NOT listed: bare "buying", "bought", "sold", "selling". They appear in factual company
// sentences ("the company sold 2 million pumps"); the actionable forms are caught by the phrases below.
export type TextRule = "1" | "2";
export type LexiconEntry = { id: string; rule: TextRule; pattern: RegExp; message: string };

const ACTIONABLE = "Reads as a recommendation to act. Write what you expected and why instead.";
const PERFORMANCE = "Reads as a performance claim. Public pages may not show track records.";

export const LEXICON: readonly LexiconEntry[] = [
  { id: "buy", rule: "1", pattern: /\bbuy\b/i, message: ACTIONABLE },
  { id: "sell", rule: "1", pattern: /\bsell\b/i, message: ACTIONABLE },
  { id: "accumulate", rule: "1", pattern: /\baccumulate\b/i, message: ACTIONABLE },
  { id: "add-on-dips", rule: "1", pattern: /\badd on dips\b/i, message: ACTIONABLE },
  { id: "exit", rule: "1", pattern: /\bexit\b/i, message: ACTIONABLE },
  { id: "book-profit", rule: "1", pattern: /\bbook(?:ing)? profits?\b/i, message: ACTIONABLE },
  { id: "target-price", rule: "1", pattern: /\btarget prices?\b/i, message: ACTIONABLE },
  { id: "tp", rule: "1", pattern: /\btp\b/i, message: ACTIONABLE },
  { id: "stop-loss", rule: "1", pattern: /\bstop[- ]?loss(?:es)?\b/i, message: ACTIONABLE },
  { id: "sl", rule: "1", pattern: /\bsl\b/i, message: ACTIONABLE },
  { id: "sl-level", rule: "1", pattern: /\bsl\s*[:=]?\s*\d/i, message: ACTIONABLE },
  { id: "tp-level", rule: "1", pattern: /\btp\s*[:=]?\s*\d/i, message: ACTIONABLE },
  { id: "price-target", rule: "1", pattern: /\bprice targets?\b/i, message: ACTIONABLE },
  { id: "target-of", rule: "1", pattern: /\btargets?\s+(?:price\s+)?of\s+(?:[\u20B9$]|(?:rs|inr|usd)\b|\d)/i, message: ACTIONABLE },
  { id: "buying-opportunity", rule: "1", pattern: /\bbuying opportunit(?:y|ies)\b/i, message: ACTIONABLE },
  { id: "time-to", rule: "1", pattern: /\btime to (?:buy|sell|exit|accumulate)\b/i, message: ACTIONABLE },
  { id: "upside-of", rule: "1", pattern: /\bupside of\b/i, message: ACTIONABLE },
  { id: "multibagger", rule: "1", pattern: /\bmulti-?baggers?\b/i, message: ACTIONABLE },
  { id: "will-rally", rule: "1", pattern: /\bwill rally\b/i, message: ACTIONABLE },
  { id: "will-fall", rule: "1", pattern: /\bwill fall\b/i, message: ACTIONABLE },
  { id: "undervalued-by", rule: "1", pattern: /\bundervalued by\s+\d+(?:\.\d+)?\s*%/i, message: ACTIONABLE },
  { id: "returned-pct", rule: "2", pattern: /\breturned\s+\d+(?:\.\d+)?\s*%/i, message: PERFORMANCE },
  { id: "my-calls", rule: "2", pattern: /\bmy calls\b/i, message: PERFORMANCE },
  { id: "hit-rate", rule: "2", pattern: /\bhit rate\b/i, message: PERFORMANCE },
  { id: "beat-the-nifty", rule: "2", pattern: /\bbeat the nifty\b/i, message: PERFORMANCE },
  { id: "cagr-of-my", rule: "2", pattern: /\bcagr of my (?:ideas|picks|calls|portfolio)\b/i, message: PERFORMANCE },
];

/** Rule 3: a price, return or valuation number. Checked only when the item names a company. */
export const PRICE_NUMBER =
  /\b(?:price|priced|trading at|trades at|market cap|valuation|p\/e|pe of|ev\/ebitda|p\/b|returned|return of)\b[^.\n]{0,40}?\d/i;

/**
 * Letters-only lowercase words that may be split by a hyphen or underscore inside one token
 * ("tar-get", "stop-loss"); normalise.ts joins such splits back into these words.
 */
export const KEYWORDS: ReadonlySet<string> = new Set([
  "buy", "sell", "accumulate", "exit", "book", "booking", "profit", "profits", "target", "targets", "price", "prices",
  "stoploss", "multibagger", "multibaggers", "rally", "undervalued", "upside", "returned", "calls", "nifty",
]);
