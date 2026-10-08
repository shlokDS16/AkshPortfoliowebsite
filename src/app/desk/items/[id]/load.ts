import { istDate } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fileProblems, latestFigureDate, readCaseFile, serializeFactsSheet } from "@/modules/casefile/client";
import { getCompanyBrief } from "@/modules/catalog";
import { allowableHashes, annotateBody, createSupabaseComplianceRepo, getLatestDecision, previewGate } from "@/modules/compliance";
import { createSupabaseDocumentsRepo } from "@/modules/documents";
import { listStagedForItem, provenanceForItem } from "@/modules/ingestion";
import { createSupabaseResearchRepo, getItemWithHistory } from "@/modules/research";

/** Everything the editor shows, read once per request (admin session; RLS admin policies apply). */
export async function loadEditor(id: string) {
  const db = await createSupabaseServerClient();
  const history = await getItemWithHistory(createSupabaseResearchRepo(db), id);
  if (!history) return null;
  const { item, revisions, current, pending } = history;
  const compliance = createSupabaseComplianceRepo(db);
  const latest = revisions[0] ?? null;
  // The gate can be run on the newest revision unless it is already the live one.
  const candidate = latest && (item.visibility !== "public" || latest.id !== current?.id) ? latest : null;
  const isFile = item.kind === "thesis" || item.kind === "case_study";
  const [ctx, allowances, company, decision, documents, staged, provenance] = await Promise.all([
    candidate ? compliance.loadPublishContext(item.id, candidate.id) : Promise.resolve(null),
    compliance.listAllowances(item.id),
    item.companyId ? getCompanyBrief(db, item.companyId) : Promise.resolve(null),
    getLatestDecision(compliance, item.id),
    // The documents filed under this item's company, for the pane beside the editor (none for an item with no company).
    item.companyId ? createSupabaseDocumentsRepo(db).listForCompany(item.companyId) : Promise.resolve([]),
    // Machine-read figures Aksh accepted for this file but no revision holds yet, and where the saved facts were read.
    isFile ? listStagedForItem(db, item.id) : Promise.resolve([]),
    isFile ? provenanceForItem(db, item.id) : Promise.resolve({}),
  ]);
  const preview = ctx
    ? previewGate({
        ctx,
        today: istDate(new Date()),
        companyPublic: company ? company.visibility === "public" : null,
        structureProblems: isFile ? fileProblems(ctx.revision.bodyMd, ctx.revision.structured) : [],
      })
    : null;
  return {
    item,
    revisions,
    current,
    pending,
    latest,
    candidate,
    isFile,
    company,
    documents,
    staged,
    provenance,
    preview,
    decision,
    decisionRevNo: decision ? (revisions.find((r) => r.id === decision.revisionId)?.revNo ?? null) : null,
    body: ctx && preview ? annotateBody(ctx.revision.bodyMd, preview.lint, allowances, allowableHashes(decision, latest?.id ?? null)) : null,
    sheet: isFile ? serializeFactsSheet(readCaseFile(latest?.structured ?? null)) : null,
    latestFigure: isFile ? latestFigureDate(latest?.structured ?? null) : null,
  };
}
