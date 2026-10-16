import { istDate } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fileProblems, latestFigureDate, readCaseFile, serializeFactsSheet } from "@/modules/casefile/client";
import { getCompanyBrief } from "@/modules/catalog";
import { loadLedgerView } from "@/modules/cases";
import { allowableHashes, annotateBody, createSupabaseComplianceRepo, getLatestDecision, previewGate } from "@/modules/compliance";
import { createSupabaseDocumentsRepo } from "@/modules/documents";
import { listStagedForItem, listStagedReadingsForItem, provenanceForItem } from "@/modules/ingestion";
import { ledgerGateFacts } from "@/modules/ledger";
import { createSupabaseResearchRepo, getItemWithHistory } from "@/modules/research";
import { createSupabaseSourcesRepo, loadPanel } from "@/modules/sources";
import { confirmedModelFor } from "@/modules/valuation";
import { loadItemConcepts } from "./concepts";
import { ledgerCaseOf } from "./ledger-case";

/** Everything the editor shows, read once per request (admin session; RLS admin policies apply). */
export async function loadEditor(id: string) {
  const db = await createSupabaseServerClient();
  const history = await getItemWithHistory(createSupabaseResearchRepo(db), id);
  if (!history) return null;
  const { item, revisions, current, pending } = history;
  const compliance = createSupabaseComplianceRepo(db);
  const latest = revisions[0] ?? null;
  // The gate can be run on the newest revision unless it is already the live one. A read is never published (Phase 4 D52): no gate to run.
  const candidate = item.kind !== "reading_note" && latest && (item.visibility !== "public" || latest.id !== current?.id) ? latest : null;
  // A case study from the ledger is its body plus the record (D41): no facts sheet, no staged figures, no documents pane.
  const { isLedger, record: ledgerRecord } = ledgerCaseOf(latest?.structured);
  const isFile = (item.kind === "thesis" || item.kind === "case_study") && !isLedger;
  const [ctx, allowances, company, decision, documents, staged, stagedReadings, provenance, model, ledgerView, concepts, outside] = await Promise.all([
    candidate ? compliance.loadPublishContext(item.id, candidate.id) : Promise.resolve(null),
    compliance.listAllowances(item.id),
    item.companyId ? getCompanyBrief(db, item.companyId) : Promise.resolve(null),
    getLatestDecision(compliance, item.id),
    // The documents filed under this item's company, for the pane beside the editor (none for an item with no company).
    item.companyId ? createSupabaseDocumentsRepo(db).listForCompany(item.companyId) : Promise.resolve([]),
    // Machine-read figures Aksh accepted for this file but no revision holds yet, and where the saved facts were read.
    isFile ? listStagedForItem(db, item.id) : Promise.resolve([]),
    // Test readings Aksh accepted for this file's tests: they fill the test rows' reading fields, never a status.
    isFile ? listStagedReadingsForItem(db, item.id) : Promise.resolve([]),
    isFile ? provenanceForItem(db, item.id) : Promise.resolve({}),
    // The header's private "Model" link (Plan 2.7 Task 3): the company's newest confirmed valuation model. A link is not worth a broken editor.
    item.companyId ? confirmedModelFor(db, item.companyId).catch(() => null) : Promise.resolve(null),
    // The ledger against this case study, and the owner's two switches (advisory; the database gate decides).
    isLedger ? loadLedgerView(db, item.id) : Promise.resolve(null),
    // The Concepts row: chips of the newest version and the picker's choices (null: unreadable, the row is left out).
    loadItemConcepts(db, item, latest),
    // The "Outside sources" panel (Phase 5d): the company's saved sources and what the newest revision lists. Only a company file has one.
    isFile && item.companyId ? loadPanel(createSupabaseSourcesRepo(db), item.companyId, latest?.structured ?? {}) : Promise.resolve(null),
  ]);
  // What the sealed ledger says about this company, asked of the same database function the gate uses. Advisory: if it cannot
  // be read the checklist falls back to the hand check alone (never to "clear"), and the database gate still decides.
  const ledger = ctx && item.companyId ? await ledgerGateFacts(db, item.companyId).catch(() => null) : null;
  const preview = ctx
    ? previewGate({
        ctx,
        today: istDate(new Date()),
        companyPublic: company ? company.visibility === "public" : null,
        structureProblems: isFile ? fileProblems(ctx.revision.bodyMd, ctx.revision.structured) : [],
        ledger,
        ledgerCase: isLedger ? { switches: ledgerView?.switches ?? null } : undefined,
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
    isLedger,
    ledgerRecord,
    ledgerStatus: ledgerView?.status ?? null,
    concepts,
    outside,
    company,
    documents,
    staged,
    stagedReadings,
    provenance,
    preview,
    decision,
    decisionRevNo: decision ? (revisions.find((r) => r.id === decision.revisionId)?.revNo ?? null) : null,
    body: ctx && preview ? annotateBody(ctx.revision.bodyMd, preview.lint, allowances, allowableHashes(decision, latest?.id ?? null)) : null,
    sheet: isFile ? serializeFactsSheet(readCaseFile(latest?.structured ?? null)) : null,
    latestFigure: isFile ? latestFigureDate(latest?.structured ?? null) : null,
    model,
  };
}
