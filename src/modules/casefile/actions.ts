"use server";

import { revalidatePath } from "next/cache";
import { errorShape, ItemNotFoundError } from "@/lib/errors";
import { doneTo, failTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { parseStaging, recordFiledFacts, recordFiledReadings } from "@/modules/ingestion";
import { addRevision, createSupabaseResearchRepo, getItemWithHistory, isItemId, updateItemMeta } from "@/modules/research";
import { FactsSheetError, NoFigureDateError } from "./errors";
import type { CaseFile } from "./schema";
import { latestFigureDate } from "./figure-dates";
import { parseFactsSheet } from "./sheet";

/** Aksh's words (bodyMd) and the facts (structured, parsed from the facts sheet) as one append-only revision; they never share a field. A note has no sheet: its structured data carries over. */
export async function saveCaseFileRevisionAction(itemId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isItemId(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)), "casefile");
  const back = `/desk/items/${itemId}`;
  const body = formData.get("bodyMd");
  const reason = formData.get("changeReason");
  const sheet = formData.get("factsSheet");
  let saved: Awaited<ReturnType<typeof addRevision>>;
  let caseFile: CaseFile | null = null;
  let db: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    db = await createSupabaseServerClient();
    const repo = createSupabaseResearchRepo(db);
    let structured: Record<string, unknown>;
    if (typeof sheet === "string") {
      const parsed = parseFactsSheet(sheet);
      if (parsed.errors.length > 0) throw new FactsSheetError();
      caseFile = parsed.caseFile;
      structured = parsed.caseFile;
    } else {
      structured = (await getItemWithHistory(repo, itemId))?.revisions[0]?.structured ?? {};
    }
    saved = await addRevision(repo, {
      itemId,
      bodyMd: typeof body === "string" ? body : "",
      structured,
      changeReason: typeof reason === "string" && reason.trim() !== "" ? reason.trim() : null,
    });
  } catch (error) {
    failTo(back, error, "casefile");
  }
  // Where the staged figures came from is evidence about this save, never a condition of it (ADR-004 s4.7): the
  // revision is stored; if the record cannot be written the figures stay staged and are skipped as duplicates next time.
  let provenanceMissing = false;
  const staging = parseStaging(formData.get("provenance"));
  if (caseFile && (staging.provenance.length > 0 || staging.staged.length > 0)) {
    try {
      await recordFiledFacts(db, { itemId, revisionId: saved.revision.id, structured: caseFile, provenance: staging.provenance, staged: staging.staged });
    } catch (error) {
      provenanceMissing = true;
      console.error("casefile provenance failed", errorShape(error));
    }
  }
  // Staged test readings have their own step (R4); one failing never strands the other.
  if (caseFile && staging.stagedReadings.length > 0) {
    try {
      await recordFiledReadings(db, { itemId, revisionId: saved.revision.id, structured: caseFile, pairs: staging.stagedReadings });
    } catch (error) {
      provenanceMissing = true;
      console.error("casefile readings failed", errorShape(error));
    }
  }
  revalidatePath(back);
  const gate = saved.pendingGate;
  // R25: on a public item the gate notice is never replaced; the provenance warning is a second line.
  if (!provenanceMissing) doneTo(back, gate ? "revision-pending-gate" : "revision-saved");
  doneTo(back, gate ? "revision-pending-gate" : "revision-saved-provenance-missing", "", gate ? "revision-saved-provenance-missing" : undefined);
}

/**
 * Sets the item's "Figures to" (data_as_of) to the latest figure date of its newest saved revision, computed
 * here from the stored facts (rule 3a asks for a date at least that late). The date is never taken from the request.
 */
export async function setFiguresToAction(itemId: string): Promise<void> {
  await requireAdmin();
  if (!isItemId(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)), "casefile");
  const back = `/desk/items/${itemId}`;
  try {
    const repo = createSupabaseResearchRepo(await createSupabaseServerClient());
    const history = await getItemWithHistory(repo, itemId);
    if (!history) throw new ItemNotFoundError(itemId);
    const date = latestFigureDate(history.revisions[0]?.structured ?? null);
    if (!date) throw new NoFigureDateError();
    await updateItemMeta(repo, itemId, { dataAsOf: date });
  } catch (error) {
    failTo(back, error, "casefile");
  }
  revalidatePath(back);
  doneTo(back, "figures-to-set", "#gate");
}
