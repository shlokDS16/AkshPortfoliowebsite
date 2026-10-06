import { addDays } from "@/lib/dates";
import { LEXICON, PRICE_NUMBER } from "./lexicon";
import { matchViews } from "./normalise";
import { sentenceHash } from "./hash";
import { POLICY_VERSION, type LintAllowed, type LintField, type LintFinding, type LintInput, type LintResult, type LintRule } from "./rules";
import { splitSentences } from "./sentences";

type TextUnit = { field: LintField; text: string; citedQuote: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function walk(value: unknown, units: TextUnit[], citedQuote: boolean): void {
  if (typeof value === "string") units.push({ field: "structured", text: value, citedQuote });
  else if (Array.isArray(value)) value.forEach((v) => walk(v, units, citedQuote));
  else if (isRecord(value)) Object.values(value).forEach((v) => walk(v, units, citedQuote));
}

/** The whole public surface (ADR-001 s8.3). OG text is derived from title and learning objective. */
function collectUnits(input: LintInput): TextUnit[] {
  const plain = (field: LintField, text: string | null): TextUnit => ({ field, text: text ?? "", citedQuote: false });
  const units: TextUnit[] = [
    plain("title", input.title),
    plain("slug", (input.slug ?? "").replace(/-/g, " ")),
    plain("learningObjective", input.learningObjective),
    plain("body", input.bodyMd),
    plain("changeReason", input.changeReason),
    plain("companyName", input.companyName),
    plain("companyOneLiner", input.companyOneLiner),
    plain("themeName", input.themeName),
  ];
  const { sources, ...rest } = input.structured;
  for (const source of Array.isArray(sources) ? sources : sources === undefined ? [] : [sources]) {
    if (!isRecord(source)) {
      walk(source, units, false);
      continue;
    }
    // Only the quote of a source that carries a citation URL is exempt; its title and notes are not.
    const cited = typeof source.url === "string" && source.url.trim() !== "";
    for (const [key, value] of Object.entries(source)) walk(value, units, cited && key === "quote");
  }
  walk(rest, units, false);
  return units;
}

function dataIsLagged(input: LintInput): boolean {
  return input.dataAsOf !== null && input.dataAsOf <= addDays(input.today, -30);
}

function firstMatch(pattern: RegExp, views: readonly string[]): RegExpExecArray | null {
  for (const view of views) {
    const match = pattern.exec(view);
    if (match) return match;
  }
  return null;
}

const structural = (rule: LintRule, message: string, field: LintField | null = null): LintFinding => ({
  rule,
  field,
  sentence: null,
  sentenceHash: null,
  match: null,
  message,
});

/** Pure: no I/O. Allowances are honoured for rule 1 only; rules 2, 3, 5, 6 and structure are never allowanceable. */
export function lintText(input: LintInput): LintResult {
  const findings: LintFinding[] = [];
  const allowedBy: LintAllowed[] = [];
  const checkPrices = input.companyId !== null && !dataIsLagged(input);

  for (const unit of collectUnits(input)) {
    for (const sentence of splitSentences(unit.text)) {
      // Hash and report the sentence as typed; match against its folded views (normalise.ts).
      const hash = sentenceHash(sentence);
      const views = matchViews(sentence);
      for (const entry of LEXICON) {
        const match = firstMatch(entry.pattern, views);
        if (!match || unit.citedQuote) continue;
        if (entry.rule === "1" && input.allowances.has(hash)) {
          allowedBy.push({ rule: "1", field: unit.field, sentence, sentenceHash: hash, match: match[0] });
        } else {
          findings.push({ rule: entry.rule, field: unit.field, sentence, sentenceHash: hash, match: match[0], message: entry.message });
        }
      }
      const price = checkPrices ? firstMatch(PRICE_NUMBER, views) : null;
      if (price) {
        findings.push({
          rule: "3",
          field: unit.field,
          sentence,
          sentenceHash: hash,
          match: price[0],
          message: "A price, return or valuation number needs a data as-of date at least 30 days old.",
        });
      }
    }
  }

  if (!input.learningObjective?.trim()) {
    findings.push(structural("6", "Add a one-sentence learning objective: it makes the piece education, not a view on a stock.", "learningObjective"));
  }
  if (input.companyId !== null && input.holdsPosition === null) {
    findings.push(structural("5", "Set 'Holds position' (yes, no or not disclosed) for an item that names a company."));
  }
  if ((input.kind === "thesis" || input.kind === "case_study") && !/^#{1,6}\s*what would prove me wrong\b/im.test(input.bodyMd)) {
    findings.push(structural("structure", "Add a 'What would prove me wrong' section as a Markdown heading.", "body"));
  }
  if (input.kind === "case_study" && !dataIsLagged(input)) {
    findings.push(structural("3", "A case study needs a data as-of date at least 30 days old."));
  }

  return { revisionId: input.revisionId, passed: findings.length === 0, policyVersion: POLICY_VERSION, findings, allowedBy };
}
