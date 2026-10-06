// Client-safe entry (no node or server-only imports): constants and types for desk screens and the editor.
// index.ts is the server-side entry.
export { LINT_FIELDS, POLICY_VERSION, RULE_TITLES } from "./rules";
export type { LintAllowed, LintField, LintFinding, LintInput, LintResult, LintRule } from "./rules";
export type { DecisionRow, GateDecision, GateFailure } from "./decision";
export type { BlockedItem } from "./blocked";
