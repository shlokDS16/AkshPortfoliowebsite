import { describe, expect, it, vi } from "vitest";
import { createFixtureLlm } from "@/lib/providers/fixture-llm";
import { createLinkFetchDeps, DocumentError, safeFetch, TEXT_MAX_CHARS, TEXT_MIN_CHARS, type FetchedLink } from "@/modules/documents";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { READABLE_CHARS, TEXT_PAGE_CHARS } from "./caps";
import { machineDocuments, type StepDeps } from "./deps";
import { runStartLink, runStartText, type LinkFlowDeps } from "./link-flow";
import type { QueueRepo } from "./queue-repo";
import { extractPage } from "./steps/extract-page";
import { selectPagesStep } from "./steps/select-pages";
import { textPages } from "./steps/text-pages";
import type { NewStep, Step, StepContext } from "./types";

const ID = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const COMPANY = "9f1d2c3b-4a59-4e8d-b7c6-a1b2c3d4e5f6";
const T0 = Date.parse("2026-10-08T10:00:00Z");
const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const FIXTURE_NET = createLinkFetchDeps({ LLM_ADAPTER: "fixture" });

function setup(fetchLink: LinkFlowDeps["fetchLink"] = (link) => safeFetch(link, FIXTURE_NET)) {
  const docs = createMemoryDocumentsRepo();
  const jobs: { documentId: string; kind: string; first: NewStep }[] = [];
  const queue: QueueRepo = {
    claim: async () => null,
    finish: async () => true,
    enqueue: async () => undefined,
    createJob: async (documentId, kind, first) => (jobs.push({ documentId, kind, first }), "job-1"),
  };
  const deps: LinkFlowDeps = { docs, queue, fetchLink, newId: () => ID };
  return { docs, jobs, deps };
}

const fetched = (contentType: string, body: string | Uint8Array): FetchedLink => ({ contentType, bytes: typeof body === "string" ? enc(body) : body, finalUrl: "https://example.test/files/Q1-results.pdf" });
const TABLE = "Quarterly results table RUN1\nRevenue from operations 412.60 371.20\nFinance costs 12.40 13.10\nProfit for the quarter 38.90 31.50";

describe("runStartLink: a BSE-style PDF link becomes a pdf document", () => {
  it("fetches the PDF, stores it as <id>.pdf through the upload checks, keeps the link, and queues pdf_text from page 1", async () => {
    const { docs, jobs, deps } = setup();
    const result = await runStartLink(deps, { url: "https://bse.test/RUN1-result.pdf", companyId: COMPANY, filedOn: "2026-10-01" });
    expect(result).toEqual({ ok: true, documentId: ID });
    expect(docs.docs.get(ID)).toMatchObject({
      kind: "pdf", storagePath: `${ID}.pdf`, status: "active", companyId: COMPANY, filedOn: "2026-10-01", title: "RUN1 result",
      sourceUrl: "https://bse.test/RUN1-result.pdf",
    });
    expect(docs.fetchedFrom.get(ID)).toBe("https://bse.test/RUN1-result.pdf");
    expect(docs.objects.get(`${ID}.pdf`)?.mimetype).toBe("application/pdf");
    expect(dec(docs.files.get(`${ID}.pdf`)!.subarray(0, 5))).toBe("%PDF-");
    expect(jobs).toEqual([{ documentId: ID, kind: "ingest_pdf", first: { kind: "pdf_text", pageNo: 1 } }]);
  });

  it("takes a PDF that the server calls octet-stream, by its first bytes", async () => {
    const { docs, deps } = setup(async () => fetched("application/octet-stream", "%PDF-1.4\nbody"));
    expect(await runStartLink(deps, { url: "https://example.test/d", companyId: null, filedOn: null })).toEqual({ ok: true, documentId: ID });
    expect(docs.docs.get(ID)?.kind).toBe("pdf");
  });

  it("refuses octet-stream bytes that are not a PDF, and a PDF type with a different body", async () => {
    for (const body of [fetched("application/octet-stream", "MZ not a pdf"), fetched("application/pdf", "<html>Access denied</html>")]) {
      const { docs, jobs, deps } = setup(async () => body);
      expect(await runStartLink(deps, { url: "https://example.test/d", companyId: null, filedOn: null })).toMatchObject({ ok: false, code: "link-unsupported" });
      expect(docs.docs.size).toBe(0);
      expect(jobs).toEqual([]);
    }
  });

  it("refuses the same PDF again as a duplicate and names the earlier one", async () => {
    const { docs, deps } = setup();
    await runStartLink(deps, { url: "https://bse.test/RUN2.pdf", companyId: null, filedOn: null });
    const again = await runStartLink({ ...deps, newId: () => "other" }, { url: "https://bse.test/RUN2.pdf", companyId: null, filedOn: null });
    expect(again).toMatchObject({ ok: false, code: "upload-duplicate", earlier: { id: ID } });
    expect(docs.docs.size).toBe(1);
  });
});

