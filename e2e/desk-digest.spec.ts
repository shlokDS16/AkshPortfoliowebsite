import { expect, test, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { adminDb, documentIdOf as documentIdIn, expectNoViolationsInBothThemes, hydrated, retire as retireIn } from "./support/desk";

// The private digest of a commentary page on the LOCAL stack, in desk-desktop and desk-mobile (Plan 2b Task 7). The suite's
// server runs with LLM_ADAPTER=fixture: the fixture adapter answers a digest request from its own table (two claims about the
// Kaveri Pumps capacity expansion and steel prices). The pasted page prints the first claim's line and not the second's, so one
// claim is confirmed by the page check and one is not. Nothing here calls Groq.

let db: Db;
test.beforeAll(async () => {
  db = await adminDb();
});

const CAPACITY = "We expect the Kaveri Pumps capacity expansion to be commissioned in the second half of FY27.";
const MDNA = (title: string) =>
  [title, "Management Discussion and Analysis", "Outlook", CAPACITY, "Risks", "Raw material costs stayed broadly flat during the year."].join("\n");

async function makeCompany(page: Page, symbol: string) {
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(`first note on $${symbol}`);
  await box.press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
}

/** A private thesis for the company, made as the signed-in admin (RLS applies), so the item page has its document pane. */
async function startFile(symbol: string, title: string): Promise<string> {
  const company = await db.from("companies").select("id").eq("nse_symbol", symbol).single();
  if (company.error) throw company.error;
  const item = await db.from("items").insert({ kind: "thesis", title, company_id: company.data.id }).select("id").single();
  if (item.error) throw item.error;
  const revision = await db.from("item_revisions").insert({ item_id: item.data.id, body_md: "", structured: {}, change_reason: "created", author: "aksh" }).select("id").single();
  if (revision.error) throw revision.error;
  const set = await db.from("items").update({ current_revision_id: revision.data.id }).eq("id", item.data.id);
  if (set.error) throw set.error;
  return item.data.id;
}

test("a commentary page is digested; the pane shows it as Machine-read, hides the claim the page does not print, and Use as a fact fills only the quote and the page", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const run = `${Date.now().toString(36)}${testInfo.project.name === "desk-mobile" ? "M" : "D"}G`.toUpperCase();
  const symbol = `KVG${run}`;
  const title = `Management commentary ${run}`;
  await makeCompany(page, symbol);
  const itemId = await startFile(symbol, `Kaveri file ${run}`);

  await page.goto("/desk/inbox");
  await hydrated(page);
  await page.getByText("Company, filing date and link (optional)").click();
  await page.getByLabel("Company, as $SYMBOL").fill(`$${symbol}`);
  await page.getByRole("textbox", { name: "Or paste a link or some text" }).fill(MDNA(title));
  await page.getByRole("button", { name: "Read it" }).click();
  const card = page.locator("article", { hasText: title });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 90_000 });
  const documentId = await documentIdIn(db, title);

  try {
    // Only a digest was queued for the page, and it said where its notes are.
    const steps = await db.from("jobs").select("job_steps(kind, page_no, status)").eq("document_id", documentId).single();
    expect((steps.data?.job_steps ?? []).map((s) => `${s.kind}:${s.page_no}:${s.status}`).sort()).toEqual(["digest_page:1:done", "select_pages:null:done", "text_pages:1:done"]);
    await expect(card.getByText(/commentary notes are in the document pane/)).toBeVisible();
    const proposals = await db.from("proposals").select("id").eq("document_id", documentId);
    expect(proposals.data).toHaveLength(0);

    // Stored once, with the page check's verdict: the first line is printed, the second is not.
    const digests = await db.from("document_digests").select("ord, on_page, extraction_id").eq("document_id", documentId).order("ord");
    expect(digests.data?.map((d) => [d.ord, d.on_page])).toEqual([[0, true], [1, false]]);
    expect(new Set(digests.data?.map((d) => d.extraction_id)).size).toBe(1);
    const extractions = await db.from("extractions").select("id").eq("document_id", documentId).eq("prompt_version", "digest-v1");
    expect(extractions.data).toHaveLength(1);

    // The item page: open the document, open the Machine-read panel.
    await page.goto(`/desk/items/${itemId}`);
    await hydrated(page);
    await page.getByRole("button", { name: "Open a document" }).click();
    const panel = page.getByTestId("digest-panel");
    await expect(panel.getByText("Machine-read", { exact: true })).toBeVisible();
    await expect(panel.getByText("2 claims on this page")).toBeVisible();
    await panel.locator("summary").click();
    await expect(panel.getByText("Management plans to add pump capacity at the Kaveri plant by the second half of FY27.")).toBeVisible();
    // The unconfirmed claim is hidden until asked for, and then marked.
    await expect(panel.getByText(/steel prices could squeeze margins/i)).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Use as a fact" })).toHaveCount(1);
    await panel.getByRole("button", { name: "Show 1 claim the page check could not confirm" }).click();
    await expect(panel.getByText("Not found on this page")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Use as a fact" })).toHaveCount(1);
    await expectNoViolationsInBothThemes(page);

    // Use as a fact: a new row with the verified line and the page; label and value are empty; nothing is saved.
    const before = await db.from("item_revisions").select("id").eq("item_id", itemId);
    await panel.getByRole("button", { name: "Use as a fact" }).click();
    const row = page.getByRole("group", { name: /^Fact F\d+$/ }).last();
    await expect(row.getByLabel("Quoted line (optional)")).toHaveValue(CAPACITY);
    await expect(row.getByLabel("Page or locator")).toHaveValue("p. 1");
    await expect(row.getByLabel("Metric")).toHaveValue("");
    await expect(row.getByLabel("Value", { exact: true })).toHaveValue("");
    await expect(row.getByLabel("Source")).toHaveValue("S1");
    const after = await db.from("item_revisions").select("id").eq("item_id", itemId);
    expect(after.data).toHaveLength(before.data?.length ?? -1);
  } finally {
    await retireIn(db, documentId);
  }
});
