"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { istDate, isPastLag } from "@/lib/dates";
import { InvalidInputError, ItemNotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { doneTo, failTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fileProblems } from "@/modules/casefile/client";
import { requireAdmin } from "@/modules/identity";
import { ledgerGateFacts } from "@/modules/ledger";
import type { GateDecision } from "./decision";
import { FileStructureError, HandCheckRequiredError } from "./errors";
import { gateDeps, publishRevision, unpublishItem } from "./gate-service";
import { allowFlaggedSentence } from "./publish";

// M1: a "use server" file makes every export an endpoint, so this one exports only the *Action form handlers.
// publishRevision/unpublishItem (caller-supplied options) live in the server-only gate-service.ts.

/** Where a form action returns: the item when the id is well formed, else the list. */
const itemPath = (itemId: string) => (isUuid(itemId) ? `/desk/items/${itemId}` : "/desk/items");

/**
 * Whether the sealed ledger already refuses rule 4 for this company (a stance entry in the last 30 days, or a ledger that failed
 * its own check). Only the hand tick consults it: the database gate re-reads the ledger itself and decides. A ledger that cannot
 * be read is not "refusing" here: the checklist then shows the row as manual too, and the tick stays required.
 */
async function ledgerRefusesRule4(companyId: string): Promise<boolean> {
  try {
    const facts = await ledgerGateFacts(await createSupabaseServerClient(), companyId);
    return !facts.ledgerOk || facts.stanceClearDate !== null;
  } catch {
    return false;
  }
}

/**
 * The editor's "Run the publishing gate". Server backstops for what the checklist previews: the rule 4 hand check
 * (D16, asked for only while the ledger does not already refuse) and the file structure are refused with a fixed code and record nothing. Everything else is decided and
 * recorded by the database gate, pass or fail. There is no override of any rule.
 */
export async function publishCheckedAction(itemId: string, revisionId: string, formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(itemId) || !isUuid(revisionId)) failTo(itemPath(itemId), new ItemNotFoundError(String(itemId)), "compliance");
  let decision: GateDecision;
  let lagged = true;
  try {
    const ctx = await (await gateDeps(admin)).repo.loadPublishContext(itemId, revisionId);
    if (!ctx) throw new ItemNotFoundError(itemId);
    // The hand tick answers a question the ledger cannot: "have I changed my stance outside it?". It is asked for, and recorded as
    // true, only while the ledger itself does not refuse. When the ledger refuses, no tick is required (the gate records the
    // refusal) and a stray tick is NOT recorded as an attestation beside that refusal.
    const refused = ctx.item.companyId ? await ledgerRefusesRule4(ctx.item.companyId) : false;
    const ticked = formData.get("rule4") === "on";
    if (ctx.item.companyId && !refused && !ticked) throw new HandCheckRequiredError();
    const rule4 = ticked && !refused;
    const isFile = ctx.item.kind === "thesis" || ctx.item.kind === "case_study";
    if (isFile && fileProblems(ctx.revision.bodyMd, ctx.revision.structured).length > 0) throw new FileStructureError();
    decision = await publishRevision(itemId, revisionId, { handChecks: ctx.item.companyId ? { rule4 } : {} });
    // I1: public_items hides a file until its Figures to is 30 days old (SQL is_lagged; null means no lag applies).
    lagged = ctx.item.dataAsOf === null || isPastLag(ctx.item.dataAsOf, istDate(new Date()));
  } catch (error) {
    failTo(itemPath(itemId), error, "compliance");
  }
  // A failure is shown from the recorded decision (notes beside the sentences and the decision panel); a pass is confirmed.
  if (decision.verdict === "pass") doneTo(itemPath(itemId), lagged ? "published" : "published-lagged", "#gate");
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
    allowed = await allowFlaggedSentence(await gateDeps(admin), itemId, parsed.data.sentenceHash, parsed.data.reason);
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
    const { gate, actorId } = await gateDeps(admin);
    await gate.removeAllowance(actorId, itemId, sentenceHash);
  } catch (error) {
    failTo(itemPath(itemId), error, "compliance");
  }
  revalidatePath(itemPath(itemId));
  doneTo(itemPath(itemId), "allowance-removed", "#gate");
}
