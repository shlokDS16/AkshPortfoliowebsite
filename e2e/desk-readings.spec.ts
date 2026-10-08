import { expect, test, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { makeFixturePdf } from "../scripts/make-fixture-pdf.mjs";
import { adminDb, documentIdOf as documentIdIn, expectNoViolationsInBothThemes, hydrated, retire as retireIn } from "./support/desk";

// Re-read this page and test readings on the LOCAL stack, in desk-desktop and desk-mobile (Plan 2b Task 8). The suite's server runs with
// LLM_ADAPTER=fixture: at low effort the fixture misreads Finance costs (41.70 against the printed 41.20, so it is flagged); a re-read
// (medium) reads it right. The company's file already has a test, T1, that watches "Revenue from operations" in crore, so reading the
// P&L page also proposes T1's reading. Nothing here calls Groq.

let db: Db;
test.beforeAll(async () => {
  db = await adminDb();
});

async function makeCompany(page: Page, symbol: string) {
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(`first note on $${symbol}`);
  await box.press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
}

/** A private thesis for the company whose first revision has one test that names its metric (made as the signed-in admin, RLS applies). */
async function startFile(symbol: string, title: string): Promise<string> {
  const company = await db.from("companies").select("id").eq("nse_symbol", symbol).single();
  if (company.error) throw company.error;
  const item = await db.from("items").insert({ kind: "thesis", title, company_id: company.data.id }).select("id").single();
  if (item.error) throw item.error;
  const structured = {
    schema: "casefile/1", oneLiner: null, sources: [], facts: [], exhibits: [], readFirst: [], scenario: null,
    tests: [{ id: "T1", current: null, unit: "₹ cr", readingAsOf: null, lastChecked: "2026-10-08", status: "no_data", min: 0, max: 3000, threshold: 1500, direction: "above", prior: null, metric: "Revenue from operations" }],
  };
  const revision = await db
    .from("item_revisions")
    .insert({ item_id: item.data.id, body_md: "## What would prove me wrong\n- T1: Revenue stays under 1,500 crore.", structured, change_reason: "created", author: "aksh" })
    .select("id")
    .single();
  if (revision.error) throw revision.error;
  const set = await db.from("items").update({ current_revision_id: revision.data.id }).eq("id", item.data.id);
  if (set.error) throw set.error;
  return item.data.id;
}

test("a re-read shows its price first, replaces the page's unchecked figures, and a test reading is filed beside the figures without touching the status", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const run = `${Date.now().toString(36)}${testInfo.project.name === "desk-mobile" ? "M" : "D"}R`.toUpperCase();
  const symbol = `KVR${run}`;
  const title = `annual-report-${run}`;
  await makeCompany(page, symbol);
  const itemId = await startFile(symbol, `Kaveri file ${run}`);

  await page.goto("/desk/inbox");
  await hydrated(page);
  await page.getByText("Company, filing date and link (optional)").click();
  await page.getByLabel("Company, as $SYMBOL").fill(`$${symbol}`);
  await page.getByLabel("Choose a file").setInputFiles({ name: `${title}.pdf`, mimeType: "application/pdf", buffer: makeFixturePdf(run) });
  const card = page.locator("article", { hasText: title });
  await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 90_000 });
  const documentId = await documentIdIn(db, title);

  try {
    // The first reading: five figures, one flagged, and the test's reading proposed beside them, hinting at the company's file.
    await expect(card.getByText("5 figures ready to check. 1 needs a look.")).toBeVisible();
    const first = await db.from("reading_proposals").select("test_id, pass, status, item_id_hint, machine_value, page_no").eq("document_id", documentId);
    expect(first.data).toHaveLength(1);
    expect(first.data?.[0]).toMatchObject({ test_id: "T1", pass: 1, status: "pending", item_id_hint: itemId, page_no: 4, machine_value: expect.objectContaining({ current: 1284, readingAsOf: "2026-03-31", prior: 1102, unit: "₹ cr" }) });
    // A reading is not a figure: the figures' count is the figures'.
    const figures = await db.from("proposals").select("id, page_no, status").eq("document_id", documentId);
    expect(figures.data).toHaveLength(5);

    // Re-read page 4: the price comes first, from the desk's own constants, and nothing is spent or rejected until Aksh says yes.
    await card.getByText("Pages to read").click();
    await card.getByRole("button", { name: "Re-read page 4" }).click();
    const ask = card.getByRole("group", { name: "Re-read page 4" });
    await expect(ask).toContainText(/This uses about [\d,]+ of today's 150,000 AI tokens\./);
    await expect(ask).toContainText("not checked yet are replaced by the new reading");
    await expectNoViolationsInBothThemes(page);
    const untouched = await db.from("proposals").select("status").eq("document_id", documentId).eq("page_no", 4);
    expect(untouched.data?.map((r) => r.status)).toEqual(["pending", "pending", "pending"]);
    await ask.getByRole("button", { name: /^Re-read, using about [\d,]+ tokens$/ }).click();

    // The re-read: the page's old figures are rejected (Aksh's click), the medium reading adds its own, and the misread is gone.
    // (The card moves to Being read and back, so the brief "Queued" note is not waited for; the step in the database is.)
    const passes = async () => {
      const steps = await db.from("jobs").select("job_steps(kind, page_no, pass, status)").eq("document_id", documentId).single();
      return (steps.data?.job_steps ?? []).filter((s) => s.kind === "extract_page" && s.page_no === 4).map((s) => [s.pass, s.status]).sort();
    };
    await expect.poll(passes, { timeout: 120_000 }).toEqual([[1, "done"], [2, "done"]]);
    await expect(card.getByText("5 figures ready to check.", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText("needs a look")).toHaveCount(0);
    const page4 = await db.from("proposals").select("status, flags, dedupe_key, superseded").eq("document_id", documentId).eq("page_no", 4);
    expect(page4.data?.filter((r) => r.status === "rejected" && r.superseded)).toHaveLength(3); // marked as replaced by the re-read, not as Aksh's drops
    expect(page4.data?.filter((r) => r.status === "pending" && r.dedupe_key.endsWith("|r2") && r.flags.length === 0)).toHaveLength(3);
    const readings = await db.from("reading_proposals").select("pass, status, superseded").eq("document_id", documentId).order("pass");
    expect(readings.data?.map((r) => [r.pass, r.status, r.superseded])).toEqual([[1, "rejected", true], [2, "pending", false]]);

    // Review: five figures and one reading, none of the replaced rows. File them under the company's file.
    await card.getByRole("link", { name: "Review" }).click();
    await expect(page).toHaveURL(new RegExp(`/desk/inbox/${documentId}/review$`));
    await hydrated(page);
    await expect(page.getByRole("heading", { name: /^5 figures to file$/ })).toBeVisible();
    const section = page.getByRole("region", { name: "Test readings" });
    await expect(section).toContainText("T1");
    await expect(section).toContainText("Revenue from operations");
    await expect(section).toContainText("Its status stays yours.");
    await expect(section.getByRole("checkbox")).toHaveCount(1);
    await expectNoViolationsInBothThemes(page);
    await page.getByLabel("Filed on").fill("2026-05-20");
    await page.getByRole("button", { name: /^File these 5 figures and 1 test reading under / }).click();
    await expect(page).toHaveURL(/\/desk\/items\/[0-9a-f-]{36}#facts$/, { timeout: 30_000 });
    await hydrated(page);

    // The editor: the reading is in T1's row with where it came from; the status and the threshold are as Aksh left them.
    await expect(page.getByTestId("staged-banner")).toContainText(`1 test reading from ${title} is staged below. It sets the reading, its date and the prior; the status stays yours.`);
    const t1 = page.getByRole("group", { name: "Test reading T1" });
    await expect(t1.getByLabel("Reading (blank if none)")).toHaveValue("1284");
    await expect(t1.getByLabel("Reading date")).toHaveValue("2026-03-31");
    await expect(t1.getByLabel("Prior reading")).toHaveValue("1102");
    await expect(t1.getByLabel("Status")).toHaveValue("no_data");
    await expect(t1.getByLabel("Threshold")).toHaveValue("1500");
    await expect(t1.getByLabel("Metric to watch")).toHaveValue("Revenue from operations");
    await expect(t1.getByTestId("staged-note")).toHaveText(`Reading from ${title}, p. 4`);

    await page.getByLabel("Change reason").fill("Added FY26 figures and the revenue reading from the annual report");
    await page.getByRole("button", { name: "Save revision" }).click();
    await expect(page.getByText("Revision saved.")).toBeVisible({ timeout: 30_000 });

    // The database agrees: the reading is filed under the revision, the status is still no data, and nothing else about the test moved.
    const filed = await db.from("reading_proposals").select("pass, status, revision_id").eq("document_id", documentId).order("pass");
    expect(filed.data?.map((r) => [r.pass, r.status, r.revision_id !== null])).toEqual([[1, "rejected", false], [2, "filed", true]]);
    const latest = await db.from("item_revisions").select("structured").eq("item_id", itemId).order("rev_no", { ascending: false }).limit(1).single();
    const test1 = (latest.data?.structured as { tests: Record<string, unknown>[] }).tests[0];
    expect(test1).toMatchObject({ id: "T1", current: 1284, readingAsOf: "2026-03-31", prior: 1102, status: "no_data", threshold: 1500, lastChecked: "2026-10-08", metric: "Revenue from operations" });
    await expect(page.getByTestId("staged-banner")).toHaveCount(0);
  } finally {
    await retireIn(db, documentId);
  }
});
