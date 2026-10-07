import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { PageKind } from "./types";
import { queryWords } from "./verbatim";

// The document pane's reads, on the admin's cookie session (RLS: admin select on documents and document_pages).
// Explicit columns; the page text is the only large one and is read for the pages asked for, never the whole document.

export const SNIPPET_CHARS = 160;
export const SEARCH_RESULTS = 10;

/** One page and the document's page count, or null when the page is not there. */
export async function readPage(db: Db, documentId: string, pageNo: number): Promise<{ text: string; pageCount: number; kind: PageKind | null } | null> {
  const [page, doc] = await Promise.all([
    db.from("document_pages").select("text, kind").eq("document_id", documentId).eq("page_no", pageNo).maybeSingle(),
    db.from("documents").select("page_count").eq("id", documentId).maybeSingle(),
  ]);
  if (page.error) throw dbError("documents.readPage", page.error);
  if (doc.error) throw dbError("documents.readPage", doc.error);
  if (!page.data || !doc.data) return null;
  return { text: page.data.text, pageCount: doc.data.page_count ?? pageNo, kind: page.data.kind as PageKind | null };
}

/** Pages whose text matches a web-style query, in page order, with the matching row's text for the snippet. */
export async function searchPageText(db: Db, documentId: string, query: string): Promise<{ pageNo: number; text: string }[]> {
  const { data, error } = await db
    .from("document_pages")
    .select("page_no, text")
    .eq("document_id", documentId)
    .textSearch("search", query, { type: "websearch", config: "simple" })
    .order("page_no")
    .limit(SEARCH_RESULTS);
  if (error) throw dbError("documents.searchPageText", error);
  return data.map((r) => ({ pageNo: r.page_no, text: r.text }));
}

/** The text of the listed pages, by page number. A page that is not there is absent from the map. */
export async function pageTexts(db: Db, documentId: string, pageNos: number[]): Promise<Map<number, string>> {
  if (pageNos.length === 0) return new Map();
  const { data, error } = await db.from("document_pages").select("page_no, text").eq("document_id", documentId).in("page_no", pageNos);
  if (error) throw dbError("documents.pageTexts", error);
  return new Map(data.map((r) => [r.page_no, r.text]));
}

/** About 160 characters of the page around the first hit of any query word; the page's start when nothing is found. */
export function snippetAround(text: string, query: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const hits = queryWords(query).map((w) => lower.indexOf(w)).filter((i) => i >= 0);
  const at = hits.length > 0 ? Math.min(...hits) : 0;
  const start = Math.max(0, Math.min(at - 40, flat.length - SNIPPET_CHARS));
  const piece = flat.slice(start, start + SNIPPET_CHARS);
  return `${start > 0 ? "…" : ""}${piece}${start + SNIPPET_CHARS < flat.length ? "…" : ""}`;
}
