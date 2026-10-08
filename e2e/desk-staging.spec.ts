import { expect, test } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { makeFixturePdf } from "../scripts/make-fixture-pdf.mjs";
import { adminDb, documentIdOf as documentIdIn, expectNoViolations, expectNoViolationsInBothThemes, hydrated, retire as retireIn } from "./support/desk";

// The whole Plan 2a flow on the LOCAL stack (desk-desktop and desk-mobile): upload -> read -> fixture extraction ->
// the Ready card on the desk home -> review (one flag) -> File under -> staged rows -> save -> chips -> Done. Each run
// uses its own private company and its own PDF (a `Run` line on page 1), so it can run twice on one database and its
// counts are its own.

// Reads back as the signed-in admin (RLS applies).
let db: Db;
test.beforeAll(async () => {
  db = await adminDb();
});

const documentIdOf = (title: string) => documentIdIn(db, title);
const retire = (documentId: string) => retireIn(db, documentId);

test("the whole flow: upload, read, Ready card, review, file under, staged rows, save, chips, Done", async ({ page }, testInfo) => {
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
    // The inbox: the day's AI allowance is a meter, and the Ready card is there to be accessible in both themes.
    await expect(page.getByText(/^AI pages today: \d+ of 44$/)).toBeVisible();
    await expectNoViolationsInBothThemes(page);

    // The desk home: a neutral "Ready to review" card for this document, linking to its review page.
    await page.goto("/desk");
    await hydrated(page);
    const homeCard = page.getByRole("region", { name: /^Needs you/ }).locator("article", { hasText: title });
    await expect(homeCard.getByText("Ready to review", { exact: true })).toBeVisible();
    await expect(homeCard.getByText("5 figures ready to check. 1 needs a look.")).toBeVisible();
    await expectNoViolationsInBothThemes(page);

    // Review: type the flagged value, drop Profit for the year, start the company's file with the other four.
    await homeCard.getByRole("link", { name: "Review" }).click();
    await expect(page).toHaveURL(new RegExp(`/desk/inbox/${documentId}/review$`));
    await hydrated(page);
    const check = page.getByRole("region", { name: "Check 1 of 1" });
    await expectNoViolationsInBothThemes(page);
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
    await expect(page.getByText("This deletes the stored PDF and cannot be undone.")).toBeVisible();
    await page.getByRole("button", { name: "Delete the PDF and finish" }).click();
    await expect(page.getByText("Done with this document. The PDF was deleted; page text is still here.")).toBeVisible();
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
    // Done closes the document: its remaining figures can no longer be reviewed.
    await expect(page.getByText("You marked this document done or skipped, so its figures can no longer be reviewed or filed.")).toBeVisible();

    // A finished document no longer waits on Aksh: its card leaves the desk home.
    await page.goto("/desk");
    await hydrated(page);
    await expect(page.getByRole("region", { name: /^Needs you/ }).locator("article", { hasText: title })).toHaveCount(0);

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
