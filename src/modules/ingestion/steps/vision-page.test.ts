import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createFixtureLlm } from "@/lib/providers/fixture-llm";
import type { LlmPort, LlmRequest, LlmResult } from "@/lib/providers/llm";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch, type MemoryProposalsRepo } from "@/test/fakes/proposals-repo";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { EXTRACT_MAX_COMPLETION, GROQ_CAPS, IMAGE_TOKENS } from "../caps";
import { machineDocuments, type StepDeps } from "../deps";
import { estimateTokens } from "../governor";
import { IMAGE_NOT_STORED } from "../ocr-copy";
import { IMAGE_PROMPT_VERSION, IMAGE_SYSTEM_PROMPT, imageUserPrompt, type Extraction } from "../prompts";
import type { Step, StepContext } from "../types";
import { KEY_REFUSED, PAGE_NOT_STORED, PAGE_TOO_BIG } from "./extraction-shared";
import { visionPage } from "./vision-page";

const DOC = "33333333-3333-4333-8333-333333333333";
const T0 = Date.parse("2026-10-08T10:00:00Z");
const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const IMAGE_B64 = Buffer.from(IMAGE).toString("base64");
const OCR_TEXT = [
  "Consolidated Statement of Profit and Loss for the year ended March 31, 2026",
  "(Rs. in crore)",
  "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
  "Revenue from operations 1,284.00 1,102.00",
  "Finance costs 41.20 38.90",
  "Profit for the year 152.60 118.30",
].join("\n");
const EXTRACTION: Extraction = {
  page_kind: "pl", basis: "consolidated", unit_header: "(Rs. in crore)", current_header: "Year ended March 31, 2026", prior_header: "Year ended March 31, 2025",
  rows: [
    { label: "Revenue from operations", current_text: "1,284.00", prior_text: "1,102.00", line: "Revenue from operations 1,284.00 1,102.00" },
    { label: "Finance costs", current_text: "41.20", prior_text: "38.90", line: "Finance costs 41.20 38.90" },
  ],
};
const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };
const USAGE = { promptTokens: 2900, completionTokens: 400, totalTokens: 3300 };

type Setup = { documents: MemoryDocumentsRepo; proposals: MemoryProposalsRepo; usage: ReturnType<typeof createMemoryUsageRepo> };

function setup(over: { text?: string; path?: string | null; deleted?: boolean; kind?: "image" | "pdf" } = {}): Setup {
  const documents = createMemoryDocumentsRepo();
  const path = over.path === undefined ? `${DOC}.jpg` : over.path;
  documents.docs.set(DOC, {
    id: DOC, companyId: null, title: "Q2 table", kind: over.kind ?? "image", storagePath: path, sha256: "d".repeat(64), bytes: IMAGE.byteLength, pageCount: 1,
    status: "active", llmPageBudget: 20, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null,
    originalDeletedAt: over.deleted ? new Date(T0).toISOString() : null, transcriptStatus: null, createdAt: new Date(T0).toISOString(),
  });
  const text = over.text ?? OCR_TEXT;
  documents.pages.set(`${DOC}:1`, {
    documentId: DOC, pageNo: 1, text, charCount: text.length, isScan: text.trim().length < 50, kind: null, basis: null, score: 0, selected: false, selectedBy: null, ocr: true,
  });
  if (path) documents.files.set(path, IMAGE);
  return { documents, proposals: createMemoryProposalsRepo(), usage: createMemoryUsageRepo() };
}

function ctx(s: Setup, llm: LlmPort | null, step: Partial<Step> = {}): StepContext {
  const deps: StepDeps = {
    llm,
    ocr: null,
    transcriber: null,
    models: { text: "test-text", vision: "test-vision", classify: "test-classify", whisper: "test-whisper" },
    repos: { documents: machineDocuments(s.documents), usage: s.usage, proposals: s.proposals, research: createMemoryResearch(), digests: createMemoryDigestsRepo() },
    now: () => new Date(T0),
    clock: () => T0,
  };
  const full: Step = {
    id: "step-1", jobId: "job-1", kind: "vision_page", pageNo: 1, args: {}, status: "running", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "owner", lastError: null, ...step,
  };
  return { step: full, documentId: DOC, deadline: T0 + 240_000, deps };
}

