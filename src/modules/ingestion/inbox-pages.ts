import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { POSTGREST_ROWS, type Basis, type PageKind } from "@/modules/documents";

// The pages the inbox lists: statement pages, ticked pages and every scan page, whatever share of the document they are
// (a mixed document still lets Aksh tick its scans; Task 2 review). Read in ranges, because PostgREST stops at 1,000 rows
// a request and a long scanned report would otherwise lose its later scans without a word.

export type InboxPageRow = {
  document_id: string;
  page_no: number;
  kind: string | null;
  basis: string | null;
  selected: boolean;
  selected_by: string | null;
  first_line: string | null;
  is_scan: boolean | null;
};

const COLUMNS = "document_id, page_no, kind, basis, selected, selected_by, first_line, is_scan";

export async function readInboxPages(db: Db, documentIds: string[]): Promise<InboxPageRow[]> {
  if (documentIds.length === 0) return [];
  const out: InboxPageRow[] = [];
  for (let from = 0; ; from += POSTGREST_ROWS) {
    const { data, error } = await db
      .from("document_pages")
      .select(COLUMNS)
      .in("document_id", documentIds)
      .or("kind.not.is.null,selected.eq.true,is_scan.eq.true")
      .order("document_id")
      .order("page_no")
      .range(from, from + POSTGREST_ROWS - 1);
    if (error) throw dbError("inbox.listPages", error);
    out.push(...data);
    if (data.length < POSTGREST_ROWS) return out;
  }
}

const firstLineOf = (text: string | null) => (text ?? "").split("\n")[0].trim();

export type ListedPage = {
  pageNo: number; kind: PageKind | null; basis: Basis | null; firstLine: string; selected: boolean; by: "rule" | "aksh" | null; scan: boolean;
  /** The page's figures are read (its newest extract_page step is done), so "Re-read" is on offer. A page being read again is not, until the new pass is done. */
  read: boolean;
};

/**
 * What the card's page list shows of one document. A photo or a voice note is one page, so there is nothing to tick; every other document
 * lists the pages the read returned, scans included, so a document that is only partly scanned can have its scans read too.
 */
export function listedPages(documentKind: string, rows: InboxPageRow[], read: ReadonlySet<number> = new Set()): ListedPage[] {
  if (documentKind === "image" || documentKind === "audio") return [];
  return rows.map((p) => ({
    pageNo: p.page_no,
    kind: p.kind as PageKind | null,
    basis: p.basis as Basis | null,
    firstLine: firstLineOf(p.first_line),
    selected: p.selected,
    by: p.selected_by as "rule" | "aksh" | null,
    scan: p.is_scan ?? false,
    read: read.has(p.page_no),
  }));
}
