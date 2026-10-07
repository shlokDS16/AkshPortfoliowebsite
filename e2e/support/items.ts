import { createClient } from "@supabase/supabase-js";
import { POLICY_VERSION } from "@/modules/compliance/client";
import { tokenHashFor } from "./auth";
import type { LocalStack } from "./stack";

/**
 * Publishes an item's current revision the way the compliance action does after requireAdmin() (ADR-003):
 * the admin's own session reads the item and proves who the admin is, then publish_revision() is called
 * with the LOCAL stack's secret key and that admin as p_actor. Test-only: readLocalStack() refuses any
 * non-local API URL. The lint result is hand-built because this test is about the research module, not the
 * lint; the SQL still re-checks everything it can, including the pinned policy version.
 */
export async function publishCurrentRevisionAsAdmin(stack: LocalStack, email: string, itemId: string): Promise<void> {
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const session = createClient(stack.apiUrl, stack.publishableKey, options);
  const { data: signedIn, error: signInError } = await session.auth.verifyOtp({ token_hash: await tokenHashFor(stack, email), type: "magiclink" });
  if (signInError || !signedIn.user) throw signInError ?? new Error("no user after sign-in");
  const { data: item, error: readError } = await session.from("items").select("current_revision_id").eq("id", itemId).single();
  if (readError || !item.current_revision_id) throw readError ?? new Error("item has no current revision");
  const revisionId: string = item.current_revision_id;
  const service = createClient(stack.apiUrl, stack.secretKey, options);
  const { data, error } = await service.rpc("publish_revision", {
    p_actor: signedIn.user.id,
    p_item_id: itemId,
    p_revision_id: revisionId,
    p_policy_version: POLICY_VERSION,
    p_lint_result: { passed: true, revisionId, policyVersion: POLICY_VERSION },
  });
  if (error) throw error;
  if ((data as { verdict?: string } | null)?.verdict !== "pass") {
    throw new Error(`publish_revision did not pass: ${JSON.stringify((data as { reasons?: unknown } | null)?.reasons)}`);
  }
}
