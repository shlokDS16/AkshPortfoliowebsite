import { InvalidInputError } from "@/lib/errors";
import type { Json } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { pageTexts } from "@/modules/documents";
import { latestFileForCompany } from "@/modules/research";
import { FLAGS, type Flag, type ProposedFact } from "./proposed-fact";
import { baseKeyOf, passOf } from "./supersede";

// The review screen's reads and writes on the admin's own session (migration 0007: select on proposals, update on
// accepted_value, status, item_id, revision_id and decided_at; RLS and the column grants apply). Explicit columns only.

export type ProposalRecord = {
  id: string;
  pageNo: number;
  /** The extract_page pass that proposed it: 1 for a first read, more for a re-read (the dedupe key's `|r<n>` suffix, Plan 2b Task 8). */
  pass: number;
  /** The dedupe key without the re-read suffix: the same line on any pass. */
  baseKey: string;
  /** Rejected by Aksh's re-read click (not by his own drop): the row is replaced and no longer listed. */
  superseded: boolean;
  machine: unknown;
  accepted: unknown;
  flags: Flag[];
  reason: string;
  status: string;
  itemId: string | null;
};

/** A machine reading of a test (reading_proposals): no accepted value, because Aksh edits a reading in the Facts form, not here. */
export type ReadingRecord = { id: string; pageNo: number; pass: number; testId: string; machine: unknown; status: string; itemId: string | null; superseded: boolean };

export interface ReviewRepo {
  /** Every proposal of the document, in page order. */
  list(documentId: string): Promise<ProposalRecord[]>;
  pageTexts(documentId: string, pages: number[]): Promise<Map<number, string>>;
  /** The company's file, or null. */
  fileOf(companyId: string): Promise<{ itemId: string; title: string } | null>;
  companyName(companyId: string): Promise<string | null>;
  /** Records one decision; a rejected figure also leaves any file it was waiting for. */
  record(documentId: string, id: string, decided: { status: "accepted" | "edited" | "rejected"; acceptedValue: ProposedFact | null }): Promise<void>;
  /** Puts exactly these accepted or edited figures (none yet in a revision) under the item; returns how many moved. */
  assignItem(documentId: string, itemId: string, proposalIds: string[]): Promise<number>;
  /** Send back to review: the document's figures staged under the item (no revision yet) leave it, still accepted or edited. Returns how many. */
  unassignItem(documentId: string, itemId: string): Promise<number>;
  /** A closed (done or skipped) document's staged figures under the item: Aksh's own drop. They become rejected and leave the item. Returns how many. */
  dropStaged(documentId: string, itemId: string): Promise<number>;

  /** Every test reading of the document, in page order. */
  listReadings(documentId: string): Promise<ReadingRecord[]>;
  /** Aksh's tick on a reading: accepted, or rejected (which also takes it out of any file it was waiting for). A filed reading is final. */
  recordReading(documentId: string, id: string, status: "accepted" | "rejected"): Promise<void>;
  /** Puts exactly these accepted readings (none yet in a revision) under the item; returns how many moved. */
  assignReadings(documentId: string, itemId: string, ids: string[]): Promise<number>;
  /** Send back to review: the document's readings staged under the item leave it, still accepted. Returns how many. */
  unassignReadings(documentId: string, itemId: string): Promise<number>;
  /** A closed document's staged readings under the item: Aksh's own drop. They become rejected and leave the item. Returns how many. */
  dropStagedReadings(documentId: string, itemId: string): Promise<number>;
}

export { passOf };

const COLUMNS = "id, page_no, dedupe_key, machine_value, accepted_value, flags, reason, status, item_id, superseded";
const READING_COLUMNS = "id, page_no, pass, test_id, machine_value, status, item_id, superseded";

