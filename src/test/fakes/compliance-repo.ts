import { randomUUID } from "node:crypto";
import type { ComplianceRepo, DecisionRow, PublishContext } from "@/modules/compliance";

export type FakeComplianceRepo = ComplianceRepo & {
  context: PublishContext | null;
  /** When set, publish_revision records a `slug` failure, as the SQL does when another item owns the slug. */
  slugTaken: boolean;
  /** When set, publish_revision records a `revision` failure, as the SQL does when a newer revision exists. */
  newerRevisionExists: boolean;
  /** Overrides the id latestRevisionId() reports; by default the context's revision is the latest. */
  latestRevision: string | null | undefined;
  published: { itemId: string; revisionId: string; policyVersion: string; lintResult: Record<string, unknown> }[];
  unpublished: string[];
  allowances: { itemId: string; sentenceHash: string; reason: string }[];
};

/**
 * In-memory ComplianceRepo. callPublishRevision mimics the checks publish_revision() makes on the lint
 * result it is handed (passed, revisionId, policyVersion) and the `slug` collision failure, and records
 * every decision, pass or fail, like the SQL function. The slug itself is the SQL's business (ruling R5).
 */
export function createFakeComplianceRepo(context: PublishContext | null): FakeComplianceRepo {
  const decisions: (DecisionRow & { item_id: string })[] = [];
  const repo: FakeComplianceRepo = {
    context,
    slugTaken: false,
    newerRevisionExists: false,
    latestRevision: undefined,
    published: [],
    unpublished: [],
    allowances: [],
    async loadPublishContext() {
      return repo.context;
    },
    async callPublishRevision({ itemId, revisionId, policyVersion, lintResult }) {
      const lint = lintResult as Record<string, unknown>;
      repo.published.push({ itemId, revisionId, policyVersion, lintResult: lint });
      const failures: { rule: string; message: string }[] = [];
      if (repo.newerRevisionExists) failures.push({ rule: "revision", message: "A newer revision exists; publish the latest." });
      if (lint.passed !== true) failures.push({ rule: "lint", message: "The text lint did not pass." });
      if (lint.revisionId !== revisionId) failures.push({ rule: "lint", message: "The lint result belongs to a different revision." });
      if (lint.policyVersion !== policyVersion) failures.push({ rule: "policy", message: "The lint ran under a different policy version." });
      if (repo.slugTaken) failures.push({ rule: "slug", message: "The slug how-capex-cycles-turn-0b6f3c is already used by another item; rename this item." });
      const row = {
        id: randomUUID(),
        item_id: itemId,
        revision_id: revisionId,
        verdict: failures.length === 0 ? "pass" : "fail",
        policy_version: policyVersion,
        decided_at: new Date(Date.UTC(2026, 9, 4)).toISOString(),
        reasons: { failures, lint: lintResult },
      };
      decisions.push(row);
      return row;
    },
    async callUnpublish(itemId) {
      repo.unpublished.push(itemId);
      return repo.context?.item.slug ?? null;
    },
    async latestDecision(itemId) {
      return [...decisions].reverse().find((d) => d.item_id === itemId) ?? null;
    },
    async latestRevisionId(itemId) {
      if (repo.latestRevision !== undefined) return repo.latestRevision;
      return repo.context?.item.id === itemId ? repo.context.revision.id : null;
    },
    async addAllowance(itemId, sentenceHash, reason) {
      repo.allowances.push({ itemId, sentenceHash, reason });
    },
  };
  return repo;
}
