// Client-safe entry: constants and types only, no server-only or node imports. UI code (the gate review
// panel, the editor) imports from "@/modules/compliance/client"; index.ts is the server-side entry.
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
  "conceptName",
  "conceptSlug",
  /** A video's transcript: the machine's record of what was said, linted word for word (rule 12.2). */
  "transcript",
  /** Rule 14: the title and the site or channel name the machine read from another site (only when the entry shows them), and the link's host and path (always). */
  "outsideTitle",
  "outsideSite",
  "outsideLink",
] as const;
export type LintField = (typeof LINT_FIELDS)[number];
export type LintRule = "1" | "2" | "3" | "5" | "6" | "10" | "structure";

/**
 * One outside source a company file lists (rule 14), as the lint reads it, loaded by the server from the source table and never supplied by
 * a client. `url` is the link as saved. `title` and `siteName` (the site, or a YouTube channel) are present only when the entry shows them AND
 * `metaSha` equals the table's current hash (`read`): then they are exactly the words a reader will see, and the lint reports the hash in `studied`.
 */
export type OutsideSource = { url: string; show: boolean; metaSha: string | null; read: boolean; title: string | null; siteName: string | null };

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
  /** Names and slugs of the live concepts the revision links (its concept_ids), in order. Public with the revision, like themeName. */
  conceptNames: string[];
  conceptSlugs: string[];
  /**
   * A video's transcript: the stored segment texts joined by "\n", exactly the text its sha256 is taken over (migration 0022); null for
   * every other kind and for a video revision whose transcript could not be loaded. Never edited: it is linted as it was said.
   */
  transcript: string | null;
  /** The outside sources `structured.studied` lists, in its order; an empty list for every file without any. */
  outside: OutsideSource[];
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
  /** Present only when the input carried a transcript: sha256 hex of exactly that text. The database gate (12.2) compares it with the stored one. */
  transcriptSha?: string;
  /** Present only when an entry showed its title: the `metaSha` of each entry whose texts the lint read. The database gate (14.3) requires every shown entry's hash here. */
  studied?: string[];
};
