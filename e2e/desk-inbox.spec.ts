import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { makeFixturePdf } from "../scripts/make-fixture-pdf.mjs";
import { requireStack, tokenHashFor } from "./support/auth";
import { E2E_ADMIN_EMAIL } from "./support/stack";
import { KAVERI } from "../src/test/fixtures/casefile";
import { makePdf } from "../src/test/fixtures/pdf";

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

const documentIdOf = async (title: string) => {
  const { data, error } = await db.from("documents").select("id").eq("title", title).single();
  if (error) throw error;
  return data.id;
};

/** Leaves nothing behind in the shared local inbox: the job is cancelled and the document skipped (the admin's own RLS rights). */
async function retire(documentId: string) {
  await db.from("jobs").update({ cancelled_at: new Date().toISOString() }).eq("document_id", documentId).is("cancelled_at", null);
  await db.from("documents").update({ status: "skipped" }).eq("id", documentId);
}

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
  await page.getByLabel("Choose a PDF").setInputFiles(pdf);

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

  // Figures wait for Aksh's check, so the document cannot be skipped from the card: he reviews it.
  await expect(card.getByRole("link", { name: "Review" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Skip this document" })).toHaveCount(0);
  await retire(documentId);

  // A document with nothing to review can be skipped: the card moves to Finished and its job stops.
  const quietTitle = `notice-${run}`;
  await page.getByLabel("Choose a PDF").setInputFiles({ name: `${quietTitle}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(makePdf([[`Notice of meeting ${run}`]])) });
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

  await retire(await documentIdOf(title));
});

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

test("review: resolve the flagged figure by typing it, untick one, and file the rest under the Kaveri file", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const run = `${Date.now().toString(36)}${testInfo.project.name === "desk-mobile" ? "M" : "D"}R`.toUpperCase();
  const title = `annual-report-${run}`;

  await page.goto("/desk/inbox");
  await hydrated(page);
  await page.getByText("Company, filing date and link (optional)").click();
  await page.getByLabel("Company, as $SYMBOL").fill(`$${KAVERI.symbol}`);
  await page.getByLabel("Choose a PDF").setInputFiles({ name: `${title}.pdf`, mimeType: "application/pdf", buffer: makeFixturePdf(run) });
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

test("staged figures reach the editor, provenance is recorded on save, and Done removes the PDF", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const run = `${Date.now().toString(36)}${testInfo.project.name === "desk-mobile" ? "M" : "D"}S`.toUpperCase();
  const symbol = `KVS${run}`;
  const title = `annual-report-${run}`;

  // A private company of its own, so its new file starts empty and a second run (or the other viewport) stages the same four figures.
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(`first note on $${symbol}`);
  await box.press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  await page.goto("/desk/inbox");
  await hydrated(page);
  await page.getByText("Company, filing date and link (optional)").click();
  await page.getByLabel("Company, as $SYMBOL").fill(`$${symbol}`);
  await page.getByLabel("Choose a PDF").setInputFiles({ name: `${title}.pdf`, mimeType: "application/pdf", buffer: makeFixturePdf(run) });
  const card = page.locator("article", { hasText: title });
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 90_000 });
  const documentId = await documentIdOf(title);
  let done = false;

  try {
    // Review: type the flagged value, drop Profit for the year, start the company's file with the other four.
    await card.getByRole("link", { name: "Review" }).click();
    await expect(page).toHaveURL(new RegExp(`/desk/inbox/${documentId}/review$`));
    await hydrated(page);
    const check = page.getByRole("region", { name: "Check 1 of 1" });
    await check.getByRole("button", { name: "1 Type the value from the page" }).click();
    await check.getByLabel("Value as printed on the page").fill("41.20");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /^All checked\. 5 figures to file$/ })).toBeVisible();
    await page.getByRole("checkbox", { name: /^Profit for the year/ }).uncheck();
    await page.getByLabel("Filed on").fill("2026-05-20");
    await page.getByRole("button", { name: /^Start a file for / }).click();
    await expect(page).toHaveURL(/\/desk\/items\/[0-9a-f-]{36}#facts$/, { timeout: 30_000 });
    const itemPath = new URL(page.url()).pathname;
    await hydrated(page);

    // The editor: four staged rows (two sections of the annual report) under one banner, each saying where it was read.
    const banner = page.getByTestId("staged-banner");
    await expect(banner).toContainText(`4 figures from ${title} are staged below. Check them, write your change reason and save.`);
    const facts = page.getByRole("group", { name: /^Fact F\d+$/ });
    await expect(facts).toHaveCount(4);
    await expect(page.getByTestId("staged-note")).toHaveCount(4);
    await expect(page.getByTestId("staged-note").first()).toHaveText(`From ${title}, p. 4`);
    await expect(page.getByLabel("Change reason")).toHaveAttribute("placeholder", /for example: added FY26 figures/);
    await expectNoViolations(page);

    // Delete the last one, write the reason, save.
    await facts.last().getByRole("button", { name: /^Remove fact/ }).click();
    await expect(facts).toHaveCount(3);
    await expect(banner).toContainText("3 figures from");
    await page.getByLabel("Change reason").fill("Added FY26 figures from the annual report");
    await page.getByRole("button", { name: "Save revision" }).click();
    await expect(page.getByText("Revision saved.")).toBeVisible({ timeout: 30_000 });

    // Saved: three facts, no banner, and a chip on each that says where it was read and whether Aksh changed it.
    await expect(page.getByTestId("staged-banner")).toHaveCount(0);
    await expect(page.getByRole("group", { name: /^Fact F\d+$/ })).toHaveCount(3);
    const chips = page.getByTestId("provenance-chip");
    await expect(chips).toHaveCount(3);
    const texts = await chips.allTextContents();
    expect(texts.filter((t) => t === "Read from p. 4 of " + title + "; you changed 41.70 to 41.20.")).toHaveLength(1);
    expect(texts.filter((t) => t.endsWith("; you kept it."))).toHaveLength(2);
    await expectNoViolations(page);

    // The database agrees: three filed under the revision with provenance, the deleted one back in the review list.
    const proposals = await db.from("proposals").select("id, status, item_id, revision_id").eq("document_id", documentId);
    expect(proposals.error).toBeNull();
    const rows = proposals.data ?? [];
    expect(rows.filter((r) => r.status === "filed" && r.revision_id !== null)).toHaveLength(3);
    expect(rows.filter((r) => r.status === "accepted" && r.item_id === null)).toHaveLength(1);
    expect(rows.filter((r) => r.status === "rejected")).toHaveLength(1);
    const prov = await db.from("fact_provenance").select("fact_id, edited").in("proposal_id", rows.map((r) => r.id));
    expect(prov.data).toHaveLength(3);
    expect(prov.data?.filter((p) => p.edited)).toHaveLength(1); // only the Finance costs row Aksh typed

    // The review screen shows them as filed, and lists the one that came back.
    await page.goto(`/desk/inbox/${documentId}/review`);
    await hydrated(page);
    await expect(page.getByTestId("filed-count")).toHaveText("3 figures from this document are filed in a case file.");
    // (Two rows: the one deleted from the editor, ticked again, and Profit for the year, which stays listed unticked.)
    await expect(page.getByRole("heading", { name: /^2 figures to file$/ })).toBeVisible();

    // Done: the job stops, the PDF is deleted, the page text stays.
    const stored = (await db.from("documents").select("storage_path").eq("id", documentId).single()).data!.storage_path!;
    await page.getByRole("button", { name: "Done with this document" }).click();
    await expect(page.getByText("Done. The PDF was deleted to save space; its page text and your figures stay.")).toBeVisible();
    done = true;
    await expect(async () => {
      const doc = await db.from("documents").select("status, original_deleted_at").eq("id", documentId).single();
      expect(doc.data?.status).toBe("done");
      expect(doc.data?.original_deleted_at).not.toBeNull();
      const jobs = await db.from("jobs").select("cancelled_at").eq("document_id", documentId);
      expect(jobs.data?.every((j) => j.cancelled_at !== null)).toBe(true);
      const object = await db.storage.from("documents").list("", { search: stored, limit: 5 });
      expect(object.data?.filter((o) => o.name === stored)).toHaveLength(0);
    }).toPass({ timeout: 15_000 });
    await expect(page.getByText("Done with this document. The PDF was deleted; page text is still here.")).toBeVisible();

    // The pane beside the file says so, and still reads the stored page text.
    await page.goto(itemPath);
    await hydrated(page);
    await page.getByRole("button", { name: "Open a document" }).click();
    const pane = page.locator("#doc-pane");
    await expect(pane).toBeVisible();
    await expect(pane.getByText("The PDF was deleted; page text is still here.")).toBeVisible();
    await pane.getByLabel("Page", { exact: true }).fill("4");
    await pane.getByLabel("Page", { exact: true }).press("Enter");
    await expect(pane.getByText("Revenue from operations 1,284.00 1,102.00")).toBeVisible();
  } finally {
    if (!done) await retire(documentId);
  }
});
