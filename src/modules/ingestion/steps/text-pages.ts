import { createHash } from "node:crypto";
import { READABLE_CHARS, TEXT_PAGE_CHARS, TEXT_PAGES_PER_STEP } from "../caps";
import { splitTextPages } from "../text-split";
import type { StepHandler, StepOutcome } from "../types";

// text_pages (Plan 2b Task 5, ruling R1): the stored <id>.txt of a pasted text or a fetched web page, cut into pages of about
// 8,000 characters, TEXT_PAGES_PER_STEP a step, the step enqueueing itself from the next page like pdf_text. Every write is
// idempotent and the split is recomputed whole each time, so a duplicate or reclaimed step is harmless.

export const TEXT_NOT_STORED = "The stored text is no longer there, so its pages cannot be made. Choose Skip, or Try again.";
export const TEXT_WRONG_FILE = "The stored text is not the text that was added. Choose Try again, or Skip this document.";
export const TEXT_EMPTY = "There is no readable text in this document. Choose Skip.";

const attention = (error: string): StepOutcome => ({ kind: "attention", error });
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export const textPages: StepHandler = async ({ step, documentId, deps }) => {
  const documents = deps.repos.documents;
  const doc = await documents.get(documentId);
  if (!doc?.storagePath || doc.originalDeletedAt || (doc.kind !== "text" && doc.kind !== "url")) return attention(TEXT_NOT_STORED);

  // A storage failure throws: the runner retries the step (1 and 2 minutes) before showing its give-up sentence.
  const bytes = await documents.download(doc.storagePath);
  if (sha256(bytes) !== doc.sha256) return attention(TEXT_WRONG_FILE);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return attention(TEXT_WRONG_FILE);
  }

  const pages = splitTextPages(text, TEXT_PAGE_CHARS, READABLE_CHARS);
  if (pages.length === 0) return attention(TEXT_EMPTY);
  if (doc.pageCount !== pages.length) await documents.setPageCount(documentId, pages.length);

  const from = step.pageNo ?? 1;
  const batch = pages.slice(from - 1, from - 1 + TEXT_PAGES_PER_STEP).map((pageText, i) => ({ pageNo: from + i, text: pageText }));
  await documents.insertPages(documentId, batch);

  const next = from + batch.length;
  const result = { from, through: next - 1 };
  if (next <= pages.length) return { kind: "done", result, enqueue: [{ kind: "text_pages", pageNo: next }] };
  return { kind: "done", result, enqueue: [{ kind: "select_pages", pageNo: null }] };
};
