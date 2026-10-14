import type { DigestRow, DigestsRepo } from "@/modules/ingestion/digests-repo";

export type MemoryDigestsRepo = DigestsRepo & { rows: DigestRow[] };

/** In-memory digest rows, with the database's unique (document, page, extraction, ord) rule: a repeat is left as it was. */
export function createMemoryDigestsRepo(): MemoryDigestsRepo {
  const rows: DigestRow[] = [];
  return {
    rows,
    async insert(batch) {
      for (const row of batch) {
        if (!rows.some((r) => r.documentId === row.documentId && r.pageNo === row.pageNo && r.extractionId === row.extractionId && r.ord === row.ord)) rows.push(row);
      }
    },
    async list(documentId, pageNo, extractionId) {
      return rows.filter((r) => r.documentId === documentId && r.pageNo === pageNo && r.extractionId === extractionId).sort((a, b) => a.ord - b.ord);
    },
  };
}
