import {
  DocumentError, htmlToText, storeDocument, TEXT_MAX_CHARS, TEXT_MIN_CHARS,
  type DocumentsRepo, type FetchedLink, type StoreInput,
} from "@/modules/documents";
import type { QueueRepo } from "./queue-repo";
import { actionFailure, runFinishUpload, type ActionFailure } from "./upload-flow";

// Aksh's link and pasted text, turned into documents (Plan 2b Task 5, ruling R1). Both run inside his own action on his own
// session: nothing here is a job step. A PDF answer goes through the same checks as an upload (hash, duplicates, room, type); a web
// page is reduced to its visible text and stored, like pasted text, as <id>.txt for the text_pages step.

export type LinkFlowDeps = {
  docs: DocumentsRepo;
  queue: QueueRepo;
  /** safeFetch, or a fake in tests. The only way this file reaches a user-supplied address. */
  fetchLink: (link: string) => Promise<FetchedLink>;
  newId: () => string;
};

/** What a validated action passes in. `url` must be an https link; the action's schema checks the rest. */
export type LinkInput = { url: string; companyId: string | null; filedOn: string | null };
export type TextInput = { text: string; title: string | null; companyId: string | null; filedOn: string | null; sourceUrl: string | null };
export type StartDocumentResult = { ok: true; documentId: string } | ActionFailure;

const PDF_TYPES = new Set(["application/pdf", "application/x-pdf"]);
const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const UNNAMED_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);
const PDF_MAGIC = "%PDF-";
const TITLE_FROM_TEXT_CHARS = 80;

const startsLikePdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, PDF_MAGIC.length)).toString("latin1") === PDF_MAGIC;
const decode = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes);

/** A title for a link: the last part of its path without the extension, else the site's name. */
function titleFromLink(link: string): string {
  const url = new URL(link);
  const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // keep the raw segment
  }
  name = name.replace(/\.(pdf|html?|txt)$/i, "").replace(/[-_]+/g, " ").trim();
  return name || url.hostname;
}

/** The text of a document, once its size is right: too little to read, or more than a document may hold, is refused. */
function checkedText(text: string, tooShort: "text-too-short" | "link-empty"): string {
  const kept = text.trim();
  if (kept.length < TEXT_MIN_CHARS) throw new DocumentError(tooShort);
  if (kept.length > TEXT_MAX_CHARS) throw new DocumentError("text-too-long");
  return kept;
}

const encode = (text: string) => new TextEncoder().encode(text);

function normalised(raw: string): string {
  try {
    return new URL(raw).href;
  } catch {
    throw new DocumentError("link-invalid");
  }
}

/** Works out what the link answered with, as the document to store. */
function documentOf(fetched: FetchedLink, link: string, rest: Pick<StoreInput, "companyId" | "filedOn">): StoreInput {
  const base = { ...rest, sourceUrl: link, fetchedFrom: link };
  const type = fetched.contentType;
  if (PDF_TYPES.has(type) || (UNNAMED_TYPES.has(type) && startsLikePdf(fetched.bytes))) {
    return { ...base, kind: "pdf", title: titleFromLink(fetched.finalUrl), bytes: fetched.bytes };
  }
  if (HTML_TYPES.has(type)) {
    const page = htmlToText(decode(fetched.bytes));
    if (page.text.length === 0) throw new DocumentError("link-empty");
    return { ...base, kind: "url", title: page.title ?? titleFromLink(fetched.finalUrl), bytes: encode(checkedText(page.text, "link-empty")) };
  }
  if (type === "text/plain") {
    const text = decode(fetched.bytes).replace(/\u0000/g, "").replace(/\r\n?/g, "\n");
    if (text.trim().length === 0) throw new DocumentError("link-empty");
    return { ...base, kind: "url", title: titleFromLink(fetched.finalUrl), bytes: encode(checkedText(text, "link-empty")) };
  }
  throw new DocumentError("link-unsupported");
}

async function finish(deps: LinkFlowDeps, documentId: string): Promise<StartDocumentResult> {
  const finished = await runFinishUpload(deps.docs, deps.queue, documentId);
  return finished.ok ? { ok: true, documentId } : finished;
}

/** Fetches Aksh's link (safely), stores what came back and queues its reading. */
export async function runStartLink(deps: LinkFlowDeps, input: LinkInput): Promise<StartDocumentResult> {
  try {
    // The normalised form: fetched_from only accepts a lower-case https:// start.
    const link = normalised(input.url);
    const fetched = await deps.fetchLink(link);
    const doc = documentOf(fetched, link, input);
    const { documentId } = await storeDocument(deps.docs, doc, deps.newId);
    return await finish(deps, documentId);
  } catch (error) {
    return actionFailure(error);
  }
}

/** Stores text Aksh pasted and queues its reading. His words are stored as they are: no page is invented, nothing is rewritten. */
export async function runStartText(deps: LinkFlowDeps, input: TextInput): Promise<StartDocumentResult> {
  try {
    const text = checkedText(input.text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n"), "text-too-short");
    const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? "";
    const title = input.title?.trim() || firstLine.trim().slice(0, TITLE_FROM_TEXT_CHARS) || "Pasted text";
    const { documentId } = await storeDocument(
      deps.docs,
      { kind: "text", title, bytes: encode(text), companyId: input.companyId, filedOn: input.filedOn, sourceUrl: input.sourceUrl, fetchedFrom: null },
      deps.newId,
    );
    return await finish(deps, documentId);
  } catch (error) {
    return actionFailure(error);
  }
}
