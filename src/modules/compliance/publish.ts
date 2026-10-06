import type { Json } from "@/lib/supabase/database.types";
import { decisionFromRow, type GateDecision } from "./decision";
import { lintText } from "./lint";
import { buildLintInput } from "./lint-input";
import { POLICY_VERSION } from "./policy";
import type { ComplianceRepo, GateRpc, PublishContext } from "./repo";

export type { PublishContext };
/** `actorId` is the admin requireAdmin() verified for this request (ADR-003); the SQL re-checks it. */
export type GateDeps = { repo: ComplianceRepo; gate: GateRpc; actorId: string };
export type PublishDeps = GateDeps & { today: () => string };

export class PublishContextNotFoundError extends Error {
  constructor(itemId: string, revisionId: string) {
    super(`Item ${itemId} or revision ${revisionId} not found`);
    this.name = "PublishContextNotFoundError";
  }
}

/**
 * Lint first (friendly errors), then let publish_revision() decide and record (spec s3). The lint result is
 * computed here from rows the server loads; no caller can supply one. Every attempt, pass or fail, is written
 * to gate_decisions and returned, never raised. The slug is the SQL function's business (ruling R5): a
 * collision comes back as a recorded `slug` failure like any other rule. There is no override.
 */
export async function runPublishGate(deps: PublishDeps, itemId: string, revisionId: string): Promise<GateDecision> {
  const ctx = await deps.repo.loadPublishContext(itemId, revisionId);
  if (!ctx) throw new PublishContextNotFoundError(itemId, revisionId);
  const lint = lintText(buildLintInput(ctx, deps.today()));
  const row = await deps.gate.callPublishRevision({
    actorId: deps.actorId,
    itemId,
    revisionId,
    policyVersion: POLICY_VERSION,
    lintResult: lint as unknown as Json,
  });
  return decisionFromRow(row);
}

/**
 * Records a rule 1 sentence allowance, but only for a sentence the gate actually flagged: the latest recorded
 * decision must belong to the item's newest revision and carry a rule 1 failure with this exact hash.
 * Without this a crafted request could pre-clear language that was never flagged. Checked here for a quick
 * refusal and again by add_lint_allowance() in SQL, which is the authority. Returns false when refused.
 */
export async function allowFlaggedSentence(deps: GateDeps, itemId: string, sentenceHash: string, reason: string): Promise<boolean> {
  const { repo, gate, actorId } = deps;
  const [decision, latestRevisionId] = await Promise.all([getLatestDecision(repo, itemId), repo.latestRevisionId(itemId)]);
  const flagged =
    decision !== null &&
    latestRevisionId !== null &&
    decision.revisionId === latestRevisionId &&
    decision.failures.some((f) => f.rule === "1" && f.sentenceHash === sentenceHash);
  if (!flagged) return false;
  return gate.addAllowance(actorId, itemId, sentenceHash, reason);
}

export async function getLatestDecision(repo: ComplianceRepo, itemId: string): Promise<GateDecision | null> {
  const row = await repo.latestDecision(itemId);
  return row ? decisionFromRow(row) : null;
}
