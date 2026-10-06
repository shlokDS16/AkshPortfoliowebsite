import type { Json } from "@/lib/supabase/database.types";
import { decisionFromRow, type GateDecision } from "./decision";
import { lintText } from "./lint";
import { POLICY_VERSION } from "./policy";
import type { ComplianceRepo, PublishContext } from "./repo";

export type { PublishContext };
export type PublishDeps = { repo: ComplianceRepo; today: () => string };

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
  const lint = lintText({
    revisionId: ctx.revision.id,
    kind: ctx.item.kind,
    title: ctx.item.title,
    slug: ctx.item.slug,
    learningObjective: ctx.item.learningObjective,
    bodyMd: ctx.revision.bodyMd,
    structured: ctx.revision.structured,
    changeReason: ctx.revision.changeReason,
    companyName: ctx.companyName,
    companyOneLiner: ctx.companyOneLiner,
    themeName: ctx.themeName,
    companyId: ctx.item.companyId,
    holdsPosition: ctx.item.holdsPosition,
    dataAsOf: ctx.item.dataAsOf,
    today: deps.today(),
    allowances: new Set(ctx.allowances),
  });
  const row = await deps.repo.callPublishRevision({
    itemId,
    revisionId,
    policyVersion: POLICY_VERSION,
    lintResult: lint as unknown as Json,
  });
  return decisionFromRow(row);
}

export async function getLatestDecision(repo: ComplianceRepo, itemId: string): Promise<GateDecision | null> {
  const row = await repo.latestDecision(itemId);
  return row ? decisionFromRow(row) : null;
}
