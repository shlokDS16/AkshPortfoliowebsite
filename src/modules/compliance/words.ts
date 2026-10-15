import { LEDGER_PRICE_PATTERNS, LEXICON } from "./lexicon";
import { matchViews } from "./normalise";
import { RULE_TITLES } from "./policy";
import { splitSentences } from "./sentences";

// Client-safe (no node or server-only imports). The hint while writing sealed words (spec s33.8, D44): the same word lists and the
// same folding the publishing gate uses, rules 1, 2 and 10 (a price or a return, which a ledger case never prints), with no hash and
// no allowance. It never blocks anything; the gate decides.

export type WordsFinding = { sentence: string; rule: "1" | "2" | "10"; title: string };

const fresh = (pattern: RegExp) => new RegExp(pattern.source, pattern.flags.replace("g", ""));

/** The sentences in `text` that the text lint would flag, each once (its first rule), in the order they are written. */
export function lintWords(text: string): WordsFinding[] {
  const found: WordsFinding[] = [];
  for (const sentence of splitSentences(text)) {
    const views = matchViews(sentence);
    const entry = LEXICON.find((e) => views.some((view) => fresh(e.pattern).test(view)));
    const rule = entry ? entry.rule : LEDGER_PRICE_PATTERNS.some((p) => views.some((view) => fresh(p).test(view))) ? "10" : null;
    if (rule) found.push({ sentence, rule, title: RULE_TITLES[rule] ?? `Rule ${rule}` });
  }
  return found;
}
