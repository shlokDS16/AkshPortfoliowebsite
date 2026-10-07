import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { makeFixturePdf } from "../scripts/make-fixture-pdf.mjs";
import { requireStack, tokenHashFor } from "./support/auth";
import { E2E_ADMIN_EMAIL } from "./support/stack";
import { KAVERI } from "../src/test/fixtures/casefile";

// The Inbox screen on the LOCAL stack, in desk-desktop and desk-mobile. `documents.sha256` is unique and the local
// database is not reset, so every run (and each viewport) uploads its own copy of the fixture PDF (a `Run` line on
// page 1) under its own private company; the duplicate check re-uploads those same bytes.
const hydrated = (page: Page) => expect(page.getByRole("button", { name: "Capture", exact: true })).toHaveAttribute("data-shortcuts", "ready");

// Reads back as the signed-in admin (RLS applies), to check what Skip did to the job.
let db: Db;
test.beforeAll(async () => {
  const stack = requireStack();
  db = createClient<Database>(stack.apiUrl, stack.publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await db.auth.verifyOtp({ token_hash: await tokenHashFor(stack, E2E_ADMIN_EMAIL), type: "magiclink" });
  if (error) throw error;
});

test("upload a PDF: it is read, its statement pages are ticked, AI reading is off, and the same file is refused", async ({ page }, testInfo) => {
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
  await page.getByLabel("Choose a PDF").setInputFiles(pdf);

  // The card appears at once. The upload's own kick may already be reading it, so any live tray is right.
  const card = page.locator("article", { hasText: title });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(`$${symbol}`, { exact: true })).toBeVisible();
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^(Being read|Waiting to start|Ready for you)/);

  // Within 60 s the keep-reading loop has read the pages and the card is in Ready for you. (A card that moves tray is a
  // new element, so the chooser is opened only after that.)
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 60_000 });
  await expect(card.getByText("Read. AI reading is off; open it beside your file to enter figures.")).toBeVisible();
  await expect(page.getByText(/^AI reading is off\. Pages are still read and searchable/)).toBeVisible();
  await card.getByText("Pages to read").click();
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
  await page.getByLabel("Choose a PDF").setInputFiles(pdf);
  const refusal = page.getByRole("alert").filter({ hasText: "You uploaded this on" });
  await expect(refusal).toBeVisible();
  const link = refusal.getByRole("link", { name: "Open it" });
  await expect(link).toHaveAttribute("href", /^\/desk\/inbox#doc-[0-9a-f-]{36}$/);
  const documentId = (await link.getAttribute("href"))!.split("#doc-")[1];
  await link.click();
  await expect(card).toBeInViewport();

  // Skip it: the card moves to Finished and its job stops.
  await card.getByRole("button", { name: "Skip this document" }).click();
  await expect(page.locator("details", { hasText: /^Finished/ }).locator("article", { hasText: title })).toHaveCount(1);

  // The job was cancelled with it, so no queued step can spend the allowance.
  await expect(async () => {
    const jobs = await db.from("jobs").select("cancelled_at").eq("document_id", documentId);
    expect(jobs.error).toBeNull();
    expect(jobs.data?.length).toBeGreaterThan(0);
    expect(jobs.data?.every((j) => j.cancelled_at !== null)).toBe(true);
    const doc = await db.from("documents").select("status").eq("id", documentId).single();
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
  await page.getByLabel("Choose a PDF").setInputFiles({ name: `${title}.pdf`, mimeType: "application/pdf", buffer: makeFixturePdf(run) });
  const card = page.locator("article", { hasText: title });
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 90_000 });

  // The Kaveri file: Open a document -> the pane (a column on desktop, a full-height sheet on a phone).
  await page.goto("/desk/items");
  await page.getByRole("link", { name: KAVERI.title }).click();
  await expect(page.getByRole("heading", { level: 1, name: KAVERI.title })).toBeVisible();
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
});
