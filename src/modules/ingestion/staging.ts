import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { DocSourceType, DocumentStatus } from "@/modules/documents/client";
import { proposedFactSchema, type ProposedFact } from "./proposed-fact";

// The figures Aksh has accepted and filed under an item that no revision holds yet (ADR-004 s4.7). The editor shows
// them as new rows; nothing is written here. Explicit columns, on the admin's cookie session (RLS applies).

export type StagedRow = {
  proposalId: string;
  status: "accepted" | "edited";
  value: ProposedFact;
  /** `status` tells the editor whether the document is closed (done or skipped): its figures can no longer go back to review, only be dropped. */
  document: { id: string; title: string; sourceType: DocSourceType; filedOn: string; sourceUrl: string | null; status: DocumentStatus };
};

/** Accepted or edited figures staged under the item, in document then page order. Filing already left the standalone repeats out (review-values `filableIds`), so every staged row is shown. */
export async function listStagedForItem(db: Db, itemId: string): Promise<StagedRow[]> {
  const proposals = await db
    .from("proposals")
    .select("id, document_id, status, accepted_value")
    .eq("item_id", itemId)
    .in("status", ["accepted", "edited"])
    .is("revision_id", null)
    .order("document_id")
    .order("page_no")
    .order("created_at")
    .order("id");
  if (proposals.error) throw dbError("staging.proposals", proposals.error);
  if (proposals.data.length === 0) return [];
  const documentIds = [...new Set(proposals.data.map((p) => p.document_id))];
  const documents = await db.from("documents").select("id, title, source_type, filed_on, source_url, status").in("id", documentIds);
  if (documents.error) throw dbError("staging.documents", documents.error);
  const docs = new Map(documents.data.map((d) => [d.id, d]));

  return proposals.data.flatMap((p): StagedRow[] => {
    const doc = docs.get(p.document_id);
    const value = proposedFactSchema.safeParse(p.accepted_value);
    if (!doc || !value.success || (p.status !== "accepted" && p.status !== "edited")) return [];
    const document = { id: doc.id, title: doc.title, sourceType: doc.source_type as DocSourceType, filedOn: doc.filed_on ?? "", sourceUrl: doc.source_url, status: doc.status as DocumentStatus };
    return [{ proposalId: p.id, status: p.status, value: value.data, document }];
  });
}
