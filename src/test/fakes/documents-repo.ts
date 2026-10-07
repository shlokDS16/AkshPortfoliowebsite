import { DbError } from "@/lib/supabase/errors";
import type { DocumentRow, DocumentsRepo } from "@/modules/documents";

export type MemoryDocumentsRepo = DocumentsRepo & {
  docs: Map<string, DocumentRow>;
  objects: Map<string, { size: number; mimetype: string }>;
  storageBytes: number;
  removed: string[];
  /** The next insert of this hash loses a race: another request inserts the same file first. */
  simulateRace(sha256: string, earlierId: string): void;
};

export function createMemoryDocumentsRepo(): MemoryDocumentsRepo {
  const docs = new Map<string, DocumentRow>();
  const objects = new Map<string, { size: number; mimetype: string }>();
  let race: { sha256: string; earlierId: string } | null = null;
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 3, 9, 0, clock++)).toISOString();

  const repo: MemoryDocumentsRepo = {
    docs,
    objects,
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
      return [...docs.values()]
        .filter((d) => d.companyId === companyId)
        .map(({ id, title, pageCount, filedOn, sourceUrl, sourceType }) => ({ id, title, pageCount, filedOn, sourceUrl, sourceType }));
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
