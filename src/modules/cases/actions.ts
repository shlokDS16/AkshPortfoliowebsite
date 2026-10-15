"use server";

import { revalidatePath } from "next/cache";
import { failTo, doneTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { createSupabaseResearchRepo } from "@/modules/research";
import { createSupabaseCasesRepo } from "./repo";
import { draftCaseStudy, refreshCaseStudy } from "./service";
import type { CaseDeps } from "./types";

// The two writes of the case study block (spec s33.8). Each starts with requireAdmin(); the ids come from the bound argument and
// are checked by the service; nothing from a form reaches the record. A refusal is a fixed code in the redirect, never free text.

async function depsOf(): Promise<CaseDeps> {
  const db = await createSupabaseServerClient();
  return { cases: createSupabaseCasesRepo(db), research: createSupabaseResearchRepo(db) };
}

/** "Draft a case study" on a closed idea: makes the private item, or opens the one that exists. */
export async function draftCaseStudyAction(ideaId: string): Promise<void> {
  await requireAdmin();
  const back = `/desk/ledger/${encodeURIComponent(String(ideaId))}`;
  let itemId: string;
  try {
    itemId = (await draftCaseStudy(await depsOf(), ideaId)).itemId;
  } catch (error) {
    failTo(back, error, "cases");
  }
  revalidatePath(back);
  doneTo(`/desk/items/${itemId}`, "case-drafted");
}

/** "Refresh from the ledger" on a case study whose record no longer matches the ledger. */
export async function refreshCaseStudyAction(itemId: string): Promise<void> {
  await requireAdmin();
  const back = `/desk/items/${encodeURIComponent(String(itemId))}`;
  let result: Awaited<ReturnType<typeof refreshCaseStudy>>;
  try {
    result = await refreshCaseStudy(await depsOf(), itemId);
  } catch (error) {
    failTo(back, error, "cases");
  }
  revalidatePath(back);
  doneTo(back, result.changed ? (result.pendingGate ? "revision-pending-gate" : "case-refreshed") : "case-unchanged");
}
