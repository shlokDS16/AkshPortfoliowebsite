import "server-only";

import { revalidatePath, updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { istDate } from "@/lib/dates";
import { ItemNotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, type AdminIdentity } from "@/modules/identity";
import type { GateDecision } from "./decision";
import { createGateRpc } from "./gate-rpc";
import { PublishContextNotFoundError, runPublishGate, type PublishDeps, type PublishOptions } from "./publish";
import { createSupabaseComplianceRepo } from "./repo";

/**
 * Server-only (M1): these functions take caller-supplied options (the rule 4 hand check), so they must never be
 * server-action endpoints. Only compliance/actions.ts imports this file (gate.graph.test.ts), and its form actions
 * apply the rule-4 tick and file-structure backstops before calling publishRevision. Each function still checks the
 * admin itself.
 *
 * Reads go through the admin's cookie session; gate writes through the service-role RPC file, as the admin
 * that requireAdmin() just verified (ADR-003). Every caller passes the AdminIdentity it got from requireAdmin().
 */
export async function gateDeps(admin: AdminIdentity): Promise<PublishDeps> {
  const repo = createSupabaseComplianceRepo(await createSupabaseServerClient());
  return { repo, gate: createGateRpc(), actorId: admin.userId, today: () => istDate(new Date()) };
}

/** Purge our caches after anything public changes (ADR-001 s8.9). */
function purgePublic(): void {
  updateTag(CACHE_TAGS.publicItems);
  revalidatePath("/", "layout");
}

function assertIds(...ids: unknown[]): void {
  for (const id of ids) if (!isUuid(id)) throw new ItemNotFoundError(String(id));
}

/**
 * The only publish entry point. The lint is computed on the server from stored rows (a caller cannot supply
 * one) and publish_revision() decides. A failed gate RECORDS a fail row and returns it; it does not throw.
 */
export async function publishRevision(itemId: string, revisionId: string, options: PublishOptions = {}): Promise<GateDecision> {
  const admin = await requireAdmin();
  assertIds(itemId, revisionId);
  let decision: GateDecision;
  try {
    decision = await runPublishGate(await gateDeps(admin), itemId, revisionId, options);
  } catch (error) {
    throw error instanceof PublishContextNotFoundError ? new ItemNotFoundError(itemId) : error;
  }
  if (decision.verdict === "pass") purgePublic();
  revalidatePath(`/desk/items/${itemId}`);
  return decision;
}

/** Retraction: visibility goes back to private in SQL, then the public pages are purged. */
export async function unpublishItem(itemId: string): Promise<{ slug: string | null }> {
  const admin = await requireAdmin();
  assertIds(itemId);
  const { gate, actorId } = await gateDeps(admin);
  const slug = await gate.callUnpublish(actorId, itemId);
  purgePublic();
  revalidatePath(`/desk/items/${itemId}`);
  return { slug };
}
