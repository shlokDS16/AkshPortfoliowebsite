import { AccessDeniedError } from "@/lib/errors";
import { dbError, jobDbError } from "@/lib/supabase/errors";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import type { PageVerdict } from "./selector";
import type { Basis, DocSourceType, DocumentRow, DocumentStatus, PageForExtraction, PageForReading, PageKind, PageText } from "./types";

const BUCKET = "documents";
const DOCUMENT_COLUMNS =
  "id, company_id, title, kind, storage_path, sha256, bytes, page_count, status, llm_page_budget, basis, source_type, filed_on, source_url, original_deleted_at, created_at";
const LIST_COLUMNS = "id, title, page_count, filed_on, source_url, source_type";
/** PostgREST returns at most 1,000 rows a request (Supabase default max_rows): longer reads go in ranges. */
const PAGE_RANGE = 1_000;

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

  // Job code (the secret-key client; migration 0006 grants). Errors carry the operation and code only.
  /** The stored original's bytes. */
  download(path: string): Promise<Uint8Array>;
  /** Idempotent: a page already written is left as it is (insert ... on conflict do nothing). */
  insertPages(documentId: string, pages: PageText[]): Promise<void>;
  setPageCount(documentId: string, pageCount: number): Promise<void>;
  /** Every page of the document, in page order. */
  listPagesForSelection(documentId: string): Promise<PageForReading[]>;
  /** Writes kind, basis and score per page. */
  setVerdicts(documentId: string, verdicts: PageVerdict[]): Promise<void>;
  /**
   * Ticks the pages the rule chose, never a page Aksh has already ticked or unticked. Returns the pages now selected
   * by the rule (the ones to read), so a repeated run gives the same answer.
   */
  setSelection(documentId: string, pageNos: number[], by: "rule"): Promise<number[]>;
  getPage(documentId: string, pageNo: number): Promise<PageForExtraction | null>;
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
    ...machinePages(db),
  };
}

const toPage = (r: { page_no: number; text: string; is_scan: boolean | null }): PageForReading => ({
  pageNo: r.page_no,
  text: r.text,
  isScan: r.is_scan ?? false,
});

/** The page-text half of the repo, used by job code on the secret-key client. */
function machinePages(db: Db): Pick<
  DocumentsRepo,
  "download" | "insertPages" | "setPageCount" | "listPagesForSelection" | "setVerdicts" | "setSelection" | "getPage"
> {
  return {
    async download(path) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error) throw jobDbError("documents.download", { message: error.message });
      return new Uint8Array(await data.arrayBuffer());
    },
    async insertPages(documentId, pages) {
      if (pages.length === 0) return;
      const rows = pages.map((p) => ({ document_id: documentId, page_no: p.pageNo, text: p.text }));
      const { error } = await db.from("document_pages").upsert(rows, { onConflict: "document_id,page_no", ignoreDuplicates: true });
      if (error) throw jobDbError("documents.insertPages", error);
    },
    async setPageCount(documentId, pageCount) {
      const { error } = await db.from("documents").update({ page_count: pageCount }).eq("id", documentId);
      if (error) throw jobDbError("documents.setPageCount", error);
    },
    async listPagesForSelection(documentId) {
      const out: PageForReading[] = [];
      for (let from = 0; ; from += PAGE_RANGE) {
        const { data, error } = await db
          .from("document_pages")
          .select("page_no, text, is_scan")
          .eq("document_id", documentId)
          .order("page_no")
          .range(from, from + PAGE_RANGE - 1);
        if (error) throw jobDbError("documents.listPagesForSelection", error);
        out.push(...data.map(toPage));
        if (data.length < PAGE_RANGE) return out;
      }
    },
    async setVerdicts(documentId, verdicts) {
      for (const v of verdicts) {
        const { error } = await db
          .from("document_pages")
          .update({ kind: v.kind, basis: v.basis, score: v.score })
          .eq("document_id", documentId)
          .eq("page_no", v.pageNo);
        if (error) throw jobDbError("documents.setVerdicts", error);
      }
    },
    async setSelection(documentId, pageNos, by) {
      if (pageNos.length === 0) return [];
      const { data, error } = await db
        .from("document_pages")
        .update({ selected: true, selected_by: by })
        .eq("document_id", documentId)
        .in("page_no", pageNos)
        .or(`selected_by.is.null,selected_by.eq.${by}`)
        .select("page_no");
      if (error) throw jobDbError("documents.setSelection", error);
      return data.map((r) => r.page_no).sort((a, b) => a - b);
    },
    async getPage(documentId, pageNo) {
      const { data, error } = await db
        .from("document_pages")
        .select("page_no, text, is_scan, kind, basis")
        .eq("document_id", documentId)
        .eq("page_no", pageNo)
        .maybeSingle();
      if (error) throw jobDbError("documents.getPage", error);
      return data ? { ...toPage(data), kind: data.kind as PageKind | null, basis: data.basis as Basis | null } : null;
    },
  };
}
