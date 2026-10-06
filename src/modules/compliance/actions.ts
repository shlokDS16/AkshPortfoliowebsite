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
import { fileProblems } from "@/modules/casefile/client";
import { requireAdmin, type AdminIdentity } from "@/modules/identity";
import type { GateDecision } from "./decision";
import { createGateRpc } from "./gate-rpc";
import { FileStructureError, HandCheckRequiredError } from "./errors";
import { allowFlaggedSentence, PublishContextNotFoundError, runPublishGate, type PublishDeps, type PublishOptions } from "./publish";
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
export async function publishRevision(itemId: string, revisionId: string, options: PublishOptions = {}): Promise<GateDecision> {
  const admin = await requireAdmin();
  assertIds(itemId, revisionId);
  let decision: GateDecision;
  try {
    decision = await runPublishGate(await deps(admin), itemId, revisionId, options);
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

/**
 * The editor's "Run the publishing gate". Server backstops for what the checklist previews: the rule 4 hand check
 * (D16) and the file structure are refused with a fixed code and record nothing. Everything else is decided and
 * recorded by the database gate, pass or fail. There is no override of any rule.
 */
export async function publishCheckedAction(itemId: string, revisionId: string, formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(itemId) || !isUuid(revisionId)) failTo(itemPath(itemId), new ItemNotFoundError(String(itemId)), "compliance");
  let decision: GateDecision;
  try {
    const ctx = await (await deps(admin)).repo.loadPublishContext(itemId, revisionId);
    if (!ctx) throw new ItemNotFoundError(itemId);
    const rule4 = formData.get("rule4") === "on";
    if (ctx.item.companyId && !rule4) throw new HandCheckRequiredError();
    const isFile = ctx.item.kind === "thesis" || ctx.item.kind === "case_study";
    if (isFile && fileProblems(ctx.revision.bodyMd, ctx.revision.structured).length > 0) throw new FileStructureError();
    decision = await publishRevision(itemId, revisionId, { handChecks: ctx.item.companyId ? { rule4 } : {} });
  } catch (error) {
    failTo(itemPath(itemId), error, "compliance");
  }
  // A failure is shown from the recorded decision (notes beside the sentences and the decision panel); a pass is confirmed.
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

/** Takes an allowance back: through the gate RPC as the verified admin (authenticated cannot delete lint_allowances). */
export async function removeAllowanceAction(itemId: string, sentenceHash: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)), "compliance");
  if (!/^[0-9a-f]{64}$/.test(sentenceHash)) failTo(itemPath(itemId), new InvalidInputError(), "compliance");
  try {
    const { gate, actorId } = await deps(admin);
    await gate.removeAllowance(actorId, itemId, sentenceHash);
  } catch (error) {
    failTo(itemPath(itemId), error, "compliance");
  }
  revalidatePath(itemPath(itemId));
  doneTo(itemPath(itemId), "allowance-removed", "#gate");
}
