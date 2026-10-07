// Server-side entry (the lint hashes sentences with node:crypto behind server-only). Client code imports
// constants and types from "./client" instead.
export { lintText } from "./lint";
export { buildLintInput } from "./lint-input";
export { sentenceHash } from "./hash";
export { LINT_FIELDS, POLICY_VERSION, RULE_TITLES } from "./rules";
export type { LintAllowed, LintField, LintFinding, LintInput, LintResult, LintRule } from "./rules";
export { normaliseSentence, splitSentences } from "./sentences";
export { allowableHashes, decisionFromRow, type DecisionRow, type GateDecision, type GateFailure } from "./decision";
export { createSupabaseComplianceRepo, type ComplianceRepo, type GateRpc, type PublishContext } from "./repo";
export { allowFlaggedSentence, getLatestDecision, PublishContextNotFoundError, runPublishGate, type GateDeps, type PublishDeps, type PublishOptions } from "./publish";
export { annotateBody, previewGate, type AllowanceRecord, type AnnotatedBody, type BodyFlag, type BodySegment, type ChecklistItem, type ChecklistState, type GatePreview } from "./preview";
export { latestFailures, listBlockedItems, type BlockedItem } from "./blocked";