describe("runStartLink: a web page becomes a url document", () => {
  it("reduces the page to its visible text, stores <id>.txt with the page's title, and queues text_pages from page 1", async () => {
    const { docs, jobs, deps } = setup();
    const result = await runStartLink(deps, { url: "https://results.test/q/RUN3", companyId: null, filedOn: null });
    expect(result).toEqual({ ok: true, documentId: ID });
    const stored = dec(docs.files.get(`${ID}.txt`)!);
    expect(stored).toContain("Quarterly results table RUN3");
    expect(stored).toContain("Revenue from operations 412.60 371.20");
    expect(stored).toContain("Particulars Quarter ended June 30, 2026 Quarter ended June 30, 2025");
    expect(stored).not.toMatch(/9,999|color: red|<table|<td/); // the script and style are gone, and so are the tags
    expect(docs.docs.get(ID)).toMatchObject({ kind: "url", storagePath: `${ID}.txt`, title: "Quarterly results RUN3", sourceUrl: "https://results.test/q/RUN3", status: "active" });
    expect(docs.fetchedFrom.get(ID)).toBe("https://results.test/q/RUN3");
    expect(docs.objects.get(`${ID}.txt`)?.mimetype).toBe("text/plain");
    expect(jobs).toEqual([{ documentId: ID, kind: "ingest_url", first: { kind: "text_pages", pageNo: 1 } }]);
  });

  it("follows a redirect to the page; the link kept is the one Aksh pasted", async () => {
    const { docs, deps } = setup();
    expect(await runStartLink(deps, { url: "https://redirect.test/go/RUN4", companyId: null, filedOn: null })).toEqual({ ok: true, documentId: ID });
    expect(docs.docs.get(ID)?.sourceUrl).toBe("https://redirect.test/go/RUN4");
    expect(docs.docs.get(ID)?.title).toBe("Quarterly results RUN4");
  });

  it("stores a plain-text answer as a url document, titled from the link", async () => {
    const { docs, deps } = setup(async () => fetched("text/plain", "Results for the quarter\r\nRevenue from operations 412.60 371.20 and more words to pass fifty."));
    expect(await runStartLink(deps, { url: "https://example.test/files/Q1-results.txt", companyId: null, filedOn: null })).toEqual({ ok: true, documentId: ID });
    expect(docs.docs.get(ID)).toMatchObject({ kind: "url", title: "Q1 results" });
    expect(dec(docs.files.get(`${ID}.txt`)!)).toBe("Results for the quarter\nRevenue from operations 412.60 371.20 and more words to pass fifty.");
  });

  it.each([
    ["an image", fetched("image/png", new Uint8Array(100)), "link-unsupported"],
    ["JSON", fetched("application/json", "{}"), "link-unsupported"],
    ["a page with only scripts", fetched("text/html", "<html><script>var a = 1;</script></html>"), "link-empty"],
    ["a page with a line of text", fetched("text/html", "<p>Hello</p>"), "link-empty"],
    ["a page over the text limit", fetched("text/html", `<p>${"1,284.00 ".repeat(TEXT_MAX_CHARS / 8)}</p>`), "text-too-long"],
  ])("refuses %s, storing nothing", async (_what, answer, code) => {
    const { docs, jobs, deps } = setup(async () => answer);
    expect(await runStartLink(deps, { url: "https://example.test/x", companyId: null, filedOn: null })).toMatchObject({ ok: false, code });
    expect(docs.docs.size).toBe(0);
    expect(docs.objects.size).toBe(0);
    expect(jobs).toEqual([]);
  });
});

