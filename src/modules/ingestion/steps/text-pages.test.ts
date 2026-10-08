import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { TEXT_PAGES_PER_STEP } from "../caps";
import { machineDocuments, type StepDeps } from "../deps";
import type { Step, StepContext } from "../types";
import { TEXT_EMPTY, TEXT_NOT_STORED, TEXT_WRONG_FILE, textPages } from "./text-pages";

const DOC = "22222222-2222-4222-8222-222222222222";
const PATH = `${DOC}.txt`;
const T0 = Date.parse("2026-10-08T10:00:00Z");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const enc = (text: string) => new TextEncoder().encode(text);

function repoWith(bytes: Uint8Array, over: { sha256?: string; kind?: "text" | "url" | "pdf"; originalDeletedAt?: string | null; pageCount?: number | null } = {}): MemoryDocumentsRepo {
  const repo = createMemoryDocumentsRepo();
  repo.docs.set(DOC, {
    id: DOC, companyId: null, title: "Pasted results", kind: over.kind ?? "text", storagePath: PATH, sha256: over.sha256 ?? sha(bytes),
    bytes: bytes.byteLength, pageCount: over.pageCount ?? null, status: "active", llmPageBudget: 20, basis: "consolidated",
    sourceType: "Annual report", filedOn: null, sourceUrl: null, originalDeletedAt: over.originalDeletedAt ?? null, transcriptStatus: null,
    createdAt: new Date(T0).toISOString(),
  });
  repo.files.set(PATH, bytes);
  return repo;
}

function ctx(repo: MemoryDocumentsRepo, step: Partial<Step> = {}): StepContext {
  const deps: StepDeps = {
    llm: null, ocr: null, transcriber: null,
    models: { text: "t", vision: "v", classify: "c", whisper: "w" },
    repos: { documents: machineDocuments(repo), usage: createMemoryUsageRepo(), proposals: createMemoryProposalsRepo(), research: createMemoryResearch(), digests: createMemoryDigestsRepo() },
    now: () => new Date(T0),
    clock: () => T0,
  };
  const full: Step = {
    id: "s", jobId: "j", kind: "text_pages", pageNo: 1, args: {}, status: "running", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "o", lastError: null, ...step,
  };
  return { step: full, documentId: DOC, deadline: T0 + 240_000, deps };
}

const LINE = "Revenue from operations 1,284.00 1,102.00\n";
const pageNos = (repo: MemoryDocumentsRepo) => [...repo.pages.values()].map((p) => p.pageNo).sort((a, b) => a - b);

describe("text_pages", () => {
  it("stores a short text as page 1, records the page count and hands over to select_pages", async () => {
    const repo = repoWith(enc(`Quarterly results\n${LINE}Finance costs 41.20 38.90`));
    const outcome = await textPages(ctx(repo));
    expect(outcome).toEqual({ kind: "done", result: { from: 1, through: 1 }, enqueue: [{ kind: "select_pages", pageNo: null }] });
    expect(repo.docs.get(DOC)?.pageCount).toBe(1);
    expect(repo.pages.get(`${DOC}:1`)?.text).toBe(`Quarterly results\n${LINE}Finance costs 41.20 38.90`);
    expect(repo.pages.get(`${DOC}:1`)?.isScan).toBe(false);
  });

  it("works on a fetched web page too (kind url)", async () => {
    const repo = repoWith(enc(`Results page\n${LINE}`), { kind: "url" });
    expect((await textPages(ctx(repo))).kind).toBe("done");
    expect(pageNos(repo)).toEqual([1]);
  });

  it("makes one page per about 8,000 characters", async () => {
    const repo = repoWith(enc(LINE.repeat(600))); // 24,600 characters
    const outcome = await textPages(ctx(repo));
    expect(outcome).toEqual({ kind: "done", result: { from: 1, through: 4 }, enqueue: [{ kind: "select_pages", pageNo: null }] });
    expect(pageNos(repo)).toEqual([1, 2, 3, 4]);
    for (const p of repo.pages.values()) expect(p.text.length).toBeLessThanOrEqual(8_050);
    expect(repo.docs.get(DOC)?.pageCount).toBe(4);
  });

  it("writes TEXT_PAGES_PER_STEP pages a step and enqueues itself from the next page, then carries on from there", async () => {
    const repo = repoWith(enc(LINE.repeat(300 * (TEXT_PAGES_PER_STEP + 3)))); // 28 pages
    const first = await textPages(ctx(repo));
    expect(first).toEqual({ kind: "done", result: { from: 1, through: TEXT_PAGES_PER_STEP }, enqueue: [{ kind: "text_pages", pageNo: TEXT_PAGES_PER_STEP + 1 }] });
    expect(pageNos(repo)).toHaveLength(TEXT_PAGES_PER_STEP);
    const second = await textPages(ctx(repo, { pageNo: TEXT_PAGES_PER_STEP + 1 }));
    expect(second.kind).toBe("done");
    expect(second).toMatchObject({ enqueue: [{ kind: "select_pages", pageNo: null }] });
    expect(pageNos(repo)).toHaveLength(repo.docs.get(DOC)?.pageCount ?? -1);
  });

  it("enqueues select_pages without writing when its page is past the end", async () => {
    const repo = repoWith(enc(LINE), { pageCount: 1 });
    const outcome = await textPages(ctx(repo, { pageNo: 5 }));
    expect(outcome).toEqual({ kind: "done", result: { from: 5, through: 4 }, enqueue: [{ kind: "select_pages", pageNo: null }] });
    expect(repo.pages.size).toBe(0);
  });

  it("is idempotent: a second run leaves the pages as they were", async () => {
    const repo = repoWith(enc(LINE.repeat(600)));
    await textPages(ctx(repo));
    const first = repo.pages.get(`${DOC}:2`);
    await textPages(ctx(repo));
    expect(pageNos(repo)).toEqual([1, 2, 3, 4]);
    expect(repo.pages.get(`${DOC}:2`)).toBe(first);
  });

  it("sends a stored text that is not the one added to needs attention", async () => {
    const repo = repoWith(enc(LINE), { sha256: "f".repeat(64) });
    expect(await textPages(ctx(repo))).toEqual({ kind: "attention", error: TEXT_WRONG_FILE });
    expect(repo.pages.size).toBe(0);
  });

  it("sends bytes that are not valid text to needs attention", async () => {
    const bad = new Uint8Array([0xff, 0xfe, 0x41, 0x80]);
    expect(await textPages(ctx(repoWith(bad)))).toEqual({ kind: "attention", error: TEXT_WRONG_FILE });
  });

  it("says so when the original is gone, the document is not text, or the text is empty", async () => {
    expect(await textPages(ctx(repoWith(enc(LINE), { originalDeletedAt: "2026-10-08T00:00:00Z" })))).toEqual({ kind: "attention", error: TEXT_NOT_STORED });
    expect(await textPages(ctx(repoWith(enc(LINE), { kind: "pdf" })))).toEqual({ kind: "attention", error: TEXT_NOT_STORED });
    expect(await textPages(ctx(repoWith(enc(" \n ")))) ).toEqual({ kind: "attention", error: TEXT_EMPTY });
  });

  it("reads multi-byte text (rupee signs, accents) intact", async () => {
    const repo = repoWith(enc("Revenue ₹1,284 crore, café margin 12.5%"));
    await textPages(ctx(repo));
    expect(repo.pages.get(`${DOC}:1`)?.text).toBe("Revenue ₹1,284 crore, café margin 12.5%");
  });
});
