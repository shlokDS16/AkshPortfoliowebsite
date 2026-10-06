import { createClient } from "@supabase/supabase-js";
import { tokenHashFor } from "./auth";
import type { LocalStack } from "./stack";

/**
 * Publishes an item's current revision the only way the database allows: the admin's own
 * session calling publish_revision(). The lint result is hand-built here because this test is
 * about the research module, not the lint; the SQL still re-checks everything it can.
 */
export async function publishCurrentRevisionAsAdmin(stack: LocalStack, email: string, itemId: string): Promise<void> {
  const client = createClient(stack.apiUrl, stack.publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.verifyOtp({ token_hash: await tokenHashFor(stack, email), type: "magiclink" });
  if (signInError) throw signInError;
  const { data: item, error: readError } = await client.from("items").select("current_revision_id").eq("id", itemId).single();
  if (readError || !item.current_revision_id) throw readError ?? new Error("item has no current revision");
  const revisionId: string = item.current_revision_id;
  const { data, error } = await client.rpc("publish_revision", {
    p_item_id: itemId,
    p_revision_id: revisionId,
    p_policy_version: "e2e",
    p_lint_result: { passed: true, revisionId, policyVersion: "e2e" },
  });
  if (error) throw error;
  if ((data as { verdict?: string } | null)?.verdict !== "pass") {
    throw new Error(`publish_revision did not pass: ${JSON.stringify((data as { reasons?: unknown } | null)?.reasons)}`);
  }
}