export function createReviewRepo(db: Db): ReviewRepo {
  return {
    async list(documentId) {
      const { data, error } = await db.from("proposals").select(COLUMNS).eq("document_id", documentId).order("page_no").order("created_at").order("id");
      if (error) throw dbError("review.list", error);
      return data.map((r) => ({
        id: r.id, pageNo: r.page_no, pass: passOf(r.dedupe_key), baseKey: baseKeyOf(r.dedupe_key), superseded: r.superseded, machine: r.machine_value, accepted: r.accepted_value, flags: r.flags.filter((f): f is Flag => (FLAGS as readonly string[]).includes(f)), reason: r.reason, status: r.status, itemId: r.item_id,
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
    async assignItem(documentId, itemId, proposalIds) {
      if (proposalIds.length === 0) return 0;
      const { data, error } = await db
        .from("proposals")
        .update({ item_id: itemId })
        .eq("document_id", documentId)
        .in("id", proposalIds)
        .in("status", ["accepted", "edited"])
        .is("revision_id", null)
        .select("id");
      if (error) throw dbError("review.assignItem", error);
      return data.length;
    },
    async unassignItem(documentId, itemId) {
      const { data, error } = await db
        .from("proposals")
        .update({ item_id: null })
        .eq("document_id", documentId)
        .eq("item_id", itemId)
        .in("status", ["accepted", "edited"])
        .is("revision_id", null)
        .select("id");
      if (error) throw dbError("review.unassignItem", error);
      return data.length;
    },
    async listReadings(documentId) {
      const { data, error } = await db.from("reading_proposals").select(READING_COLUMNS).eq("document_id", documentId).order("page_no").order("created_at").order("id");
      if (error) throw dbError("review.listReadings", error);
      return data.map((r) => ({ id: r.id, pageNo: r.page_no, pass: r.pass, testId: r.test_id, machine: r.machine_value, status: r.status, itemId: r.item_id, superseded: r.superseded }));
    },
    async recordReading(documentId, id, status) {
      const patch = { status, decided_at: new Date().toISOString(), ...(status === "rejected" ? { item_id: null } : {}) };
      const { data, error } = await db.from("reading_proposals").update(patch).eq("id", id).eq("document_id", documentId).neq("status", "filed").select("id");
      if (error) throw dbError("review.recordReading", error);
      if (data.length === 0) throw new InvalidInputError();
    },
    async assignReadings(documentId, itemId, ids) {
      if (ids.length === 0) return 0;
      const { data, error } = await db
        .from("reading_proposals")
        .update({ item_id: itemId })
        .eq("document_id", documentId)
        .in("id", ids)
        .eq("status", "accepted")
        .is("revision_id", null)
        .select("id");
      if (error) throw dbError("review.assignReadings", error);
      return data.length;
    },
    async unassignReadings(documentId, itemId) {
      const { data, error } = await db
        .from("reading_proposals")
        .update({ item_id: null })
        .eq("document_id", documentId)
        .eq("item_id", itemId)
        .eq("status", "accepted")
        .is("revision_id", null)
        .select("id");
      if (error) throw dbError("review.unassignReadings", error);
      return data.length;
    },
    async dropStagedReadings(documentId, itemId) {
      const { data, error } = await db
        .from("reading_proposals")
        .update({ status: "rejected", item_id: null, decided_at: new Date().toISOString() })
        .eq("document_id", documentId)
        .eq("item_id", itemId)
        .eq("status", "accepted")
        .is("revision_id", null)
        .select("id");
      if (error) throw dbError("review.dropStagedReadings", error);
      return data.length;
    },
    async dropStaged(documentId, itemId) {
      const { data, error } = await db
        .from("proposals")
        .update({ status: "rejected", accepted_value: null, item_id: null, decided_at: new Date().toISOString() })
        .eq("document_id", documentId)
        .eq("item_id", itemId)
        .in("status", ["accepted", "edited"])
        .is("revision_id", null)
        .select("id");
      if (error) throw dbError("review.dropStaged", error);
      return data.length;
    },
  };
}