function fake(result: LlmResult<unknown>) {
  const complete = vi.fn<(req: LlmRequest<unknown>) => Promise<LlmResult<unknown>>>(async () => result);
  return { llm: { name: "fixture", complete } as unknown as LlmPort, complete };
}
const ok = (data: Extraction = EXTRACTION): LlmResult<unknown> => ({ kind: "ok", data, usage: USAGE, rate: NO_RATE });

describe("vision_page: the request", () => {
  it("sends the one image with the image prompt and nothing of the OCR text, on the vision model, without a reasoning effort", async () => {
    const { llm, complete } = fake(ok());
    const out = await visionPage(ctx(setup(), llm));
    expect(out.kind).toBe("done");
    expect(complete).toHaveBeenCalledTimes(1);
    const req = complete.mock.calls[0][0];
    expect(req.model).toBe("test-vision");
    expect(req.system).toBe(IMAGE_SYSTEM_PROMPT);
    expect(req.user).toBe(imageUserPrompt(1));
    expect(req.image).toEqual({ mime: "image/jpeg", base64: IMAGE_B64 });
    expect(Array.isArray(req.image)).toBe(false);
    expect(req.reasoningEffort).toBeUndefined();
    expect(`${req.system}${req.user}`).not.toContain("Revenue from operations"); // the OCR text is for the check afterwards (ruling R14)
  });

  it("takes the mime type from the stored path", async () => {
    for (const [ext, mime] of [["png", "image/png"], ["webp", "image/webp"]] as const) {
      const { llm, complete } = fake(ok());
      await visionPage(ctx(setup({ path: `${DOC}.${ext}` }), llm));
      expect(complete.mock.calls[0][0].image?.mime).toBe(mime);
    }
  });

  it("reserves the text, the 2,048 image tokens and the completion cap, and one call fits the minute allowance", async () => {
    const s = setup();
    const { llm } = fake(ok());
    await visionPage(ctx(s, llm));
    const estimate = estimateTokens(IMAGE_SYSTEM_PROMPT, imageUserPrompt(1), EXTRACT_MAX_COMPLETION) + IMAGE_TOKENS;
    expect(s.usage.reservations).toEqual([{ id: "res-1", bucket: "test-vision", tokens: estimate, settled: { used: 3300, status: "used" } }]);
    expect(IMAGE_TOKENS).toBe(2_048);
    expect(estimate).toBeGreaterThan(2_048 + EXTRACT_MAX_COMPLETION);
    expect(estimate).toBeLessThanOrEqual(GROQ_CAPS.tpm); // ruling R14: never "too big for the free allowance"
  });

  it("a retry names what was wrong with the first answer", async () => {
    const { llm, complete } = fake(ok());
    await visionPage(ctx(setup(), llm, { schemaFailures: 1, lastError: "rows.0.label: Required" }));
    expect(complete.mock.calls[0][0].system).toContain("Your previous answer was rejected: rows.0.label: Required");
  });
});

describe("vision_page: what it writes", () => {
  it("checks every value and quote against the OCR text: the figures the reader found are clean, the ones it missed are flagged", async () => {
    const legible = [
      "Consolidated Statement of Profit and Loss for the year ended March 31, 2026",
      "(Rs. in crore)",
      "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
      "Revenue from operations 1,284.00 1,102.00",
    ].join("\n");
    const s = setup({ text: legible });
    const { llm } = fake(ok());
    const out = await visionPage(ctx(s, llm));
    expect(out).toEqual({ kind: "done", result: { proposals: 2, flagged: 1, tokens: 3300 } });
    const byLabel = Object.fromEntries(s.proposals.proposals.map((p) => [p.machineValue.label, p.flags]));
    expect(byLabel["Revenue from operations"]).not.toContain("value_not_on_page");
    expect(byLabel["Finance costs"]).toContain("value_not_on_page"); // "the honest outcome for a photo"
    expect(s.proposals.extractions).toHaveLength(1);
    expect(s.proposals.extractions[0]).toMatchObject({ documentId: DOC, pageNo: 1, model: "test-vision", promptVersion: IMAGE_PROMPT_VERSION });
    expect(s.proposals.proposals.every((p) => p.machineValue.page === 1 && p.machineValue.locator === "p. 1")).toBe(true);
  });

  it("a photo the reader could not read at all still gets its figures, every one flagged", async () => {
    const s = setup({ text: "" });
    const out = await visionPage(ctx(s, fake(ok()).llm));
    expect(out).toMatchObject({ kind: "done", result: { proposals: 2, flagged: 2 } });
    expect(s.proposals.proposals.every((p) => p.flags.includes("value_not_on_page"))).toBe(true);
  });

  it("caches on the sha-256 of the image bytes under the image prompt version: a second read of the same photo makes no call", async () => {
    const s = setup();
    const first = fake(ok());
    await visionPage(ctx(s, first.llm));
    expect(s.proposals.extractions[0].inputHash).toBe(createHash("sha256").update(IMAGE).digest("hex"));
    const second = fake(ok());
    const out = await visionPage(ctx(s, second.llm));
    expect(second.complete).not.toHaveBeenCalled();
    expect(out).toMatchObject({ kind: "done", result: { tokens: 0, cached: true } });
    // The text-page prompt version is a different key: a page of text with the same hash would not be reused for a picture.
    expect(IMAGE_PROMPT_VERSION).toBe("extract-image-v1");
  });

  it("runs end to end on the fixture adapter, which finds the image prompt", async () => {
    const s = setup({ text: OCR_TEXT });
    const out = await visionPage(ctx(s, createFixtureLlm()));
    expect(out).toMatchObject({ kind: "done", result: { proposals: 3, flagged: 0 } });
  });
});

