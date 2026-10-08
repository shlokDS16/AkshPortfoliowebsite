import type { Json } from "@/lib/supabase/database.types";
import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { Flag, MachineFact } from "./proposed-fact";

// What extract_page writes: extractions (append-only) and pending proposals, nothing else (ADR-004 s4.2; migration
// 0007 grants the secret key select and insert on both tables, no update). Job code reaches it through ctx.deps.repos.

export type NewExtraction = {
  documentId: string;
  pageNo: number;
  model: string;
  promptVersion: string;
  inputHash: string;
  output: unknown;
  tokensUsed: number;
};

export type ProposalRow = {
  documentId: string;
  pageNo: number;
  extractionId: string;
  dedupeKey: string;
  machineValue: MachineFact;
  flags: Flag[];
  reason: "core" | "label_match" | "moved";
};

export interface ProposalsRepo {
  /** The newest stored answer for this exact input, model and prompt version, or null. */
  findCachedExtraction(inputHash: string, model: string, promptVersion: string): Promise<{ output: unknown } | null>;
  /**
   * The stored extraction of this page for this exact input, model and prompt version, with its id, or null. The digest reuses
   * the id on a rerun (ruling R20), so its rows are written once; extract_page keeps its own pattern.
   */
  findExtractionFor(documentId: string, pageNo: number, inputHash: string, model: string, promptVersion: string): Promise<{ id: string; output: unknown } | null>;
  insertExtraction(row: NewExtraction): Promise<string>;
  /** How many proposals the document has, whatever their status: the per-document cap counts them all. */
  countForDocument(documentId: string): Promise<number>;
  /** A row whose (document, dedupe key) exists is left as it is, so a repeated or duplicate step adds nothing. */
  insertProposals(rows: ProposalRow[]): Promise<void>;
}

export function createProposalsRepo(db: Db): ProposalsRepo {
  return {
    async findCachedExtraction(inputHash, model, promptVersion) {
      const { data, error } = await db
        .from("extractions")
        .select("output")
        .eq("input_hash", inputHash)
        .eq("model", model)
        .eq("prompt_version", promptVersion)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw jobDbError("proposals.findCached", error);
      return data ? { output: data.output } : null;
    },

    async findExtractionFor(documentId, pageNo, inputHash, model, promptVersion) {
      const { data, error } = await db
        .from("extractions")
        .select("id, output")
        .eq("document_id", documentId)
        .eq("page_no", pageNo)
        .eq("input_hash", inputHash)
        .eq("model", model)
        .eq("prompt_version", promptVersion)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw jobDbError("proposals.findExtractionFor", error);
      return data ? { id: data.id, output: data.output } : null;
    },

    async insertExtraction(row) {
      const { data, error } = await db
        .from("extractions")
        .insert({
          document_id: row.documentId,
          page_no: row.pageNo,
          model: row.model,
          prompt_version: row.promptVersion,
          input_hash: row.inputHash,
          output: row.output as NonNullable<Json>,
          tokens_used: row.tokensUsed,
        })
        .select("id")
        .single();
      if (error) throw jobDbError("proposals.insertExtraction", error);
      return data.id;
    },

    async countForDocument(documentId) {
      const { count, error } = await db.from("proposals").select("id", { count: "exact", head: true }).eq("document_id", documentId);
      if (error) throw jobDbError("proposals.count", error);
      return count ?? 0;
    },

    async insertProposals(rows) {
      if (rows.length === 0) return;
      const { error } = await db.from("proposals").upsert(
        rows.map((r) => ({
          document_id: r.documentId,
          page_no: r.pageNo,
          extraction_id: r.extractionId,
          dedupe_key: r.dedupeKey,
          machine_value: r.machineValue as unknown as NonNullable<Json>,
          flags: r.flags,
          reason: r.reason,
        })),
        { onConflict: "document_id,dedupe_key", ignoreDuplicates: true },
      );
      if (error) throw jobDbError("proposals.insert", error);
    },
  };
}
