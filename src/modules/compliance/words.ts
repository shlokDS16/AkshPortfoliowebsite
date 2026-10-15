import { LEXICON } from "./lexicon";
import { matchViews } from "./normalise";
import { RULE_TITLES } from "./policy";
import { splitSentences } from "./sentences";

// Client-safe (no node or server-only imports). The hint while writing sealed words (spec s33.8, D44): the same word lists and the
// same folding the publishing gate uses, rules 1 and 2 only, with no hash and no allowance. It never blocks anything; the gate decides.

export type WordsFinding = { sentence: string; rule: "1" | "2"; title: string };

/** The sentences in `text` that the text lint would flag, each once (its first rule), in the order they are written. */
export function lintWords(text: string): WordsFinding[] {
  const found: WordsFinding[] = [];
  for (const sentence of splitSentences(text)) {
    const views = matchViews(sentence);
    const entry = LEXICON.find((e) => views.some((view) => new RegExp(e.pattern.source, e.pattern.flags.replace("g", "")).test(view)));
    if (entry) found.push({ sentence, rule: entry.rule, title: RULE_TITLES[entry.rule] ?? `Rule ${entry.rule}` });
  }
  return found;
}
