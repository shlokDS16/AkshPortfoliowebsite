import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { makeFixturePdf } from "../scripts/make-fixture-pdf.mjs";
import { requireStack, tokenHashFor } from "./support/auth";
import { E2E_ADMIN_EMAIL } from "./support/stack";

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
