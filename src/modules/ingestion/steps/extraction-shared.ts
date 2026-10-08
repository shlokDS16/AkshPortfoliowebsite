import { createHash } from "node:crypto";
import { readCaseFile } from "@/modules/casefile/client";
import type { Basis, PageKind } from "@/modules/documents/client";
import { MAX_PROPOSALS_PER_DOCUMENT } from "../caps";
import type { Extraction } from "../prompts";
import { buildProposals } from "../proposals";
import { normaliseLabel } from "../relevance";
import type { StepContext } from "../types";

// What extract_page (a digital page) and vision_page (a photo) share: the sentences for a refused request, the file's
// labels for the relevance filter, and the write of an extraction with its checked proposals. The machine writes an
// extraction and pending proposals and nothing else; every value and quote is checked against the stored page text.

export const PAGE_TOO_BIG = "This page is too big for the free AI allowance. Enter the figures yourself.";
export const PAGE_NOT_STORED = "This page is no longer stored, so it cannot be read. Choose Skip, or Try again.";
export const KEY_REFUSED = "The AI service did not accept the desk's key. Check the Groq key in the settings, then try again.";
export const REQUEST_REFUSED = "The AI service refused to read this page. Enter the figures yourself.";
/** The most of a model's complaint kept in a step's last_error. */
export const ISSUES_MAX = 400;

/** When the document cap leaves room for only some of a page, core lines go first, then tracked labels, then movers. */
const RANK = { core: 0, label_match: 1, moved: 2 } as const;

export const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** The labels of the company's newest file, as the relevance filter compares them (empty when there is no file). */
export async function fileLabelsFor(companyId: string | null, ctx: StepContext): Promise<Set<string>> {
  if (!companyId) return new Set();
  const file = await ctx.deps.repos.research.latestFileForCompany(companyId);
  return file ? new Set(readCaseFile(file.structured).facts.map((f) => normaliseLabel(f.label))) : new Set();
}

/** The sentence for a request the AI service will not take (bad key, too big, refused). */
export function rejection(status: number, message: string): string {
  if (status === 401 || status === 403) return KEY_REFUSED;
  if (status === 413 || /context|too_large|too large/i.test(message)) return PAGE_TOO_BIG;
  return REQUEST_REFUSED;
}

type Saved = { extraction: Extraction; pageNo: number; pageText: string; model: string; promptVersion: string; inputHash: string; tokens: number; have: number };

/**
 * Writes the extraction row and the pending proposals built from it. Idempotent: a duplicate step inserts the same rows once
 * (dedupe keys). Returns how many proposals were built and how many carry a flag.
 */
export async function saveExtraction(
  ctx: StepContext,
  doc: { id: string; companyId: string | null; basis: Basis },
  page: { kind: PageKind | null; basis: Basis | null },
  s: Saved,
): Promise<{ built: number; flagged: number }> {
  const { proposals } = ctx.deps.repos;
  const extractionId = await proposals.insertExtraction({
    documentId: doc.id, pageNo: s.pageNo, model: s.model, promptVersion: s.promptVersion, inputHash: s.inputHash, output: s.extraction, tokensUsed: s.tokens,
  });
  const built = buildProposals({
    extraction: s.extraction, pageNo: s.pageNo, pageText: s.pageText, pageKind: page.kind ?? s.extraction.page_kind, pageBasis: page.basis, docBasis: doc.basis,
    fileLabels: await fileLabelsFor(doc.companyId, ctx),
  })
    .sort((a, b) => RANK[a.reason] - RANK[b.reason])
    .slice(0, MAX_PROPOSALS_PER_DOCUMENT - s.have);
  await proposals.insertProposals(
    built.map((p) => ({ documentId: doc.id, pageNo: s.pageNo, extractionId, dedupeKey: p.dedupeKey, machineValue: p.machineValue, flags: p.flags, reason: p.reason })),
  );
  return { built: built.length, flagged: built.filter((p) => p.flags.length > 0).length };
}
