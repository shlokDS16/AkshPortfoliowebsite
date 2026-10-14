import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { adminDb, documentIdOf as documentIdIn, expectNoViolations, hydrated, retire as retireIn } from "./support/desk";

// Links and pasted text on the LOCAL stack, in desk-desktop and desk-mobile (Plan 2b Task 5). The suite's server runs with
// LLM_ADAPTER=fixture, which also swaps the link fetch's DNS and HTTPS for made-up sites (*.test, src/modules/documents/fixture-link.ts):
// nothing leaves the machine, yet every rule of the safe fetch (https only, public addresses only, redirects, the byte cap) still
// runs on the fixture's answers. Every run uses its own names, so the bytes (and the hash) are new each time.

let db: Db;
test.beforeAll(async () => {
  db = await adminDb();
});
const documentIdOf = (title: string) => documentIdIn(db, title);

const runOf = (projectName: string, tail: string) => `${Date.now().toString(36)}${projectName === "desk-mobile" ? "M" : "D"}${tail}`.toUpperCase();

async function makeCompany(page: Page, symbol: string) {
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(`first note on $${symbol}`);
  await box.press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
}

async function openInbox(page: Page) {
  await page.goto("/desk/inbox");
  await hydrated(page);
}

const pasteBox = (page: Page) => page.getByRole("textbox", { name: "Or paste a link or some text" });

async function paste(page: Page, what: string) {
  await pasteBox(page).fill(what);
  await page.getByRole("button", { name: "Read it" }).click();
}

/** The card for a title, once it is in Ready for you (the kick that follows Read it reads the pages and the figures). */
async function readyCard(page: Page, title: string): Promise<Locator> {
  const card = page.locator("article", { hasText: title });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 90_000 });
  return card;
}

const stepsOf = async (documentId: string) => {
  const jobs = await db.from("jobs").select("kind, job_steps(kind, page_no, status)").eq("document_id", documentId).single();
  return { job: jobs.data?.kind, steps: (jobs.data?.job_steps ?? []).map((s) => `${s.kind}:${s.page_no}:${s.status}`).sort() };
};

async function storedType(path: string): Promise<string | undefined> {
  const { data } = await db.storage.from("documents").list("", { search: path });
  return (data ?? []).find((o) => o.name === path)?.metadata?.mimetype;
}

const TABLE = (run: string) =>
  [
    `Quarterly results table ${run}`,
    "Particulars Quarter ended June 30, 2026 Quarter ended June 30, 2025",
    "Revenue from operations 412.60 371.20",
    "Finance costs 12.40 13.10",
    "Profit for the quarter 38.90 31.50",
  ].join("\n");

test("pasted text of a results table is stored as text, cut into a page, selected by its numbers and read into figures", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const run = runOf(testInfo.project.name, "T");
  const symbol = `KVF${run}`;
  const title = `Quarterly results table ${run}`;
  await makeCompany(page, symbol);
  await openInbox(page);
  await page.getByText("Company, filing date and link (optional)").click();
  await page.getByLabel("Company, as $SYMBOL").fill(`$${symbol}`);
  await paste(page, TABLE(run));
  const card = await readyCard(page, title);
  const documentId = await documentIdOf(title);

  try {
    await expect(card.getByText(`$${symbol}`, { exact: true })).toBeVisible();
    await expect(card.getByText(/3 figures ready to check/)).toBeVisible();
    await expectNoViolations(page);

    const doc = await db.from("documents").select("kind, storage_path, status, page_count, source_url, company_id").eq("id", documentId).single();
    expect(doc.data).toMatchObject({ kind: "text", storage_path: `${documentId}.txt`, status: "active", page_count: 1, source_url: null });
    expect(doc.data?.company_id).not.toBeNull();
    expect(await storedType(`${documentId}.txt`)).toBe("text/plain");
    const pages = await db.from("document_pages").select("page_no, text, is_scan, ocr, selected, selected_by").eq("document_id", documentId);
    expect(pages.data).toEqual([{ page_no: 1, text: TABLE(run), is_scan: false, ocr: false, selected: true, selected_by: "rule" }]);
    expect(await stepsOf(documentId)).toEqual({ job: "ingest_text", steps: ["extract_page:1:done", "select_pages:null:done", "text_pages:1:done"] });
    const proposals = await db.from("proposals").select("page_no").eq("document_id", documentId);
    expect(proposals.data).toHaveLength(3);

    // The same words again: refused as a duplicate, naming the first, with a link to its card.
    await paste(page, TABLE(run));
    const refusal = page.getByRole("alert").filter({ hasText: "You added this on" });
    await expect(refusal).toBeVisible();
    await expect(refusal.getByRole("link", { name: "Open it" })).toHaveAttribute("href", `/desk/inbox#doc-${documentId}`);
  } finally {
    await retireIn(db, documentId);
  }
});

