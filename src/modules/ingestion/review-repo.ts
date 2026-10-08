import { InvalidInputError } from "@/lib/errors";
import type { Json } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { pageTexts } from "@/modules/documents";
import { latestFileForCompany } from "@/modules/research";
import { FLAGS, type Flag, type ProposedFact } from "./proposed-fact";

// The review screen's reads and writes on the admin's own session (migration 0007: select on proposals, update on
// accepted_value, status, item_id, revision_id and decided_at; RLS and the column grants apply). Explicit columns only.

export type ProposalRecord = {
  id: string;
  pageNo: number;
  machine: unknown;
  accepted: unknown;
  flags: Flag[];
  reason: string;
  status: string;
  itemId: string | null;
};

export interface ReviewRepo {
  /** Every proposal of the document, in page order. */
  list(documentId: string): Promise<ProposalRecord[]>;
  pageTexts(documentId: string, pages: number[]): Promise<Map<number, string>>;
  /** The company's file, or null. */
  fileOf(companyId: string): Promise<{ itemId: string; title: string } | null>;
  companyName(companyId: string): Promise<string | null>;
  /** Records one decision; a rejected figure also leaves any file it was waiting for. */
  record(documentId: string, id: string, decided: { status: "accepted" | "edited" | "rejected"; acceptedValue: ProposedFact | null }): Promise<void>;
  /** Puts the document's accepted and edited figures that are not yet in a revision under the item; returns how many. */
  assignItem(documentId: string, itemId: string): Promise<number>;
}

const COLUMNS = "id, page_no, machine_value, accepted_value, flags, reason, status, item_id";

export function createReviewRepo(db: Db): ReviewRepo {
  return {
    async list(documentId) {
      const { data, error } = await db.from("proposals").select(COLUMNS).eq("document_id", documentId).order("page_no").order("created_at").order("id");
      if (error) throw dbError("review.list", error);
      return data.map((r) => ({
        id: r.id, pageNo: r.page_no, machine: r.machine_value, accepted: r.accepted_value, flags: r.flags.filter((f): f is Flag => (FLAGS as readonly string[]).includes(f)), reason: r.reason, status: r.status, itemId: r.item_id,
      }));
    },
    pageTexts: (documentId, pages) => pageTexts(db, documentId, pages),
    async fileOf(companyId) {
      const file = await latestFileForCompany(db, companyId);
      return file ? { itemId: file.itemId, title: file.title } : null;
    },
    async companyName(companyId) {
      const { data, error } = await db.from("companies").select("name").eq("id", companyId).maybeSingle();
      if (error) throw dbError("review.companyName", error);
      return data?.name ?? null;
    },
    async record(documentId, id, decided) {
      const patch = {
        status: decided.status,
        accepted_value: decided.acceptedValue as unknown as NonNullable<Json> | null,
        decided_at: new Date().toISOString(),
        ...(decided.status === "rejected" ? { item_id: null } : {}),
      };
      const { data, error } = await db.from("proposals").update(patch).eq("id", id).eq("document_id", documentId).select("id");
      if (error) throw dbError("review.record", error);
      if (data.length === 0) throw new InvalidInputError();
    },
    async assignItem(documentId, itemId) {
      const { data, error } = await db
        .from("proposals")
        .update({ item_id: itemId })
        .eq("document_id", documentId)
        .in("status", ["accepted", "edited"])
        .is("revision_id", null)
        .select("id");
      if (error) throw dbError("review.assignItem", error);
      return data.length;
    },
  };
}
