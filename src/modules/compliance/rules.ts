// Client-safe entry: constants and types only, no server-only or node imports. UI code (the gate review
// panel, the editor) imports from "@/modules/compliance/rules"; index.ts is the server-side entry.
import type { HoldsPosition, ItemKind } from "@/modules/research";

export { POLICY_VERSION, RULE_TITLES } from "./policy";

/** Every public text surface the lint scans (ADR-001 s8.3, publishing-rules rule 8). */
export const LINT_FIELDS = [
  "title",
  "slug",
  "learningObjective",
  "body",
  "structured",
  "changeReason",
  "companyName",
  "companyOneLiner",
  "themeName",
] as const;
export type LintField = (typeof LINT_FIELDS)[number];
export type LintRule = "1" | "2" | "3" | "5" | "6" | "structure";

/**
 * The optional public fields are required-but-nullable on purpose: a caller must decide what to pass
 * for each, so a new public surface cannot be forgotten by omission.
 */
export type LintInput = {
  /** The revision being gated. Echoed in the result: publish_revision rejects a lint of another revision. */
  revisionId: string;
  kind: ItemKind;
  title: string;
  slug: string | null;
  learningObjective: string | null;
  bodyMd: string;
  structured: Record<string, unknown>;
  /** Change reason of the revision being gated; it becomes public with the revision. */
  changeReason: string | null;
  companyName: string | null;
  companyOneLiner: string | null;
  themeName: string | null;
  companyId: string | null;
  holdsPosition: HoldsPosition | null;
  dataAsOf: string | null;
  today: string;
  /** sentence_hash values from lint_allowances for this item. Honoured for rule 1 only. */
  allowances: ReadonlySet<string>;
};

/**
 * `sentence` is the sentence as typed, except that soft line wraps are replaced by single spaces, so it may
 * not occur verbatim in the stored text. `match` is the text matched in the folded view of the sentence
 * (case, spacing, hyphens, confusable letters), so it may not occur verbatim in `sentence` either; a UI
 * that highlights should highlight `sentence` and show `match` as a label.
 */
export type LintFinding = {
  rule: LintRule;
  field: LintField | null;
  sentence: string | null;
  sentenceHash: string | null;
  match: string | null;
  message: string;
};
export type LintAllowed = { rule: "1"; field: LintField; sentence: string; sentenceHash: string; match: string };
/** Serialised as the `lint_result` jsonb of publish_revision: `passed` is a JSON boolean, `revisionId` must match. */
export type LintResult = {
  revisionId: string;
  passed: boolean;
  policyVersion: string;
  findings: LintFinding[];
  allowedBy: LintAllowed[];
};
