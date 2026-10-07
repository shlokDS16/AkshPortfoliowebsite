import { istDate } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fileProblems, latestFigureDate, readCaseFile, serializeFactsSheet } from "@/modules/casefile/client";
import { getCompanyBrief } from "@/modules/catalog";
import { allowableHashes, annotateBody, createSupabaseComplianceRepo, getLatestDecision, previewGate } from "@/modules/compliance";
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
  const [ctx, allowances, company, decision] = await Promise.all([
    candidate ? compliance.loadPublishContext(item.id, candidate.id) : Promise.resolve(null),
    compliance.listAllowances(item.id),
    item.companyId ? getCompanyBrief(db, item.companyId) : Promise.resolve(null),
    getLatestDecision(compliance, item.id),
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
    preview,
    decision,
    decisionRevNo: decision ? (revisions.find((r) => r.id === decision.revisionId)?.revNo ?? null) : null,
    body: ctx && preview ? annotateBody(ctx.revision.bodyMd, preview.lint, allowances, allowableHashes(decision, latest?.id ?? null)) : null,
    sheet: isFile ? serializeFactsSheet(readCaseFile(latest?.structured ?? null)) : null,
    latestFigure: isFile ? latestFigureDate(latest?.structured ?? null) : null,
  };
}
