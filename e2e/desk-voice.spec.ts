import { expect, test, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { adminDb, documentIdOf as documentIdIn, expectNoViolations, hydrated, retire as retireIn } from "./support/desk";

// Voice notes on the LOCAL stack, in desk-desktop and desk-mobile (Plan 2b Task 4). The suite's server runs with VOICE_NOTES=on and
// the fixture transcriber (LLM_ADAPTER=fixture), so nothing leaves the machine and nothing is sent to Groq. Every run uploads its
// own bytes (documents.sha256 is unique and the local database is not reset), under its own private company.

let db: Db;
test.beforeAll(async () => {
  db = await adminDb();
});
const documentIdOf = (title: string) => documentIdIn(db, title);
const FIXTURE_TEXT = "Dealers told me orders are up this quarter and the new line is ramping faster than management said.";

const runOf = (projectName: string, tail: string) => `${Date.now().toString(36)}${projectName === "desk-mobile" ? "M" : "D"}${tail}`.toUpperCase();
const recording = (run: string) => Buffer.from(`fixture voice note ${run} ${"~".repeat(3000)}`);

/** A private company for this run, through the capture box, so the voice capture has a name to file under. */
async function makeCompany(page: Page, symbol: string) {
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(`first note on $${symbol}`);
  await box.press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
}

async function uploadNote(page: Page, title: string, run: string) {
  await page.goto("/desk/inbox");
  await hydrated(page);
  await expect(page.getByLabel("Choose a file")).toHaveAttribute("accept", /audio\/x-m4a/);
  await page.getByLabel("Choose a file").setInputFiles({ name: `${title}.m4a`, mimeType: "audio/x-m4a", buffer: recording(run) });
  const card = page.locator("article", { hasText: title });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 90_000 });
  return card;
}

test("a voice note is typed out, Aksh edits it and saves it as a capture through the capture path, and the recording is deleted", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const run = runOf(testInfo.project.name, "V");
  const symbol = `KVF${run}`;
  const title = `dealer-call-${run}`;
  await makeCompany(page, symbol);
  const card = await uploadNote(page, title, run);
  const documentId = await documentIdOf(title);

  try {
    // Typed out: in Ready for you, the sentence, the words in a box he can edit. Not counted as figures; no Review link.
    await expect(card.getByText("Your voice note is typed out. Check it, then save it as a capture.", { exact: true })).toBeVisible();
    const box = card.getByRole("textbox", { name: "Your voice note, typed out" });
    await expect(box).toHaveValue(FIXTURE_TEXT);
    await expect(card.getByText(/figure/i)).toHaveCount(0);
    await expect(card.getByRole("link", { name: "Review" })).toHaveCount(0);
    await expectNoViolations(page);

    // What the machine stored: one page of plain text, a waiting transcript, an audio job; and NO capture yet.
    const doc = await db.from("documents").select("kind, storage_path, page_count, status, transcript_status").eq("id", documentId).single();
    expect(doc.data).toMatchObject({ kind: "audio", storage_path: `${documentId}.m4a`, page_count: 1, status: "active", transcript_status: "pending" });
    const pages = await db.from("document_pages").select("page_no, text, ocr, kind").eq("document_id", documentId);
    expect(pages.data).toEqual([{ page_no: 1, text: FIXTURE_TEXT, ocr: false, kind: null }]);
    const jobs = await db.from("jobs").select("kind, job_steps(kind, page_no, status)").eq("document_id", documentId).single();
    expect(jobs.data?.kind).toBe("ingest_audio");
    expect((jobs.data?.job_steps ?? []).map((s) => `${s.kind}:${s.page_no}:${s.status}`)).toEqual(["transcribe:1:done"]);
    expect((await db.from("captures").select("id").eq("client_id", documentId)).data).toEqual([]);

    // He changes the words and saves: the capture holds exactly what he left in the box.
    const words = `$${symbol} dealers say orders are up, checked ${run}`;
    await box.fill(words);
    await card.getByRole("button", { name: "Save as a capture" }).click();
    await expect(page.locator("details", { hasText: /^Finished/ }).locator("article", { hasText: title })).toHaveCount(1, { timeout: 30_000 });

    const captures = await db.from("captures").select("raw_text, source, client_id, parsed").eq("client_id", documentId);
    expect(captures.data).toHaveLength(1);
    expect(captures.data![0]).toMatchObject({ raw_text: words, source: testInfo.project.name === "desk-mobile" ? "mobile" : "web", client_id: documentId });
    expect(captures.data![0].parsed).not.toBeNull();
    const saved = await db.from("documents").select("status, transcript_status, original_deleted_at").eq("id", documentId).single();
    expect(saved.data).toMatchObject({ status: "done", transcript_status: "saved" });
    expect(saved.data?.original_deleted_at).not.toBeNull();
    const stored = await db.storage.from("documents").list("", { search: `${documentId}.m4a` });
    expect((stored.data ?? []).filter((o) => o.name === `${documentId}.m4a`)).toEqual([]);
  } finally {
    await retireIn(db, documentId);
  }
});

test("discarding a typed-out voice note saves no capture and deletes the recording", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const run = runOf(testInfo.project.name, "X");
  const title = `dealer-call-${run}`;
  const card = await uploadNote(page, title, run);
  const documentId = await documentIdOf(title);

  try {
    await expect(card.getByRole("textbox", { name: "Your voice note, typed out" })).toHaveValue(FIXTURE_TEXT);
    await card.getByRole("button", { name: "Discard" }).click();
    // Asked once; Keep it changes nothing.
    await card.getByRole("button", { name: "Keep it" }).click();
    await expect(card.getByRole("button", { name: "Discard" })).toBeVisible();
    await card.getByRole("button", { name: "Discard" }).click();
    await card.getByRole("button", { name: "Yes, discard it" }).click();
    await expect(page.locator("details", { hasText: /^Finished/ }).locator("article", { hasText: title })).toHaveCount(1, { timeout: 30_000 });

    expect((await db.from("captures").select("id").eq("client_id", documentId)).data).toEqual([]);
    const gone = await db.from("documents").select("status, transcript_status, original_deleted_at").eq("id", documentId).single();
    expect(gone.data).toMatchObject({ status: "done", transcript_status: "discarded" });
    expect(gone.data?.original_deleted_at).not.toBeNull();
    const jobs = await db.from("jobs").select("cancelled_at").eq("document_id", documentId);
    expect(jobs.data?.every((j) => j.cancelled_at !== null)).toBe(true);
  } finally {
    await retireIn(db, documentId);
  }
});

test("the same recording again is refused as a duplicate, like any file", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const run = runOf(testInfo.project.name, "Y");
  const title = `dealer-call-${run}`;
  await uploadNote(page, title, run);
  const documentId = await documentIdOf(title);
  try {
    await page.getByLabel("Choose a file").setInputFiles({ name: `${title}.m4a`, mimeType: "audio/x-m4a", buffer: recording(run) });
    await expect(page.getByRole("alert").filter({ hasText: "You uploaded this on" })).toBeVisible();
  } finally {
    await retireIn(db, documentId);
  }
});