describe("vision_page: waits, refusals and failures", () => {
  it("defers 6 hours with AI off", async () => {
    expect(await visionPage(ctx(setup(), null))).toEqual({ kind: "defer", notBefore: new Date(T0 + 6 * 3_600_000), reason: "ai_off" });
  });

  it("needs attention when the page, the document or the file is gone, or the document is not a photo", async () => {
    const { llm, complete } = fake(ok());
    expect(await visionPage(ctx(setup(), llm, { pageNo: 9 }))).toEqual({ kind: "attention", error: PAGE_NOT_STORED });
    expect(await visionPage(ctx(setup({ kind: "pdf" }), llm))).toEqual({ kind: "attention", error: PAGE_NOT_STORED });
    expect(await visionPage(ctx(setup({ deleted: true }), llm))).toEqual({ kind: "attention", error: IMAGE_NOT_STORED });
    expect(await visionPage(ctx(setup({ path: null }), llm))).toEqual({ kind: "attention", error: IMAGE_NOT_STORED });
    expect(complete).not.toHaveBeenCalled();
  });

  it("defers, never fails, when the day or the minute allowance is spent", async () => {
    const s = setup();
    s.usage.reserve = async () => ({ ok: false, notBefore: new Date(T0 + 60_000), reason: "groq_minute" });
    const { llm, complete } = fake(ok());
    expect(await visionPage(ctx(s, llm))).toEqual({ kind: "defer", notBefore: new Date(T0 + 60_000), reason: "groq_minute" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("a rate limit blocks the bucket and defers; a provider error retries; an invalid answer retries as a schema failure", async () => {
    const limited = await visionPage(ctx(setup(), fake({ kind: "rate_limited", rate: { ...NO_RATE, retryAfterSeconds: 30 } }).llm));
    expect(limited).toEqual({ kind: "defer", notBefore: new Date(T0 + 30_000), reason: "groq_minute" });
    expect(await visionPage(ctx(setup(), fake({ kind: "provider_error", status: 503, message: "unavailable", rate: NO_RATE }).llm))).toEqual({
      kind: "retry", failure: "provider", error: "503 unavailable",
    });
    expect(await visionPage(ctx(setup(), fake({ kind: "invalid", raw: "", issues: ["rows: Required"], usage: null, rate: NO_RATE }).llm))).toEqual({
      kind: "retry", failure: "schema", error: "rows: Required",
    });
  });

  it("a refused request is a sentence for Aksh, not a retry", async () => {
    expect(await visionPage(ctx(setup(), fake({ kind: "rejected", status: 401, message: "invalid_api_key", rate: NO_RATE }).llm))).toEqual({ kind: "attention", error: KEY_REFUSED });
    expect(await visionPage(ctx(setup(), fake({ kind: "rejected", status: 413, message: "request_too_large", rate: NO_RATE }).llm))).toEqual({ kind: "attention", error: PAGE_TOO_BIG });
  });

  it("is idempotent: a duplicate run adds neither a second proposal nor a new key", async () => {
    const s = setup();
    await visionPage(ctx(s, fake(ok()).llm));
    await visionPage(ctx(s, fake(ok()).llm));
    expect(s.proposals.proposals).toHaveLength(2);
  });
});
