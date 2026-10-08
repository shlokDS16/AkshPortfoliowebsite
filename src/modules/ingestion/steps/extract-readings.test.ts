import { describe, expect, it } from "vitest";
import { createFixtureLlm } from "@/lib/providers/fixture-llm";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { machineDocuments, type StepDeps } from "../deps";
import type { Step, StepContext } from "../types";
import { extractPage } from "./extract-page";

// Reading proposals from a read page (Plan 2b Task 8, R4 and carry c): the file's tests that name a metric get a reading when the page
// prints that figure in the test's unit; the rows go in under (document, page, test, pass).

const DOC = "11111111-1111-4111-8111-111111111111";
const COMPANY = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const T0 = Date.parse("2026-10-08T10:00:00Z");
const PL_TEXT = [
  "Consolidated Statement of Profit and Loss for the year ended March 31, 2026",
  "(Rs. in crore)",
  "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
  "Revenue from operations 1,284.00 1,102.00",
  "Finance costs 41.20 38.90",
  "Profit for the year 152.60 118.30",
].join("\n");

const test = (id: string, metric: string | null, unit = "₹ cr") => ({
  id, current: null, unit, readingAsOf: null, lastChecked: "2026-10-08", status: "no_data", min: 0, max: 5000, threshold: 1000, direction: "above", prior: null, metric,
});
const file = (tests: unknown[]) => ({
  schema: "casefile/1", oneLiner: null, sources: [], facts: [], tests, exhibits: [], readFirst: [], scenario: null,
});

function run(tests: unknown[], step: Partial<Step> = {}, companyId: string | null = COMPANY) {
  const documents = createMemoryDocumentsRepo();
  documents.docs.set(DOC, {
    id: DOC, companyId, title: "Kaveri annual report", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: "a".repeat(64), bytes: 10, pageCount: 6,
    status: "active", llmPageBudget: 20, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null, originalDeletedAt: null,
    transcriptStatus: null, createdAt: new Date(T0).toISOString(),
  });
  documents.pages.set(`${DOC}:4`, {
    documentId: DOC, pageNo: 4, text: PL_TEXT, charCount: PL_TEXT.length, isScan: false, kind: "pl", basis: "consolidated", score: 9, selected: true, selectedBy: "rule", ocr: false,
  });
  const proposals = createMemoryProposalsRepo();
  const research = createMemoryResearch({ [COMPANY]: { itemId: ITEM, title: "Kaveri", structured: file(tests) } });
  const deps: StepDeps = {
    llm: createFixtureLlm(), ocr: null, transcriber: null, models: { text: "m", vision: "v", classify: "c", whisper: "w" },
    repos: { documents: machineDocuments(documents), usage: createMemoryUsageRepo(), proposals, research, digests: createMemoryDigestsRepo() },
    now: () => new Date(T0), clock: () => T0,
  };
  const full: Step = {
    id: "s", jobId: "j", kind: "extract_page", pageNo: 4, pass: 1, args: {}, status: "running", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "o", lastError: null, ...step,
  };
  const ctx: StepContext = { step: full, documentId: DOC, deadline: T0 + 240_000, deps };
  return { ctx, proposals, again: (over: Partial<Step>) => extractPage({ ...ctx, step: { ...full, ...over } }) };
}

describe("extract_page: reading proposals", () => {
  it("proposes the reading of a test whose metric the page prints, in the test's unit, beside the figures", async () => {
    const r = run([test("T1", "Revenue from operations")]);
    await extractPage(r.ctx);
    expect(r.proposals.proposals.map((p) => p.machineValue.label)).toContain("Revenue from operations");
    expect(r.proposals.readings).toEqual([
      {
        documentId: DOC, pageNo: 4, extractionId: "ext-1", itemIdHint: ITEM, testId: "T1", pass: 1,
        machineValue: expect.objectContaining({ current: 1284, readingAsOf: "2026-03-31", prior: 1102, unit: "₹ cr", label: "Revenue from operations", page: 4 }),
      },
    ]);
  });

  it("proposes nothing for a test with no metric, a different unit, a label the page lacks, or a figure that is flagged", async () => {
    const r = run([test("T1", null), test("T2", "Revenue from operations", "days"), test("T3", "Order book"), test("T4", "Finance costs")]);
    await extractPage(r.ctx);
    expect(r.proposals.readings).toEqual([]); // Finance costs is flagged by the fixture (41.70 is not on the page)
  });

  it("proposes nothing when the document has no company or the file has no tests", async () => {
    const none = run([test("T1", "Revenue from operations")], {}, null);
    await extractPage(none.ctx);
    expect(none.proposals.readings).toEqual([]);
    const empty = run([]);
    await extractPage(empty.ctx);
    expect(empty.proposals.readings).toEqual([]);
  });

  it("a rerun of the same pass keeps the first reading; a re-read is a new pass with a row of its own (carry c)", async () => {
    const r = run([test("T1", "Revenue from operations")]);
    await extractPage(r.ctx);
    await extractPage(r.ctx);
    expect(r.proposals.readings.map((x) => x.pass)).toEqual([1]);
    await r.again({ pass: 2, args: { reread: true } });
    expect(r.proposals.readings.map((x) => [x.testId, x.pass])).toEqual([["T1", 1], ["T1", 2]]);
  });

  it("never changes the figures the step reports", async () => {
    const plain = run([]);
    const mapped = run([test("T1", "Revenue from operations")]);
    expect(await extractPage(mapped.ctx)).toEqual(await extractPage(plain.ctx));
  });
});
