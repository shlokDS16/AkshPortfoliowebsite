import { expect, test } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { makeFixturePdf } from "../scripts/make-fixture-pdf.mjs";
import { makeFixturePng } from "../scripts/make-fixture-png.mjs";
import { adminDb, documentIdOf as documentIdIn, expectNoViolations, hydrated, openItem, retire as retireIn } from "./support/desk";
import { KAVERI } from "../src/test/fixtures/casefile";
import { makePdf } from "../src/test/fixtures/pdf";

// The Inbox screen on the LOCAL stack, in desk-desktop and desk-mobile. `documents.sha256` is unique and the local
// database is not reset, so every run (and each viewport) uploads its own copy of the fixture PDF (a `Run` line on
// page 1) under its own private company; the duplicate check re-uploads those same bytes.

// Reads back as the signed-in admin (RLS applies), to check what Skip did to the job.
let db: Db;
test.beforeAll(async () => {
  db = await adminDb();
});

const documentIdOf = (title: string) => documentIdIn(db, title);
const retire = (documentId: string) => retireIn(db, documentId);

test("upload a PDF: it is read, its statement pages are ticked, its figures wait for a check, and the same file is refused", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const run = `${Date.now().toString(36)}${testInfo.project.name === "desk-mobile" ? "M" : "D"}`.toUpperCase();
  const symbol = `KVF${run}`;
  const fileName = `annual-report-${run}.pdf`;
  const title = `annual-report-${run}`;
  const pdf = { name: fileName, mimeType: "application/pdf", buffer: makeFixturePdf(run) };

  // A private company for this run, through the capture box (the stub the New names screen later screens).
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(`first note on $${symbol}`);
  await box.press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  await page.goto("/desk/inbox");
  await hydrated(page);
  await expect(page.getByRole("link", { name: /^Inbox/ }).first()).toHaveAttribute("aria-current", "page");
  await page.getByText("Company, filing date and link (optional)").click();
  await page.getByLabel("Company, as $SYMBOL").fill(`$${symbol}`);
  await page.getByLabel("Choose a file").setInputFiles(pdf);

  // The card appears at once. The upload's own kick may already be reading it, so any live tray is right.
  const card = page.locator("article", { hasText: title });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(`$${symbol}`, { exact: true })).toBeVisible();
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^(Being read|Waiting to start|Ready for you)/);

  // Within 60 s the keep-reading loop has read the pages and the card is in Ready for you. (A card that moves tray is a
  // new element, so the chooser is opened only after that.)
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 60_000 });
  // The fixture answers (LLM_ADAPTER=fixture) give 3 P&L and 2 balance-sheet lines; "Finance costs" is misread on purpose.
  await expect(card.getByText("5 figures ready to check. 1 needs a look.")).toBeVisible();
  await expect(page.getByText(/AI reading is off/)).toHaveCount(0);
  await card.getByText("Pages to read").click();
  // The open chooser must not widen the page: a grid track that grows to the longest page line makes a phone zoom out,
  // and the next tap lands on the wrong element (the pointer-intercept flake seen in Task 14).
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(card.getByRole("checkbox", { name: /^p\. 4 P&L · consolidated$/ })).toBeChecked();
  await expect(card.getByRole("checkbox", { name: /^p\. 5 Balance sheet · consolidated$/ })).toBeChecked();
  await expect(card.getByRole("checkbox", { name: /^p\. 3 / })).toBeChecked();

  // The chooser: untick a page, it stays unticked (Aksh's choice), tick it again.
  await card.getByRole("checkbox", { name: /^p\. 3 / }).uncheck();
  await expect(card.getByRole("checkbox", { name: /^p\. 3 / })).not.toBeChecked();
  await expect(card.getByText("2 of 20 allowed")).toBeVisible();
  await card.getByRole("checkbox", { name: /^p\. 3 / }).check();
  await expect(card.getByText("3 of 20 allowed")).toBeVisible();

  // The same bytes again: refused, naming the first upload, with a link to its card.
  await page.getByLabel("Choose a file").setInputFiles(pdf);
  const refusal = page.getByRole("alert").filter({ hasText: "You uploaded this on" });
  await expect(refusal).toBeVisible();
  const link = refusal.getByRole("link", { name: "Open it" });
  await expect(link).toHaveAttribute("href", /^\/desk\/inbox#doc-[0-9a-f-]{36}$/);
  const documentId = (await link.getAttribute("href"))!.split("#doc-")[1];
  await link.click();
  await expect(card).toBeInViewport();

  // Figures wait for Aksh's check, so the document cannot be skipped from the card: he reviews it.
  await expect(card.getByRole("link", { name: "Review" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Skip this document" })).toHaveCount(0);
  await retire(documentId);

  // A document with nothing to review can be skipped (its one page has over 50 characters: under that a page is a scan and goes to the scan reader): the card moves to Finished and its job stops.
  const quietTitle = `notice-${run}`;
  await page.getByLabel("Choose a file").setInputFiles({ name: `${quietTitle}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(makePdf([[`Notice of the annual general meeting of the members, ${run}`]])) });
  const quiet = page.locator("article", { hasText: quietTitle });
  await expect(quiet.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 60_000 });
  await expect(quiet.getByText("Read. No figures matched; open it beside your file.")).toBeVisible();
  await quiet.getByRole("button", { name: "Skip this document" }).click();
  await expect(page.locator("details", { hasText: /^Finished/ }).locator("article", { hasText: quietTitle })).toHaveCount(1);

  // The job was cancelled with it, so no queued step can spend the allowance.
  const quietId = await documentIdOf(quietTitle);
  await expect(async () => {
    const jobs = await db.from("jobs").select("cancelled_at").eq("document_id", quietId);
    expect(jobs.error).toBeNull();
    expect(jobs.data?.length).toBeGreaterThan(0);
    expect(jobs.data?.every((j) => j.cancelled_at !== null)).toBe(true);
    const doc = await db.from("documents").select("status").eq("id", quietId).single();
    expect(doc.data?.status).toBe("skipped");
  }).toPass({ timeout: 10_000 });
});

test("the document pane beside the Kaveri editor: step to p. 4, use it as a source, check a quoted line", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const run = `${Date.now().toString(36)}${testInfo.project.name === "desk-mobile" ? "M" : "D"}P`.toUpperCase();
  const title = `annual-report-${run}`;

  // Upload the fixture under the seeded Kaveri company and wait until its pages are read.
  await page.goto("/desk/inbox");
  await hydrated(page);
  await page.getByText("Company, filing date and link (optional)").click();
  await page.getByLabel("Company, as $SYMBOL").fill(`$${KAVERI.symbol}`);
  await page.getByLabel("Choose a file").setInputFiles({ name: `${title}.pdf`, mimeType: "application/pdf", buffer: makeFixturePdf(run) });
  const card = page.locator("article", { hasText: title });
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 90_000 });

  // The Kaveri file: Open a document -> the pane (a column on desktop, a full-height sheet on a phone).
  await openItem(page, db, KAVERI.title);
  await hydrated(page);
  const sources = page.getByRole("group", { name: /^Source S\d+$/ });
  const before = await sources.count();
  const pane = page.locator("#doc-pane");
  const open = async () => {
    await page.getByRole("button", { name: "Open a document" }).click();
    await expect(pane).toBeVisible();
    // The picker only shows when the company has several documents (earlier runs leave theirs behind).
    const picker = pane.getByLabel("Document", { exact: true });
    if ((await picker.count()) > 0) await picker.selectOption({ label: title });
    await expect(pane.getByRole("heading", { name: title })).toBeVisible();
  };
  await open();

  // Step to page 4: the statement page, read from the stored text.
  await pane.getByLabel("Page", { exact: true }).fill("4");
  await pane.getByLabel("Page", { exact: true }).press("Enter");
  await expect(pane.getByText("Revenue from operations 1,284.00 1,102.00")).toBeVisible();
  await expect(pane.getByText("P&L")).toBeVisible();

  // Use as source: an S row for this document appears in the Facts form (on a phone the sheet closes first).
  await pane.getByRole("button", { name: "Use as source" }).click();
  if (testInfo.project.name === "desk-mobile") await expect(pane).toBeHidden();
  await expect(sources).toHaveCount(before + 1);
  const source = sources.last();
  await expect(source.getByLabel("Document")).toHaveValue(title);
  const sourceId = ((await source.locator("legend").textContent()) ?? "").replace("Source ", "");

  // A fact that cites it, with the quoted line as printed. Nothing is saved.
  await page.getByRole("button", { name: "Add fact" }).click();
  const fact = page.getByRole("group", { name: /^Fact F\d+$/ }).last();
  await fact.getByLabel("Metric").fill("Revenue from operations");
  await fact.getByLabel("Value", { exact: true }).fill("1284");
  await fact.getByLabel("Source", { exact: true }).selectOption(sourceId);
  await fact.getByLabel("Page or locator").fill("p. 4");
  await fact.getByLabel("Quoted line (optional)").fill("Revenue from operations 1,284.00 1,102.00");

  // Still open beside the editor on desktop; reopen the sheet on a phone (it remembers page 4).
  if (!(await pane.isVisible())) await open();
  await pane.getByRole("button", { name: "Check my quotes" }).click();
  await expect(pane.getByText("found on p. 4", { exact: true })).toBeVisible();
  await expect(pane.getByText("value printed there")).toBeVisible();

  await retire(await documentIdOf(title));
});

test("review: resolve the flagged figure by typing it, untick one, and file the rest under the Kaveri file", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const run = `${Date.now().toString(36)}${testInfo.project.name === "desk-mobile" ? "M" : "D"}R`.toUpperCase();
  const title = `annual-report-${run}`;

  await page.goto("/desk/inbox");
  await hydrated(page);
  await page.getByText("Company, filing date and link (optional)").click();
  await page.getByLabel("Company, as $SYMBOL").fill(`$${KAVERI.symbol}`);
  await page.getByLabel("Choose a file").setInputFiles({ name: `${title}.pdf`, mimeType: "application/pdf", buffer: makeFixturePdf(run) });
  const card = page.locator("article", { hasText: title });
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 90_000 });
  await expect(card.getByText("5 figures ready to check. 1 needs a look.")).toBeVisible();
  const documentId = await documentIdOf(title);

  try {
    await card.getByRole("link", { name: "Review" }).click();
    await expect(page).toHaveURL(new RegExp(`/desk/inbox/${documentId}/review$`));
    await hydrated(page);

    // Check 1 of 1: the misread Finance costs (41.70 against 41.20 printed on p. 4).
    const check = page.getByRole("region", { name: "Check 1 of 1" });
    await expect(check.getByRole("heading", { name: "Finance costs" })).toBeVisible();
    await expect(check.locator("s", { hasText: "41.70" })).toBeVisible();
    await expect(check.getByText("The figure 41.70 is not on p. 4.")).toBeVisible();
    await expect(check.locator("mark", { hasText: "Finance costs" })).toBeVisible();
    await expectNoViolations(page);
    await check.getByRole("button", { name: "1 Type the value from the page" }).click();
    await check.getByLabel("Value as printed on the page").fill("41.20");
    await page.keyboard.press("Enter");

    // The values list: untick Profit for the year, and the page says what will be recorded.
    await expect(page.getByRole("heading", { name: /^All checked\. 5 figures to file$/ })).toBeVisible();
    await expect(page.getByText("You typed 41.20; the desk read 41.70.")).toBeVisible();
    await page.getByRole("checkbox", { name: /^Profit for the year/ }).uncheck();
    await expect(page.getByText("3 accepted · 1 edited · 1 rejected")).toBeVisible();
    await expectNoViolations(page);

    // File under the Kaveri file: the source row needs its filed-on date.
    const file = page.getByRole("button", { name: /^File these 4 figures under / });
    await file.click();
    await expect(page.getByRole("alert").filter({ hasText: "Add the date the document was filed." })).toBeVisible();
    await page.getByLabel("Filed on").fill("2026-05-20");
    await file.click();
    await expect(page).toHaveURL(/\/desk\/items\/[0-9a-f-]{36}#facts$/, { timeout: 30_000 });

    // The decisions are on the rows, the machine's reading untouched, and the document remembers where it came from.
    const proposals = await db.from("proposals").select("status, item_id, machine_value").eq("document_id", documentId);
    expect(proposals.error).toBeNull();
    const rows = proposals.data ?? [];
    expect(rows.filter((r) => r.status === "accepted")).toHaveLength(3);
    expect(rows.filter((r) => r.status === "edited")).toHaveLength(1);
    expect(rows.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(rows.filter((r) => r.item_id !== null)).toHaveLength(4);
    const doc = await db.from("documents").select("filed_on, title").eq("id", documentId).single();
    expect(doc.data).toMatchObject({ filed_on: "2026-05-20", title });
  } finally {
    // Leave nothing staged on the shared Kaveri file for the other specs.
    await db.from("proposals").update({ item_id: null }).eq("document_id", documentId);
    await retire(documentId);
  }
});

test("upload a photo of a table: the browser shrinks it, the scan reader and the AI read it, and its figures wait for a check", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  // Per-run pixels (a nonce block row): the browser's JPEG of a fixed picture is the same bytes every time, and the
  // second run would be refused as a duplicate. The shrinking itself is unit-tested (downscale.test.ts).
  const run = `${Date.now().toString(36)}${testInfo.project.name === "desk-mobile" ? "M" : "D"}I`.toUpperCase();
  const title = `table-photo-${run}`;

  await page.goto("/desk/inbox");
  await hydrated(page);
  await page.getByLabel("Choose a file").setInputFiles({ name: `${title}.png`, mimeType: "image/png", buffer: makeFixturePng(run) });
  const card = page.locator("article", { hasText: title });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 90_000 });
  // The fixture reader returns the P&L text and the fixture AI reads the same three lines from the picture: all found on the page.
  await expect(card.getByText("3 figures ready to check.", { exact: true })).toBeVisible();
  await expect(card.getByText("Pages to read")).toHaveCount(0); // a photo is one page: nothing to tick
  const documentId = await documentIdOf(title);

  try {
    // What was stored: a JPEG the browser made, under 1 MB, named by the server, read as one page by the scan reader.
    const doc = await db.from("documents").select("kind, storage_path, bytes, page_count, status").eq("id", documentId).single();
    expect(doc.data).toMatchObject({ kind: "image", storage_path: `${documentId}.jpg`, page_count: 1, status: "active" });
    expect(doc.data!.bytes).toBeGreaterThan(0);
    expect(doc.data!.bytes).toBeLessThanOrEqual(1_048_576);
    const pages = await db.from("document_pages").select("page_no, ocr, text").eq("document_id", documentId);
    expect(pages.data).toHaveLength(1);
    expect(pages.data![0]).toMatchObject({ page_no: 1, ocr: true });
    expect(pages.data![0].text).toContain("Revenue from operations 1,284.00 1,102.00");
    const jobs = await db.from("jobs").select("kind, job_steps(kind, page_no, status)").eq("document_id", documentId).single();
    expect(jobs.data?.kind).toBe("ingest_image");
    const steps = (jobs.data?.job_steps ?? []).map((st) => `${st.kind}:${st.page_no}:${st.status}`).sort();
    expect(steps).toEqual(["ocr_page:1:done", "vision_page:1:done"]);
    const proposals = await db.from("proposals").select("flags, status").eq("document_id", documentId);
    expect(proposals.data).toHaveLength(3);
    expect(proposals.data!.every((p) => p.status === "pending" && p.flags.length === 0)).toBe(true);
  } finally {
    await retire(documentId);
  }
});
