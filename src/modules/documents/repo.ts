import { AccessDeniedError } from "@/lib/errors";
import { dbError } from "@/lib/supabase/errors";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import type { Basis, DocSourceType, DocumentRow, DocumentStatus } from "./types";

const BUCKET = "documents";
const DOCUMENT_COLUMNS =
  "id, company_id, title, kind, storage_path, sha256, bytes, page_count, status, llm_page_budget, basis, source_type, filed_on, source_url, original_deleted_at, created_at";
const LIST_COLUMNS = "id, title, page_count, filed_on, source_url, source_type";

type Row = {
  id: string; company_id: string | null; title: string; kind: string; storage_path: string | null; sha256: string;
  bytes: number; page_count: number | null; status: string; llm_page_budget: number; basis: string; source_type: string;
  filed_on: string | null; source_url: string | null; original_deleted_at: string | null; created_at: string;
};

export type DocumentPatch = Partial<
  Pick<DocumentRow, "title" | "companyId" | "llmPageBudget" | "basis" | "sourceType" | "filedOn" | "sourceUrl" | "status" | "originalDeletedAt">
>;

export interface DocumentsRepo {
  /** `status` lets an upload that never finished be resumed instead of refused as a duplicate. */
  findBySha(sha256: string): Promise<{ id: string; createdAt: string; status: DocumentStatus } | null>;
  insertUploading(row: {
    id: string; title: string; storagePath: string; sha256: string; bytes: number;
    companyId: string | null; filedOn: string | null; sourceUrl: string | null;
  }): Promise<void>;
  get(id: string): Promise<DocumentRow | null>;
  update(id: string, patch: DocumentPatch): Promise<void>;
  usage(): Promise<{ storageBytes: number; databaseBytes: number }>;
  signUpload(path: string): Promise<{ path: string; token: string }>;
  objectInfo(path: string): Promise<{ size: number; mimetype: string } | null>;
  removeObject(path: string): Promise<void>;
  listForCompany(companyId: string): Promise<Pick<DocumentRow, "id" | "title" | "pageCount" | "filedOn" | "sourceUrl" | "sourceType">[]>;
}

const toDocument = (r: Row): DocumentRow => ({
  id: r.id,
  companyId: r.company_id,
  title: r.title,
  kind: "pdf",
  storagePath: r.storage_path,
  sha256: r.sha256,
  bytes: r.bytes,
  pageCount: r.page_count,
  status: r.status as DocumentStatus,
  llmPageBudget: r.llm_page_budget,
  basis: r.basis as Basis,
  sourceType: r.source_type as DocSourceType,
  filedOn: r.filed_on,
  sourceUrl: r.source_url,
  originalDeletedAt: r.original_deleted_at,
  createdAt: r.created_at,
});

// Only the columns the authenticated role may update (migration 0006 column grants).
type UpdateColumns = Pick<
  Database["public"]["Tables"]["documents"]["Update"],
  "title" | "company_id" | "llm_page_budget" | "basis" | "source_type" | "filed_on" | "source_url" | "status" | "original_deleted_at"
>;

function toColumns(patch: DocumentPatch): UpdateColumns {
  const out: UpdateColumns = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.companyId !== undefined) out.company_id = patch.companyId;
  if (patch.llmPageBudget !== undefined) out.llm_page_budget = patch.llmPageBudget;
  if (patch.basis !== undefined) out.basis = patch.basis;
  if (patch.sourceType !== undefined) out.source_type = patch.sourceType;
  if (patch.filedOn !== undefined) out.filed_on = patch.filedOn;
  if (patch.sourceUrl !== undefined) out.source_url = patch.sourceUrl;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.originalDeletedAt !== undefined) out.original_deleted_at = patch.originalDeletedAt;
  return out;
}

/** Runs on the admin's cookie session: RLS (admin only) and the private bucket's policies apply to every call. */
export function createSupabaseDocumentsRepo(db: Db): DocumentsRepo {
  return {
    async findBySha(sha256) {
      const { data, error } = await db.from("documents").select("id, created_at, status").eq("sha256", sha256).maybeSingle();
      if (error) throw dbError("documents.findBySha", error);
      return data ? { id: data.id, createdAt: data.created_at, status: data.status as DocumentStatus } : null;
    },
    async insertUploading(row) {
      const { error } = await db.from("documents").insert({
        id: row.id,
        title: row.title,
        storage_path: row.storagePath,
        sha256: row.sha256,
        bytes: row.bytes,
        company_id: row.companyId,
        filed_on: row.filedOn,
        source_url: row.sourceUrl,
        status: "uploading",
      });
      if (error) throw dbError("documents.insertUploading", error);
    },
    async get(id) {
      const { data, error } = await db.from("documents").select(DOCUMENT_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw dbError("documents.get", error);
      return data ? toDocument(data) : null;
    },
    async update(id, patch) {
      const columns = toColumns(patch);
      if (Object.keys(columns).length === 0) return;
      const { error } = await db.from("documents").update(columns).eq("id", id);
      if (error) throw dbError("documents.update", error);
    },
    async usage() {
      const { data, error } = await db.rpc("storage_usage").maybeSingle();
      if (error) throw dbError("documents.usage", error);
      // storage_usage() returns nulls to anyone but the admin (the generated type does not say so).
      const row = data as { storage_bytes: number | null; database_bytes: number | null } | null;
      if (!row || row.storage_bytes === null || row.database_bytes === null) throw new AccessDeniedError();
      return { storageBytes: Number(row.storage_bytes), databaseBytes: Number(row.database_bytes) };
    },
    async signUpload(path) {
      const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw dbError("documents.signUpload", { message: error.message });
      return { path: data.path, token: data.token };
    },
    async objectInfo(path) {
      const { data, error } = await db.storage.from(BUCKET).list("", { search: path, limit: 1 });
      if (error) throw dbError("documents.objectInfo", { message: error.message });
      // `search` is a prefix match: only the exact name counts.
      const object = data.find((o) => o.name === path);
      if (!object?.metadata) return null;
      return { size: Number(object.metadata.size), mimetype: String(object.metadata.mimetype) };
    },
    async removeObject(path) {
      const { error } = await db.storage.from(BUCKET).remove([path]);
      if (error) throw dbError("documents.removeObject", { message: error.message });
    },
    async listForCompany(companyId) {
      const { data, error } = await db
        .from("documents")
        .select(LIST_COLUMNS)
        .eq("company_id", companyId)
        .neq("status", "uploading") // an unfinished upload has no file to open
        .order("filed_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw dbError("documents.listForCompany", error);
      return data.map((r) => ({
        id: r.id,
        title: r.title,
        pageCount: r.page_count,
        filedOn: r.filed_on,
        sourceUrl: r.source_url,
        sourceType: r.source_type as DocSourceType,
      }));
    },
  };
}
