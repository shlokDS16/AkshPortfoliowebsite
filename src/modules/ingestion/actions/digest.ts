"use server";

import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { readDigest } from "../digest-read";
import { DIGEST_COULD_NOT_LOAD, type DigestLine } from "../digest-view";

// The document pane's read of a page's machine-read digest. Read-only: it writes nothing, and "Use as a fact" is the Facts
// form's own row (the one save action stays the only way anything reaches a revision).

const MAX_PAGE = 5000; // document_pages.page_no check

export type ReadDigestResult = { ok: true; lines: DigestLine[] } | { ok: false; message: string };

export async function readDigestAction(documentId: string, pageNo: number): Promise<ReadDigestResult> {
  await requireAdmin();
  if (!isUuid(documentId) || !Number.isInteger(pageNo) || pageNo < 1 || pageNo > MAX_PAGE) return { ok: true, lines: [] };
  try {
    return { ok: true, lines: await readDigest(await createSupabaseServerClient(), documentId, pageNo) };
  } catch (error) {
    console.error("digest read failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, message: DIGEST_COULD_NOT_LOAD };
  }
}
