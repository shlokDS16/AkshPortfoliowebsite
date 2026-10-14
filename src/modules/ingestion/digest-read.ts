import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { latestDigest, type DigestLine } from "./digest-view";

// The document pane's read of a page's digest, on the admin's own cookie session (RLS: admin select on document_digests).
// Explicit columns. A voice note has no digest and is never asked for one: its words are Aksh's own.

/**
 * How many claims each of these documents has stored, for the inbox card (it points at the pane only when there is something
 * in it). Counts every extraction's rows: any claim means the pane has something to show. Admin session (RLS applies).
 */
export async function readDigestCounts(db: Db, documentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (documentIds.length === 0) return out;
  const { data, error } = await db.from("document_digests").select("document_id").in("document_id", documentIds);
  if (error) throw dbError("inbox.digestCounts", error);
  for (const row of data) out.set(row.document_id, (out.get(row.document_id) ?? 0) + 1);
  return out;
}

/** The page's machine-read claims in order; nothing for a page with no digest or a voice note. */
export async function readDigest(db: Db, documentId: string, pageNo: number): Promise<DigestLine[]> {
  const doc = await db.from("documents").select("kind").eq("id", documentId).maybeSingle();
  if (doc.error) throw dbError("digests.readDocument", doc.error);
  if (!doc.data || doc.data.kind === "audio") return [];
  const { data, error } = await db
    .from("document_digests")
    .select("extraction_id, ord, section, claim, line, on_page, created_at")
    .eq("document_id", documentId)
    .eq("page_no", pageNo)
    .order("created_at", { ascending: false })
    .order("ord");
  if (error) throw dbError("digests.read", error);
  return latestDigest(data.map((r) => ({ extractionId: r.extraction_id, section: r.section, claim: r.claim, line: r.line, onPage: r.on_page })))
    .map(({ section, claim, line, onPage }) => ({ section, claim, line, onPage }));
}