describe("runStartLink: a refused or failed fetch stores nothing and says why in fixed words", () => {
  it.each([
    ["a private address", "https://internal.test/a", "link-blocked"],
    ["an address written into the link", "https://127.0.0.1/a", "link-blocked"],
    ["http", "http://results.test/q/x", "link-invalid"],
    ["a password in the link", "https://u:p@results.test/q/x", "link-invalid"],
    ["a site that does not exist", "https://nowhere.example/x", "link-failed"],
    ["a page that is not there", "https://results.test/missing", "link-failed"],
  ])("%s", async (_what, url, code) => {
    const { docs, jobs, deps } = setup();
    const result = await runStartLink(deps, { url, companyId: null, filedOn: null });
    expect(result).toMatchObject({ ok: false, code });
    expect(JSON.stringify(result)).not.toMatch(/10\.0\.0\.5|127\.0\.0\.1|ENOTFOUND/);
    expect(docs.docs.size).toBe(0);
    expect(jobs).toEqual([]);
  });

  it("an unexpected failure is logged by shape only and shown as the fixed save-failed sentence", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deps } = setup(async () => {
      throw new Error("password=hunter2 at 10.0.0.9");
    });
    const result = await runStartLink(deps, { url: "https://example.test/x", companyId: null, filedOn: null });
    expect(result).toMatchObject({ ok: false, code: "save-failed" });
    expect(JSON.stringify([result, error.mock.calls])).not.toContain("hunter2");
  });

  it("a DocumentError from the fetch keeps its code", async () => {
    const { deps } = setup(async () => {
      throw new DocumentError("link-timeout");
    });
    expect(await runStartLink(deps, { url: "https://example.test/x", companyId: null, filedOn: null })).toMatchObject({ ok: false, code: "link-timeout" });
  });
});

describe("runStartText", () => {
  const text = (over: Partial<Parameters<typeof runStartText>[1]> = {}) => ({ text: TABLE, title: null, companyId: null, filedOn: null, sourceUrl: null, ...over });

  it("stores pasted text as <id>.txt exactly as pasted (line endings aside), titled from its first line, and queues text_pages", async () => {
    const { docs, jobs, deps } = setup();
    expect(await runStartText(deps, text({ text: `${TABLE.replace(/\n/g, "\r\n")}\r\n\r\n`, companyId: COMPANY, sourceUrl: "https://example.test/ir" }))).toEqual({ ok: true, documentId: ID });
    expect(dec(docs.files.get(`${ID}.txt`)!)).toBe(TABLE);
    expect(docs.docs.get(ID)).toMatchObject({ kind: "text", title: "Quarterly results table RUN1", companyId: COMPANY, sourceUrl: "https://example.test/ir", status: "active" });
    expect(docs.fetchedFrom.get(ID)).toBeNull();
    expect(jobs).toEqual([{ documentId: ID, kind: "ingest_text", first: { kind: "text_pages", pageNo: 1 } }]);
  });

  it("uses the title Aksh gave", async () => {
    const { docs, deps } = setup();
    await runStartText(deps, text({ title: "  Q1 table from the call  " }));
    expect(docs.docs.get(ID)?.title).toBe("Q1 table from the call");
  });

  it("refuses text that is too short or too long, storing nothing", async () => {
    const { docs, deps } = setup();
    expect(await runStartText(deps, text({ text: "  too short  " }))).toMatchObject({ ok: false, code: "text-too-short" });
    expect(await runStartText(deps, text({ text: "x".repeat(TEXT_MAX_CHARS + 1) }))).toMatchObject({ ok: false, code: "text-too-long" });
    expect((await runStartText(deps, text({ text: "x".repeat(TEXT_MAX_CHARS) }))).ok).toBe(true);
    expect(docs.docs.size).toBe(1);
  });

  it("refuses the same text again as a duplicate", async () => {
    const { docs, deps } = setup();
    await runStartText(deps, text());
    expect(await runStartText({ ...deps, newId: () => "other" }, text())).toMatchObject({ ok: false, code: "upload-duplicate", earlier: { id: ID } });
    expect(docs.docs.size).toBe(1);
  });
});

