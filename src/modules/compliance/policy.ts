/**
 * docs/compliance/publishing-rules.md v1 plus publishing-rules-v1.1-addendum.md (rule 10) and publishing-rules-v1.2-addendum.md
 * (rules 11-13; migration 0023 puts rule 12 in force). Bump only with a new rules document.
 */
export const POLICY_VERSION = "sebi-unreg-2026-07-v1.2";

export const RULE_TITLES: Record<string, string> = {
  "1": "Rule 1: no actionable language",
  "2": "Rule 2: no performance claims",
  "3": "Rule 3: 30-day data lag",
  "4": "Rule 4: named-security recency",
  "5": "Rule 5: position disclosure",
  "6": "Rule 6: educational framing",
  "10": "Rule 10: case studies from the ledger",
  "12": "Rule 12: videos",
  structure: "Thesis structure",
  slug: "Slug",
  revision: "Newer revision exists",
  company: "Linked company",
  theme: "Linked concept",
  concept: "Linked concept",
  reading_note: "Reading log",
  policy: "Policy version",
  lint: "Text lint",
};
