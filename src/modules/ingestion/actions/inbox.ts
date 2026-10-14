"use server";

import { requireAdmin } from "@/modules/identity";
import { retryAttention, setBudget, skipAttention, skipDocument } from "../inbox-ops";
import { runInbox } from "../inbox-run";
import type { ActionResult } from "../upload-flow";

// The inbox's buttons that need no AI switch (the two that do live in src/app/desk/inbox/page-actions.ts: ingestion
// cannot import ops). Every action checks the admin first and runs on the admin's own session.

/** The most pages the AI reads of this document, 1 to 40. */
export async function setBudgetAction(documentId: string, budget: number): Promise<ActionResult> {
  await requireAdmin();
  return runInbox((ports) => setBudget(ports, documentId, budget));
}

/** Skip: set this document's stuck steps aside. */
export async function skipStepAction(documentId: string): Promise<ActionResult> {
  await requireAdmin();
  return runInbox((ports) => skipAttention(ports, documentId));
}

/** Try again: run this document's stuck steps again from a clean count. */
export async function retryStepAction(documentId: string): Promise<ActionResult> {
  await requireAdmin();
  return runInbox((ports) => retryAttention(ports, documentId));
}

/** Skip the whole document: it moves to Finished and its job stops. */
export async function skipDocumentAction(documentId: string): Promise<ActionResult> {
  await requireAdmin();
  return runInbox((ports) => skipDocument(ports, documentId));
}
