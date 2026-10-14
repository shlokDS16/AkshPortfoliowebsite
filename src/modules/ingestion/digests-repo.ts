import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// What digest_page writes: document_digests rows, inserted once (migration 0008 grants the secret key select and insert, no
// update or delete; the table is append-only and read by the admin only). Job code reaches it through ctx.deps.repos.

export type DigestRow = {
  documentId: string;
  pageNo: number;
  /** The extractions row this digest came from. A rerun reuses it, so the same (document, page, extraction, ord) cannot be written twice. */
  extractionId: string;
  ord: number;
  section: string;
  claim: string;
  line: string;
  /** onPage(line, page text), decided in code when the row is written. */
  onPage: boolean;
};

export interface DigestsRepo {
  /** A row whose (document, page, extraction, ord) exists is left as it is, so a lost lease or a duplicate step adds nothing. */
  insert(rows: DigestRow[]): Promise<void>;
  /** The page's digest rows of one extraction, in order. */
  list(documentId: string, pageNo: number, extractionId: string): Promise<DigestRow[]>;
}

export function createDigestsRepo(db: Db): DigestsRepo {
  return {
    async insert(rows) {
      if (rows.length === 0) return;
      const { error } = await db.from("document_digests").upsert(
        rows.map((r) => ({
          document_id: r.documentId, page_no: r.pageNo, extraction_id: r.extractionId, ord: r.ord, section: r.section, claim: r.claim, line: r.line, on_page: r.onPage,
        })),
        { onConflict: "document_id,page_no,extraction_id,ord", ignoreDuplicates: true },
      );
      if (error) throw jobDbError("digests.insert", error);
    },

    async list(documentId, pageNo, extractionId) {
      const { data, error } = await db
        .from("document_digests")
        .select("ord, section, claim, line, on_page")
        .eq("document_id", documentId)
        .eq("page_no", pageNo)
        .eq("extraction_id", extractionId)
        .order("ord");
      if (error) throw jobDbError("digests.list", error);
      return data.map((r) => ({ documentId, pageNo, extractionId, ord: r.ord, section: r.section, claim: r.claim, line: r.line, onPage: r.on_page }));
    },
  };
}
