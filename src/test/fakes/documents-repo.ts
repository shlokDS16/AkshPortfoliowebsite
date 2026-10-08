import { DbError } from "@/lib/supabase/errors";
import type { DocumentRow, DocumentsRepo, PageRow } from "@/modules/documents";

export type MemoryDocumentsRepo = DocumentsRepo & {
  docs: Map<string, DocumentRow>;
  objects: Map<string, { size: number; mimetype: string }>;
  /** Stored originals by path, for download. */
  files: Map<string, Uint8Array>;
  /** document_pages, keyed `${documentId}:${pageNo}`. */
  pages: Map<string, PageRow>;
  storageBytes: number;
  removed: string[];
  /** The next insert of this hash loses a race: another request inserts the same file first. */
  simulateRace(sha256: string, earlierId: string): void;
};

export function createMemoryDocumentsRepo(): MemoryDocumentsRepo {
  const docs = new Map<string, DocumentRow>();
  const objects = new Map<string, { size: number; mimetype: string }>();
  const files = new Map<string, Uint8Array>();
  const pages = new Map<string, PageRow>();
  const key = (documentId: string, pageNo: number) => `${documentId}:${pageNo}`;
  const forDoc = (documentId: string) =>
    [...pages.values()].filter((p) => p.documentId === documentId).sort((a, b) => a.pageNo - b.pageNo);
  let race: { sha256: string; earlierId: string } | null = null;
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 3, 9, 0, clock++)).toISOString();

  const repo: MemoryDocumentsRepo = {
    docs,
    objects,
    files,
    pages,
    storageBytes: 0,
    removed: [],
    simulateRace(sha256, earlierId) {
      race = { sha256, earlierId };
    },
    async findBySha(sha256) {
      for (const d of docs.values()) if (d.sha256 === sha256) return { id: d.id, createdAt: d.createdAt, status: d.status };
      return null;
    },
    async insertUploading(row) {
      if (race && race.sha256 === row.sha256) {
        const earlierId = race.earlierId;
        race = null;
        docs.set(earlierId, { ...blank(earlierId, row.sha256, stamp()), storagePath: `${earlierId}.pdf` });
        throw new DbError("documents.insertUploading", "23505", "duplicate key value violates unique constraint");
      }
      if ([...docs.values()].some((d) => d.sha256 === row.sha256)) {
        throw new DbError("documents.insertUploading", "23505", "duplicate key value violates unique constraint");
      }
      docs.set(row.id, { ...blank(row.id, row.sha256, stamp()), ...row, status: "uploading" });
    },
    async get(id) {
      return docs.get(id) ?? null;
    },
    async update(id, patch) {
      const d = docs.get(id);
      if (d) docs.set(id, { ...d, ...patch });
    },
    async usage() {
      return { storageBytes: repo.storageBytes, databaseBytes: 0 };
    },
    async signUpload(path) {
      return { path, token: `token-for-${path}` };
    },
    async objectInfo(path) {
      return objects.get(path) ?? null;
    },
    async removeObject(path) {
      repo.removed.push(path);
      objects.delete(path);
    },
    async listForCompany(companyId) {
      // Like repo.ts: no unfinished upload, newest filing first (undated last), then newest upload.
      const newest = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1);
      return [...docs.values()]
        .filter((d) => d.companyId === companyId && d.status !== "uploading")
        .sort((a, b) => newest(a.filedOn, b.filedOn) || newest(a.createdAt, b.createdAt))
        .map(({ id, title, pageCount, filedOn, sourceUrl, sourceType, originalDeletedAt }) => ({ id, title, pageCount, filedOn, sourceUrl, sourceType, originalDeletedAt }));
    },
    async download(path) {
      const bytes = files.get(path);
      if (!bytes) throw new DbError("documents.download", undefined, null);
      return bytes.slice();
    },
    async insertPages(documentId, rows) {
      for (const { pageNo, text } of rows) {
        if (pages.has(key(documentId, pageNo))) continue; // on conflict do nothing
        pages.set(key(documentId, pageNo), {
          documentId, pageNo, text, charCount: text.length, isScan: text.trim().length < 50, kind: null, basis: null, score: 0,
          selected: false, selectedBy: null, ocr: false,
        });
      }
    },
    async setPageCount(documentId, pageCount) {
      const d = docs.get(documentId);
      if (d) docs.set(documentId, { ...d, pageCount });
    },
    async listPagesForSelection(documentId) {
      return forDoc(documentId).map(({ pageNo, text, isScan }) => ({ pageNo, text, isScan }));
    },
    async setVerdicts(documentId, verdicts) {
      for (const v of verdicts) {
        const p = pages.get(key(documentId, v.pageNo));
        if (p) pages.set(key(documentId, v.pageNo), { ...p, kind: v.kind, basis: v.basis, score: v.score });
      }
    },
    async setSelection(documentId, pageNos, by) {
      const chosen: number[] = [];
      for (const pageNo of pageNos) {
        const p = pages.get(key(documentId, pageNo));
        if (!p || (p.selectedBy !== null && p.selectedBy !== by)) continue; // Aksh's decision stands
        pages.set(key(documentId, pageNo), { ...p, selected: true, selectedBy: by });
        chosen.push(pageNo);
      }
      return chosen.sort((a, b) => a - b);
    },
    async getPage(documentId, pageNo) {
      const p = pages.get(key(documentId, pageNo));
      return p
        ? { pageNo: p.pageNo, text: p.text, isScan: p.isScan, kind: p.kind, basis: p.basis, ocr: p.ocr, selected: p.selected, selectedBy: p.selectedBy }
        : null;
    },
    async countSelected(documentId) {
      return forDoc(documentId).filter((p) => p.selected).length;
    },
    async fillScanPage(documentId, pageNo, text) {
      const p = pages.get(key(documentId, pageNo));
      if (!p || p.text.trim().length >= 50) throw new DbError("documents.fillScanPage", "P0001", "document_pages.text is written once");
      pages.set(key(documentId, pageNo), { ...p, text, charCount: text.length, isScan: text.trim().length < 50, ocr: true });
    },
  };
  return repo;
}

function blank(id: string, sha256: string, createdAt: string): DocumentRow {
  return {
    id, companyId: null, title: "x", kind: "pdf", storagePath: null, sha256, bytes: 1, pageCount: null, status: "uploading",
    llmPageBudget: 20, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null,
    originalDeletedAt: null, createdAt,
  };
}
