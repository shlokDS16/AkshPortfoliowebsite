import type { Db } from "@/lib/supabase/types";
import { createSupabaseDocumentsRepo, type DocumentsRepo } from "@/modules/documents";
import { createReviewRepo, type ReviewRepo } from "./review-repo";
import { readingViews } from "./review-readings";
import { groupValues } from "./review-values";
import { currentRecords, toView } from "./review-view";
import type { ProposalView, ReviewCounts, ReviewData } from "./review-types";

// The review screen's read (spec s6.5). The decisions and filing live in review-ops.ts; this file re-exports them so
// the screen's server code has one import.
export { decide, sameFact, buildFact, type Decision, type Decided } from "./decide";
export { fileUnder, resolveFlag, saveValues, setCompany, unstage, type ReviewPorts } from "./review-ops";
export type { ProposalView, ReviewData } from "./review-types";

type Ports = { docs: DocumentsRepo; review: ReviewRepo };

const tally = (views: ProposalView[]): ReviewCounts => {
  const counts: ReviewCounts = { pending: 0, accepted: 0, edited: 0, rejected: 0, filed: 0 };
  for (const v of views) counts[v.status] += 1;
  return counts;
};

/** Everything the screen needs for one document, or null when there is no such document. */
export async function buildReview(ports: Ports, documentId: string): Promise<ReviewData | null> {
  const doc = await ports.docs.get(documentId);
  if (!doc) return null;
  const all = currentRecords(await ports.review.list(documentId)).flatMap((rec) => toView(rec) ?? []);
  const readings = readingViews(await ports.review.listReadings(documentId));
  const rows = all.filter((v) => v.status !== "filed");
  const flags = rows.filter((v) => v.flags.length > 0);
  const { values, hiddenBasis } = groupValues(rows, doc.basis);
  const pages = [...new Set([...flags, ...values.flatMap((g) => g.rows)].map((v) => v.page))].sort((a, b) => a - b);
  const [pageTexts, target, companyName] = await Promise.all([
    ports.review.pageTexts(documentId, pages),
    doc.companyId ? ports.review.fileOf(doc.companyId) : null,
    doc.companyId ? ports.review.companyName(doc.companyId) : null,
  ]);
  return {
    document: { id: doc.id, title: doc.title, companyId: doc.companyId, companyName, filedOn: doc.filedOn, sourceUrl: doc.sourceUrl, sourceType: doc.sourceType, status: doc.status, originalDeletedAt: doc.originalDeletedAt },
    flags,
    rows,
    readings,
    values,
    hiddenBasis,
    preferredBasis: doc.basis,
    target,
    pageTexts: Object.fromEntries(pageTexts),
    counts: tally(all),
  };
}

/** On the admin's cookie session (RLS and the column grants apply). */
export function getReview(db: Db, documentId: string): Promise<ReviewData | null> {
  return buildReview({ docs: createSupabaseDocumentsRepo(db), review: createReviewRepo(db) }, documentId);
}
