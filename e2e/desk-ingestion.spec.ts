import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseDocumentsRepo } from "@/modules/documents/repo";
import { finishUpload, startUpload } from "@/modules/documents/upload";
import { FIXTURE_OCR_TEXT } from "@/lib/providers/fixture-ocr";
import { machineDocuments } from "@/modules/ingestion/deps";
import { createQueueRepo } from "@/modules/ingestion/queue-repo";
import { makeFixturePdf } from "../scripts/make-fixture-pdf.mjs";
import { ensureUser, requireStack, tokenHashFor } from "./support/auth";
import { E2E_ADMIN_EMAIL, E2E_CRON_SECRET } from "./support/stack";

// The ingestion queue and the PDF steps on the LOCAL database with migration 0006's real grants: the admin's
// session creates the job (RLS), the secret key claims and finishes it (service_role), and the pump route runs the
// real pdf_text and select_pages handlers. The local database is not reset, so every file is made unique per run.
const RUN = Date.now().toString(36);
const FIXTURE = readFileSync("e2e/fixtures/annual-report.pdf");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** The fixture with a trailing PDF comment, so its hash is new on every run (pdf.js ignores bytes after %%EOF). */
const uniquePdf = (tag: string) => new Uint8Array(Buffer.concat([FIXTURE, Buffer.from(`% e2e ${RUN} ${tag}\n`, "latin1")]));

let admin: Db;
let service: Db;

test.beforeAll(async () => {
  const stack = requireStack();
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  admin = createClient<Database>(stack.apiUrl, stack.publishableKey, options);
  await ensureUser(stack, E2E_ADMIN_EMAIL); // a no-op after the setup project; lets this file run on its own
  const { error } = await admin.auth.verifyOtp({ token_hash: await tokenHashFor(stack, E2E_ADMIN_EMAIL), type: "magiclink" });
  if (error) throw error;
  service = createClient<Database>(stack.apiUrl, stack.secretKey, options);
});

/** Starts and finishes an upload the way the desk does; `claimed` is the hash the browser says it has. */
async function upload(bytes: Uint8Array, tag: string, claimed = sha256(bytes)): Promise<string> {
  const docs = createSupabaseDocumentsRepo(admin);
  const input = { kind: "pdf" as const, fileName: `e2e-${RUN}-${tag}.pdf`, bytes: bytes.byteLength, mime: "application/pdf", sha256: claimed, companyId: null, filedOn: null, sourceUrl: null };
  const started = await startUpload(docs, input, randomUUID);
  const put = await admin.storage.from("documents").uploadToSignedUrl(started.path, started.token, bytes, { contentType: "application/pdf" });
  if (put.error) throw put.error;
  expect((await finishUpload(docs, started.documentId)).status).toBe("active");
  return started.documentId;
}

/** Leaves nothing runnable behind: the job is cancelled, the document skipped and its original removed. */
async function cleanUp(documentId: string, jobId: string | null) {
  if (jobId) await admin.from("jobs").update({ cancelled_at: new Date().toISOString() }).eq("id", jobId);
  await admin.from("documents").update({ status: "skipped" }).eq("id", documentId);
  await admin.storage.from("documents").remove([`${documentId}.pdf`]);
}

