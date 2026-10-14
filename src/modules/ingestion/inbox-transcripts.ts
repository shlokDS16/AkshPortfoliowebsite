import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// The typed-out voice notes the inbox shows (Plan 2b Task 4): page 1 of each voice note that waits for Aksh. It is his own
// voice, so it is shown to him whole; nothing else in the inbox list carries page text. Admin session (RLS applies).

export async function readTranscripts(db: Db, documentIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (documentIds.length === 0) return out;
  const { data, error } = await db.from("document_pages").select("document_id, text").in("document_id", documentIds).eq("page_no", 1);
  if (error) throw dbError("inbox.transcripts", error);
  for (const row of data) if (row.text.trim().length > 0) out.set(row.document_id, row.text);
  return out;
}