test("a link to a web page is fetched on the server, reduced to its text, and read like pasted text", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const run = runOf(testInfo.project.name, "H");
  const link = `https://results.test/q/${run}`;
  const title = `Quarterly results ${run}`; // the page's <title>
  await openInbox(page);
  await paste(page, link);
  const card = await readyCard(page, title);
  const documentId = await documentIdOf(title);

  try {
    await expect(card.getByText(/3 figures ready to check/)).toBeVisible();
    const doc = await db.from("documents").select("kind, storage_path, source_url, fetched_from, page_count, status").eq("id", documentId).single();
    expect(doc.data).toEqual({ kind: "url", storage_path: `${documentId}.txt`, source_url: link, fetched_from: link, page_count: 1, status: "active" });
    const page1 = await db.from("document_pages").select("text").eq("document_id", documentId).single();
    // The visible text only: the table's rows are lines, and the page's script and style are gone.
    expect(page1.data?.text).toContain("Revenue from operations 412.60 371.20");
    expect(page1.data?.text).toContain(`Quarterly results table ${run}`);
    expect(page1.data?.text).not.toMatch(/9,999|color: red|<table/);
    expect(await stepsOf(documentId)).toEqual({ job: "ingest_url", steps: ["extract_page:1:done", "select_pages:null:done", "text_pages:1:done"] });

    // The same link again: the same text, so a duplicate.
    await paste(page, link);
    await expect(page.getByRole("alert").filter({ hasText: "You added this on" })).toBeVisible();
  } finally {
    await retireIn(db, documentId);
  }
});

test("a BSE-style PDF link becomes a pdf document through the upload checks, with its link kept", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const run = runOf(testInfo.project.name, "P");
  const link = `https://bse.test/${run}-results.pdf`;
  const title = `${run} results`; // the file name, without .pdf and its dashes
  await openInbox(page);
  await paste(page, link);
  const card = await readyCard(page, title);
  const documentId = await documentIdOf(title);

  try {
    await expect(card.getByText(/3 figures ready to check/)).toBeVisible();
    const doc = await db.from("documents").select("kind, storage_path, source_url, fetched_from, page_count, status, sha256").eq("id", documentId).single();
    expect(doc.data).toMatchObject({ kind: "pdf", storage_path: `${documentId}.pdf`, source_url: link, fetched_from: link, page_count: 1, status: "active" });
    expect(doc.data?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await storedType(`${documentId}.pdf`)).toBe("application/pdf");
    expect(await stepsOf(documentId)).toEqual({ job: "ingest_pdf", steps: ["extract_page:1:done", "pdf_text:1:done", "select_pages:null:done"] });
  } finally {
    await retireIn(db, documentId);
  }
});

test("a link to a private address, http, or too little text is refused in plain words, and nothing is stored", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const run = runOf(testInfo.project.name, "R");
  await openInbox(page);
  const before = await db.from("documents").select("id", { count: "exact", head: true });

  const refused: [string, string][] = [
    [`https://internal.test/${run}`, "That link points somewhere the desk will not open."],
    ["https://127.0.0.1/", "That link points somewhere the desk will not open."],
    ["https://169.254.169.254/latest/meta-data/", "That link points somewhere the desk will not open."],
    [`http://results.test/q/${run}`, "Use a full link that starts with https:// and has no user name, password or port number."],
    [`https://user:secret@results.test/q/${run}`, "Use a full link that starts with https:// and has no user name, password or port number."],
    [`https://nowhere.example/${run}`, "The desk could not open that link. Check it, or paste the text instead."],
    ["too little", "Paste a little more, at least 50 characters."],
  ];
  for (const [what, sentence] of refused) {
    await paste(page, what);
    await expect(page.getByRole("alert").filter({ hasText: sentence })).toBeVisible();
    await expect(pasteBox(page)).toHaveValue(what); // what he pasted stays, so he can fix it
  }
  await expectNoViolations(page);
  const after = await db.from("documents").select("id", { count: "exact", head: true });
  expect(after.count).toBe(before.count);
});

test("a capture with a link offers Read this link on the desk home; pressing it adds the document to the inbox", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const run = runOf(testInfo.project.name, "L");
  const link = `https://bse.test/${run}-today.pdf`;
  const title = `${run} today`;
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(`worth reading ${link}`);
  await box.press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await page.reload();

  const row = page.getByRole("listitem").filter({ hasText: run });
  await expect(row).toHaveCount(1);
  const button = row.getByRole("button", { name: "Read this link, bse.test" });
  await expect(button).toBeVisible();
  // Nothing was fetched by itself: no document exists for the link until Aksh presses the button.
  expect((await db.from("documents").select("id").eq("fetched_from", link)).data).toEqual([]);
  await expectNoViolations(page);

  await button.click();
  await expect(row.getByText("Added to your inbox.")).toBeVisible({ timeout: 30_000 });
  const documentId = await documentIdOf(title);
  try {
    await row.getByRole("link", { name: "Open the inbox" }).click();
    await page.waitForURL(/\/desk\/inbox#doc-/);
    await hydrated(page);
    const card = await readyCard(page, title);
    await expect(card.getByText(/figures? ready to check/)).toBeVisible();
    const doc = await db.from("documents").select("kind, fetched_from, source_url").eq("id", documentId).single();
    expect(doc.data).toEqual({ kind: "pdf", fetched_from: link, source_url: link });
  } finally {
    await retireIn(db, documentId);
  }
});