async function pump(request: APIRequestContext) {
  const response = await request.post("/api/jobs/run", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(response.status()).toBe(200);
  expect((await response.json()).results).toContainEqual({ job: "ingestion:drain", ok: true });
}

const stepsOf = async (jobId: string) => {
  const { data, error } = await admin.from("job_steps").select("kind, page_no, status, result, last_error").eq("job_id", jobId).order("created_at").order("page_no");
  if (error) throw error;
  return data;
};

test("createJob, enqueue, claim and finish run on the real grants: admin session creates, secret key works the queue", async () => {
  const documentId = await upload(uniquePdf("queue"), "queue");
  let jobId: string | null = null;
  try {
    jobId = await createQueueRepo(admin).createJob(documentId, "ingest_pdf", { kind: "pdf_text", pageNo: 1 });
    expect(await createQueueRepo(admin).createJob(documentId, "ingest_pdf", { kind: "pdf_text", pageNo: 1 })).toBe(jobId); // the live job is reused
    // Put this job's step ahead of anything else runnable in the shared local queue.
    const early = await service.from("job_steps").update({ not_before: "2000-01-01T00:00:00Z" }).eq("job_id", jobId).select("id");
    expect(early.error).toBeNull();

    const queue = createQueueRepo(service);
    const owner = randomUUID();
    const step = await queue.claim(owner);
    expect(step).toMatchObject({ jobId, kind: "pdf_text", pageNo: 1, status: "running", leaseOwner: owner, documentId });

    await queue.enqueue(jobId, [{ kind: "select_pages", pageNo: null }]);
    await queue.enqueue(jobId, [{ kind: "select_pages", pageNo: null }]); // job_steps_once: a no-op
    expect(await queue.finish(step!, owner, { status: "done", result: { from: 1, through: 6 }, lastError: null })).toBe(true);
    expect(await queue.finish(step!, owner, { status: "done", result: null, lastError: null })).toBe(false); // the lease ended

    expect(await stepsOf(jobId)).toEqual([
      { kind: "pdf_text", page_no: 1, status: "done", result: { from: 1, through: 6 }, last_error: null },
      { kind: "select_pages", page_no: null, status: "queued", result: null, last_error: null },
    ]);
  } finally {
    await cleanUp(documentId, jobId);
  }
});

test("the machine's page methods hold under service_role: download, idempotent page insert, page count, verdicts, selection", async () => {
  const bytes = uniquePdf("pages");
  const documentId = await upload(bytes, "pages");
  try {
    const machine = machineDocuments(createSupabaseDocumentsRepo(service));
    expect(sha256(await machine.download(`${documentId}.pdf`))).toBe(sha256(bytes));
    const pages = [1, 2, 3].map((pageNo) => ({ pageNo, text: `Page ${pageNo} of run ${RUN}, long enough not to count as a scan page.` }));
    await machine.insertPages(documentId, pages);
    await machine.insertPages(documentId, [...pages, { pageNo: 4, text: "short" }]); // on conflict do nothing
    await machine.setPageCount(documentId, 4);
    expect((await machine.get(documentId))?.pageCount).toBe(4);
    expect(await machine.listPagesForSelection(documentId)).toEqual([...pages.map((p) => ({ ...p, isScan: false })), { pageNo: 4, text: "short", isScan: true }]);

    await machine.setVerdicts(documentId, [{ pageNo: 2, kind: "pl", basis: "consolidated", score: 112.5 }]);
    // Aksh unticks p. 3 first: the rule never overrides him.
    const untick = await admin.from("document_pages").update({ selected: false, selected_by: "aksh" }).eq("document_id", documentId).eq("page_no", 3);
    expect(untick.error).toBeNull();
    expect(await machine.setSelection(documentId, [2, 3], "rule")).toEqual([2]);
    expect(await machine.setSelection(documentId, [2, 3], "rule")).toEqual([2]); // a repeated run gives the same answer
    expect(await machine.getPage(documentId, 2)).toEqual({ ...pages[1], isScan: false, kind: "pl", basis: "consolidated", ocr: false, selected: true, selectedBy: "rule" });
    expect(await machine.countSelected(documentId)).toBe(1);

    // A scan page (p. 4, under 50 characters) is filled once by the scan reader's text; a page with text is not.
    await machine.fillScanPage(documentId, 4, "Statement of Profit and Loss. Revenue from operations 1,284.00 1,102.00 and more text.");
    expect(await machine.getPage(documentId, 4)).toMatchObject({ isScan: false, ocr: true });
    await expect(machine.fillScanPage(documentId, 4, "A second fill is refused by the database trigger, not by the code.")).rejects.toThrow();
    await expect(machine.fillScanPage(documentId, 2, "A page that already has text is not overwritten by a later read.")).rejects.toThrow();

    const { data } = await admin.from("document_pages").select("page_no, kind, basis, score, selected, selected_by").eq("document_id", documentId).order("page_no");
    expect(data?.slice(1, 3)).toEqual([
      { page_no: 2, kind: "pl", basis: "consolidated", score: 112.5, selected: true, selected_by: "rule" },
      { page_no: 3, kind: null, basis: null, score: 0, selected: false, selected_by: "aksh" },
    ]);
  } finally {
    await cleanUp(documentId, null);
  }
});

test("the pump reads an uploaded PDF's pages, selects its statement pages and reads each into proposals (fixture AI)", async ({ request }) => {
  const documentId = await upload(uniquePdf("pump"), "pump");
  let jobId: string | null = null;
  try {
    jobId = await createQueueRepo(admin).createJob(documentId, "ingest_pdf", { kind: "pdf_text", pageNo: 1 });
    await pump(request);

    const steps = await stepsOf(jobId);
    expect(steps.map((s) => [s.kind, s.page_no, s.status, s.last_error])).toEqual([
      ["pdf_text", 1, "done", null],
      ["select_pages", null, "done", null],
      ["extract_page", 3, "done", null],
      ["extract_page", 4, "done", null],
      ["extract_page", 5, "done", null],
    ]);
    expect(steps[0].result).toEqual({ from: 1, through: 6 });
    expect(steps[1].result).toEqual({ selected: 3 });
    // p. 3 has no figures; p. 4 has three lines (one misread on purpose) and p. 5 two. A repeat of a page text already
    // read on an earlier run is copied from the cache at 0 tokens.
    expect(steps.slice(2).map((s) => (s.result as { proposals: number; flagged: number }).proposals)).toEqual([0, 3, 2]);
    expect(steps.slice(2).map((s) => (s.result as { proposals: number; flagged: number }).flagged)).toEqual([0, 1, 0]);

    // What the desk (the admin's session, RLS) can read back: pending proposals with the machine's values, never decided.
    const { data: proposals, error } = await admin.from("proposals").select("page_no, dedupe_key, machine_value, flags, reason, status, accepted_value").eq("document_id", documentId).order("page_no").order("dedupe_key");
    expect(error).toBeNull();
    expect(proposals).toHaveLength(5);
    expect(proposals?.every((p) => p.status === "pending" && p.accepted_value === null && p.reason === "core")).toBe(true);
    const finance = proposals?.find((p) => p.dedupe_key === "finance costs|FY26|consolidated");
    expect(finance).toMatchObject({ page_no: 4, flags: ["value_not_on_page"], machine_value: { value: 41.7, unit: "₹ cr", period: "FY26", locator: "p. 4" } });
    const { count: extractions } = await admin.from("extractions").select("id", { count: "exact", head: true }).eq("document_id", documentId);
    expect(extractions).toBe(3);

    const { data: doc } = await admin.from("documents").select("page_count, status").eq("id", documentId).single();
    expect(doc).toEqual({ page_count: 6, status: "active" });
    const { data: pages } = await admin.from("document_pages").select("page_no, kind, selected_by, text").eq("document_id", documentId).order("page_no");
    expect(pages?.map((p) => [p.page_no, p.kind, p.selected_by])).toEqual([
      [1, null, null],
      [2, null, null],
      [3, "mdna", "rule"],
      [4, "pl", "rule"],
      [5, "bs", "rule"],
      [6, null, null],
    ]);
    expect(pages?.[3].text).toContain("Revenue from operations 1,284.00 1,102.00");
  } finally {
    await cleanUp(documentId, jobId);
  }
});

test("the pump reads a scanned page with the scan reader (fixture), then reads its figures like a digital page", async ({ request }) => {
  const documentId = await upload(new Uint8Array(makeFixturePdf(`${RUN}-scan`, { scan: true })), "scan");
  let jobId: string | null = null;
  try {
    jobId = await createQueueRepo(admin).createJob(documentId, "ingest_pdf", { kind: "pdf_text", pageNo: 1 });
    await pump(request);

    const steps = await stepsOf(jobId);
    expect(steps.map((s) => [s.kind, s.page_no, s.status, s.last_error])).toEqual([
      ["pdf_text", 1, "done", null],
      ["select_pages", null, "done", null],
      ["ocr_page", 1, "done", null],
      ["extract_page", 1, "done", null],
    ]);
    // One scan in a one-page report is a mostly scanned document that fits its budget: scanned whole, nothing ticked first.
    expect(steps[1].result).toEqual({ selected: 0, scansQueued: 1 });
    expect(steps[2].result).toMatchObject({ ocr: true, selected: true });
    expect((steps[3].result as { proposals: number }).proposals).toBe(3);

    const { data: page } = await admin.from("document_pages").select("text, ocr, is_scan, kind, selected, selected_by").eq("document_id", documentId).eq("page_no", 1).single();
    expect(page).toEqual({ text: FIXTURE_OCR_TEXT, ocr: true, is_scan: false, kind: "pl", selected: true, selected_by: "rule" });
    const { count } = await admin.from("proposals").select("id", { count: "exact", head: true }).eq("document_id", documentId).eq("status", "pending");
    expect(count).toBe(3);
    // The ledger counted one scan read, as a used unit in the OCR bucket.
    const { data: usage } = await service.from("provider_usage").select("status, tokens_used").eq("bucket", "ocrspace").eq("kind", "reservation").order("at", { ascending: false }).limit(1).single();
    expect(usage).toEqual({ status: "used", tokens_used: 1 });
  } finally {
    await cleanUp(documentId, jobId);
  }
});

test("the pump never parses a stored file whose hash differs from the one claimed at upload", async ({ request }) => {
  const real = uniquePdf("tamper");
  const claimed = new Uint8Array(real);
  claimed[claimed.length - 2] ^= 1; // same size, different bytes: finishUpload's size and type checks pass
  const documentId = await upload(real, "tamper", sha256(claimed));
  let jobId: string | null = null;
  try {
    jobId = await createQueueRepo(admin).createJob(documentId, "ingest_pdf", { kind: "pdf_text", pageNo: 1 });
    await pump(request);
    expect(await stepsOf(jobId)).toEqual([
      { kind: "pdf_text", page_no: 1, status: "needs_attention", result: null, last_error: "The stored file is not the PDF that was uploaded. Choose Try again, or Skip this document." },
    ]);
    const { count } = await admin.from("document_pages").select("page_no", { count: "exact", head: true }).eq("document_id", documentId);
    expect(count).toBe(0);
  } finally {
    await cleanUp(documentId, jobId);
  }
});
