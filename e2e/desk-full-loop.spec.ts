import { expect, test } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { makeFixturePdf } from "../scripts/make-fixture-pdf.mjs";
import { adminDb, documentIdOf as documentIdIn, hydrated, retire as retireIn } from "./support/desk";

// The seam no per-task spec walked (final review, Important 2): after review, filing and saving, the document's
// inbox card still leads back to the review screen, where Done frees the storage the meter counts. Local stack,
// desk-desktop and desk-mobile; each run has its own private company and its own PDF.

let db: Db;
test.beforeAll(async () => {
  db = await adminDb();
});

test("upload, review, file, save, back to the inbox card, Done, and the storage meter drops", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const run = `${Date.now().toString(36)}${testInfo.project.name === "desk-mobile" ? "M" : "D"}L`.toUpperCase();
  const symbol = `KVL${run}`;
  const title = `annual-report-${run}`;
  const storageNow = async () => Number(await page.getByRole("meter", { name: "Storage" }).getAttribute("aria-valuenow"));

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
  const documentId = await documentIdIn(db, title);
  let done = false;

  try {
    const before = await storageNow();
    expect(before).toBeGreaterThan(0);

    // Review: type the flagged value, drop Profit for the year, start the company's file with the other four.
    await card.getByRole("link", { name: "Review" }).click();
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
    await hydrated(page);

    // Save all four staged figures as they are.
    await expect(page.getByTestId("staged-banner")).toContainText(`4 figures from ${title} are staged below.`);
    await page.getByLabel("Change reason").fill("Added FY26 figures from the annual report");
    await page.getByRole("button", { name: "Save revision" }).click();
    await expect(page.getByText("Revision saved.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("provenance-chip")).toHaveCount(4);

    // Back in the inbox every figure is decided, and the card says so instead of "no figures matched".
    await page.goto("/desk/inbox");
    await hydrated(page);
    const again = page.locator("article", { hasText: title });
    await expect(again.getByText("All figures checked.")).toBeVisible();
    await expect(again.getByText("No figures matched")).toHaveCount(0);
    const storageBeforeDone = await storageNow();
    expect(storageBeforeDone).toBeGreaterThanOrEqual(before);

    // Its Review link is the way to Done: confirm, and the stored PDF goes.
    await again.getByRole("link", { name: "Review" }).click();
    await expect(page).toHaveURL(new RegExp(`/desk/inbox/${documentId}/review$`));
    await hydrated(page);
    await page.getByRole("button", { name: "Done with this document" }).click();
    await page.getByRole("button", { name: "Delete the PDF and finish" }).click();
    await expect(page.getByText("Done with this document. The PDF was deleted; page text is still here.")).toBeVisible();
    done = true;

    // The storage meter drops, and the document moves to Finished.
    await page.goto("/desk/inbox");
    await hydrated(page);
    await expect(async () => {
      await page.reload();
      expect(await storageNow()).toBeLessThan(storageBeforeDone);
    }).toPass({ timeout: 20_000 });
    await expect(page.locator("article", { hasText: title }).getByText("Done with this document.")).toBeAttached(); // the Finished tray is collapsed
  } finally {
    if (!done) await retireIn(db, documentId);
  }
});
