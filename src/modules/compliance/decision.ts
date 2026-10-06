// Client-safe: zod and types only, so a desk screen can import the decision shape.
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { LINT_FIELDS, type LintAllowed } from "./rules";

/** A gate_decisions row as publish_revision() returns it and the desk reads it. */
export type DecisionRow = {
  id: string;
  revision_id: string;
  verdict: string;
  policy_version: string;
  decided_at: string;
  reasons: Json;
};
export type GateFailure = {
  rule: string;
  message: string;
  field: string | null;
  sentence: string | null;
  match: string | null;
  sentenceHash: string | null;
};
export type GateDecision = {
  decisionId: string;
  revisionId: string;
  verdict: "pass" | "fail";
  policyVersion: string;
  decidedAt: string;
  failures: GateFailure[];
  allowedBy: LintAllowed[];
};

const findingSchema = z.object({
  rule: z.string(),
  field: z.string().nullable(),
  sentence: z.string().nullable(),
  sentenceHash: z.string().nullable(),
  match: z.string().nullable(),
  message: z.string(),
});
const allowedSchema = z.object({
  rule: z.literal("1"),
  field: z.enum(LINT_FIELDS),
  sentence: z.string(),
  sentenceHash: z.string(),
  match: z.string(),
});
const reasonsSchema = z.object({
  failures: z.array(z.object({ rule: z.string(), message: z.string() })).default([]),
  lint: z
    .object({ findings: z.array(findingSchema).default([]), allowedBy: z.array(allowedSchema).default([]) })
    .default({ findings: [], allowedBy: [] }),
});

// The SQL's generic failure when the lint did not pass; the lint's own findings explain it better.
const LINT_NOT_PASSED = "The text lint did not pass.";

/** One shape for the desk, from the gate_decisions row written by publish_revision(). Fails closed on bad data. */
export function decisionFromRow(row: DecisionRow): GateDecision {
  const parsed = reasonsSchema.safeParse(row.reasons);
  const reasons = parsed.success
    ? parsed.data
    : { failures: [{ rule: "unknown", message: "This gate decision could not be read." }], lint: { findings: [], allowedBy: [] } };
  const lintFailures: GateFailure[] = reasons.lint.findings;
  const sqlFailures: GateFailure[] = reasons.failures
    .filter((f) => !(f.rule === "lint" && f.message === LINT_NOT_PASSED && lintFailures.length > 0))
    .filter((f) => f.rule === "lint" || !lintFailures.some((l) => l.rule === f.rule))
    .map((f) => ({ ...f, field: null, sentence: null, match: null, sentenceHash: null }));
  const failures = [...lintFailures, ...sqlFailures];
  return {
    decisionId: row.id,
    revisionId: row.revision_id,
    // A pass that carries failures, or whose reasons cannot be read, is not a pass.
    verdict: row.verdict === "pass" && failures.length === 0 ? "pass" : "fail",
    policyVersion: row.policy_version,
    decidedAt: row.decided_at,
    failures,
    allowedBy: reasons.lint.allowedBy,
  };
}
