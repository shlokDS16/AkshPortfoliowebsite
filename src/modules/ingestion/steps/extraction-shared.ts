import { createHash } from "node:crypto";
import { readCaseFile } from "@/modules/casefile/client";
import type { Basis, PageKind } from "@/modules/documents/client";
import { MAX_PROPOSALS_PER_DOCUMENT } from "../caps";
import type { Extraction } from "../prompts";
import { buildProposals } from "../proposals";
import { buildReadings, type ReadingTest } from "../readings";
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

/**
 * What the machine may read of the company's newest file: the labels of its facts (the relevance filter compares them) and the tests
 * that name a metric (a reading is proposed for each). Empty when there is no file; never Aksh's words.
 */
export async function fileOf(companyId: string | null, ctx: StepContext): Promise<{ itemId: string | null; labels: Set<string>; tests: ReadingTest[] }> {
  const file = companyId ? await ctx.deps.repos.research.latestFileForCompany(companyId) : null;
  if (!file) return { itemId: null, labels: new Set(), tests: [] };
  const read = readCaseFile(file.structured);
  return {
    itemId: file.itemId,
    labels: new Set(read.facts.map((f) => normaliseLabel(f.label))),
    tests: read.tests.map((t) => ({ id: t.id, metric: t.metric, unit: t.unit })),
  };
}

/** The sentence for a request the AI service will not take (bad key, too big, refused). */
export function rejection(status: number, message: string): string {
  if (status === 401 || status === 403) return KEY_REFUSED;
  if (status === 413 || /context|too_large|too large/i.test(message)) return PAGE_TOO_BIG;
  return REQUEST_REFUSED;
}

type Saved = { extraction: Extraction; pageNo: number; pageText: string; model: string; promptVersion: string; inputHash: string; tokens: number; have: number;
  /** The step's pass (job_steps.pass); a re-read (pass 2 or more) files its rows under keys of its own pass. */
  pass?: number; reread?: boolean };

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
  const file = await fileOf(doc.companyId, ctx);
  const all = buildProposals({
    extraction: s.extraction, pageNo: s.pageNo, pageText: s.pageText, pageKind: page.kind ?? s.extraction.page_kind, pageBasis: page.basis, docBasis: doc.basis,
    fileLabels: file.labels,
  }).sort((a, b) => RANK[a.reason] - RANK[b.reason]);
  const built = all.slice(0, Math.max(0, MAX_PROPOSALS_PER_DOCUMENT - s.have));
  await proposals.insertProposals(
    built.map((p) => ({ documentId: doc.id, pageNo: s.pageNo, extractionId, dedupeKey: s.reread ? `${p.dedupeKey}|r${s.pass ?? 1}` : p.dedupeKey, machineValue: p.machineValue, flags: p.flags, reason: p.reason })),
  );
  // The test readings come from every figure the page printed, not only those the cap kept: they are a separate table with no cap.
  await proposals.insertReadings(
    buildReadings(all, file.tests).map((r) => ({
      documentId: doc.id, pageNo: s.pageNo, extractionId, itemIdHint: file.itemId, testId: r.testId, machineValue: r.machine, pass: s.pass ?? 1,
    })),
  );
  return { built: built.length, flagged: built.filter((p) => p.flags.length > 0).length };
}
