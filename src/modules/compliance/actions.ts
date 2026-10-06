"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { istDate } from "@/lib/dates";
import { InvalidInputError, ItemNotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { doneTo, failTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, type AdminIdentity } from "@/modules/identity";
import type { GateDecision } from "./decision";
import { createGateRpc } from "./gate-rpc";
import { allowFlaggedSentence, PublishContextNotFoundError, runPublishGate, type PublishDeps } from "./publish";
import { createSupabaseComplianceRepo } from "./repo";

/**
 * Reads go through the admin's cookie session; gate writes through the service-role RPC file, as the admin
 * that requireAdmin() just verified (ADR-003). Every caller passes the AdminIdentity it got from requireAdmin().
 */
async function deps(admin: AdminIdentity): Promise<PublishDeps> {
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

/** Where a form action returns: the item when the id is well formed, else the list. */
const itemPath = (itemId: string) => (isUuid(itemId) ? `/desk/items/${itemId}` : "/desk/items");

/**
 * The only publish entry point. The lint is computed on the server from stored rows (a caller cannot supply
 * one) and publish_revision() decides. A failed gate RECORDS a fail row and returns it; it does not throw.
 */
export async function publishRevision(itemId: string, revisionId: string): Promise<GateDecision> {
  const admin = await requireAdmin();
  assertIds(itemId, revisionId);
  let decision: GateDecision;
  try {
    decision = await runPublishGate(await deps(admin), itemId, revisionId);
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
  const { gate, actorId } = await deps(admin);
  const slug = await gate.callUnpublish(actorId, itemId);
  purgePublic();
  revalidatePath(`/desk/items/${itemId}`);
  return { slug };
}

export async function publishRevisionAction(itemId: string, revisionId: string): Promise<void> {
  await requireAdmin();
  let decision: GateDecision;
  try {
    decision = await publishRevision(itemId, revisionId);
  } catch (error) {
    failTo(itemPath(itemId), error, "compliance");
  }
  // A failure is shown by the gate panel from the recorded decision; a pass is confirmed.
  if (decision.verdict === "pass") doneTo(itemPath(itemId), "published", "#gate");
  redirect(`${itemPath(itemId)}#gate`);
}

export async function unpublishItemAction(itemId: string): Promise<void> {
  await requireAdmin();
  try {
    await unpublishItem(itemId);
  } catch (error) {
    failTo(itemPath(itemId), error, "compliance");
  }
  doneTo(itemPath(itemId), "unpublished");
}

const allowanceInput = z.object({
  sentenceHash: z.string().regex(/^[0-9a-f]{64}$/),
  reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500),
});

/** A sentence allowance for rule 1, never a rule override (publishing-rules; no other rule consults it). It must match a sentence the latest gate decision flagged. */
export async function allowSentenceAction(itemId: string, sentenceHash: string, formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)), "compliance");
  const reason = formData.get("reason");
  const parsed = allowanceInput.safeParse({ sentenceHash, reason: typeof reason === "string" ? reason : "" });
  if (!parsed.success) failTo(itemPath(itemId), parsed.error, "compliance");
  let allowed: boolean;
  try {
    allowed = await allowFlaggedSentence(await deps(admin), itemId, parsed.data.sentenceHash, parsed.data.reason);
  } catch (error) {
    failTo(itemPath(itemId), error, "compliance");
  }
  // The hash is client-visible in the bound arguments: only a sentence the gate flagged can be allowed.
  if (!allowed) failTo(itemPath(itemId), new InvalidInputError(), "compliance");
  revalidatePath(itemPath(itemId));
  doneTo(itemPath(itemId), "allowance-saved", "#gate");
}
