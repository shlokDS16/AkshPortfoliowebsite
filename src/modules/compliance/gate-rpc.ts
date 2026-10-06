import "server-only";
import { toDeskError } from "@/lib/errors";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Db } from "@/lib/supabase/types";
import type { GateRpc } from "./repo";

/**
 * The gate's write path (ADR-003). publish_revision, unpublish_item and the lint-allowance writers are
 * executable by service_role only, so an admin access token on its own (for example one lifted by XSS) can
 * neither publish nor forge a lint result. This is the one file outside job code that holds the secret-key
 * client (ESLint and gate.graph.test.ts enforce it); only compliance/actions.ts uses it, and only after
 * requireAdmin() has verified the caller, whose id it passes as p_actor for the SQL to re-check.
 */
export function createGateRpc(db: Db = createSupabaseServiceClient()): GateRpc {
  return {
    async callPublishRevision({ actorId, itemId, revisionId, policyVersion, lintResult }) {
      const { data, error } = await db.rpc("publish_revision", {
        p_actor: actorId,
        p_item_id: itemId,
        p_revision_id: revisionId,
        p_policy_version: policyVersion,
        p_lint_result: lintResult,
      });
      if (error) throw toDeskError("compliance.publish_revision", error, itemId);
      return { id: data.id, revision_id: data.revision_id, verdict: data.verdict, policy_version: data.policy_version, decided_at: data.decided_at, reasons: data.reasons };
    },
    async callUnpublish(actorId, itemId) {
      const { data, error } = await db.rpc("unpublish_item", { p_actor: actorId, p_item_id: itemId });
      if (error) throw toDeskError("compliance.unpublish_item", error, itemId);
      return data;
    },
    async addAllowance(actorId, itemId, sentenceHash, reason) {
      const { data, error } = await db.rpc("add_lint_allowance", {
        p_actor: actorId,
        p_item_id: itemId,
        p_sentence_hash: sentenceHash,
        p_reason: reason,
      });
      if (error) throw toDeskError("compliance.add_lint_allowance", error, itemId);
      return data === true;
    },
    async removeAllowance(actorId, itemId, sentenceHash) {
      const { data, error } = await db.rpc("remove_lint_allowance", { p_actor: actorId, p_item_id: itemId, p_sentence_hash: sentenceHash });
      if (error) throw toDeskError("compliance.remove_lint_allowance", error, itemId);
      return data === true;
    },
  };
}