describe("pasted text of a results table yields proposals with the fixture LLM", () => {
  const stepCtx = (docs: ReturnType<typeof createMemoryDocumentsRepo>, proposals: ReturnType<typeof createMemoryProposalsRepo>, step: Partial<Step>): StepContext => {
    const deps: StepDeps = {
      llm: createFixtureLlm(), ocr: null, transcriber: null, models: { text: "t", vision: "v", classify: "c", whisper: "w" },
      repos: { documents: machineDocuments(docs), usage: createMemoryUsageRepo(), proposals, research: createMemoryResearch(), digests: createMemoryDigestsRepo() },
      now: () => new Date(T0), clock: () => T0,
    };
    const full: Step = { id: "s", jobId: "j", kind: "text_pages", pageNo: 1, args: {}, status: "running", schemaFailures: 0, providerFailures: 0, leaseExpiries: 0, notBefore: "", leaseOwner: "o", lastError: null, ...step };
    return { step: full, documentId: ID, deadline: T0 + 240_000, deps };
  };

  it.each([
    ["pasted text", async (deps: LinkFlowDeps) => runStartText(deps, { text: TABLE, title: null, companyId: null, filedOn: null, sourceUrl: null })],
    ["a web page", async (deps: LinkFlowDeps) => runStartLink(deps, { url: "https://results.test/q/RUN5", companyId: null, filedOn: null })],
  ])("%s: text_pages, then select_pages picks the table (no heading), then extract_page proposes the figures", async (_what, start) => {
    const { docs, deps } = setup();
    expect(await start(deps)).toEqual({ ok: true, documentId: ID });
    const proposals = createMemoryProposalsRepo();

    const pages = await textPages(stepCtx(docs, proposals, { kind: "text_pages", pageNo: 1 }));
    expect(pages).toMatchObject({ kind: "done", enqueue: [{ kind: "select_pages", pageNo: null }] });
    const selected = await selectPagesStep(stepCtx(docs, proposals, { kind: "select_pages", pageNo: null }));
    expect(selected).toMatchObject({ kind: "done", result: { selected: 1 }, enqueue: [{ kind: "extract_page", pageNo: 1 }] });
    expect(await extractPage(stepCtx(docs, proposals, { kind: "extract_page", pageNo: 1 }))).toMatchObject({ kind: "done" });

    const labels = proposals.proposals.map((p) => JSON.stringify(p.machineValue));
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(labels.join(" ")).toContain("412.60");
    expect(proposals.proposals.every((p) => p.documentId === ID && p.pageNo === 1)).toBe(true);
  });
});

describe("the numbers that must agree", () => {
  it("a text shorter than the documents module's minimum is the same as a page the database calls a scan", () => {
    expect(TEXT_MIN_CHARS).toBe(READABLE_CHARS);
  });

  it("the largest text fits in a bounded number of pages, well under the 5,000-page limit", () => {
    expect(Math.ceil(TEXT_MAX_CHARS / TEXT_PAGE_CHARS)).toBeLessThanOrEqual(30);
    expect(TEXT_PAGE_CHARS).toBe(8_000);
  });
});
