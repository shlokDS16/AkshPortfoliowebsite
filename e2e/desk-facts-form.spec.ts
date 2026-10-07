import { expect, test, type Page } from "@playwright/test";
import { KAVERI } from "../src/test/fixtures/casefile";

// Runs signed in as the admin, after the seed. The local database is not reset between runs, so the fact carries a
// run suffix, and the test removes it again at the end (Kaveri's fact count stays put however often it runs).
const RUN = Date.now().toString(36);
const hydrated = (page: Page) => expect(page.getByRole("button", { name: "Capture", exact: true })).toHaveAttribute("data-shortcuts", "ready");
const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: /^Revision saved\.$|waiting for the publishing gate/ })).toBeVisible();

async function openKaveri(page: Page) {
  await page.goto("/desk/items");
  await page.getByRole("link", { name: KAVERI.title }).click();
  await expect(page.getByRole("heading", { level: 1, name: KAVERI.title })).toBeVisible();
  await hydrated(page);
}

test("add a fact with the form, save, reload: it is in the sheet and the history", async ({ page }) => {
  await openKaveri(page);
  const label = `Dealer count ${RUN}`;
  await page.getByRole("button", { name: "Add fact" }).click();
  const row = page.getByRole("group", { name: /^Fact F\d+$/ }).last();
  const id = ((await row.locator("legend").textContent()) ?? "").replace("Fact ", "");
  await row.getByLabel("Metric").fill(label);
  await row.getByLabel("Value", { exact: true }).fill("1900");
  await row.getByLabel("Unit", { exact: true }).fill("dealers");
  await row.getByLabel("Period", { exact: true }).fill("FY26");
  await row.getByLabel("As of").fill("2026-03-31");
  await row.getByLabel("Page or locator").fill("p. 20");
  await page.getByLabel("Change reason").fill(`Added ${id} with the form ${RUN}`);
  await page.getByRole("button", { name: "Save revision" }).click();
  await saved(page);

  await page.reload();
  await hydrated(page);
  await expect(page.getByRole("group", { name: `Fact ${id}` }).getByLabel("Metric")).toHaveValue(label);
  const history = page.locator("section", { has: page.getByRole("heading", { name: "Revision history" }) });
  await expect(history.getByRole("listitem").filter({ hasText: `Added ${id} with the form ${RUN}` })).toHaveCount(1);
  await page.getByRole("radio", { name: "Text sheet" }).click();
  await expect(page.getByLabel("Facts sheet")).toHaveValue(new RegExp(`^${id} \\| ${label} \\| 1900 \\| dealers \\| FY26 \\| 2026-03-31 \\| S1 \\| p\\. 20$`, "m"));

  // Clean up through the same form: Remove is named with the row, and an uncited fact saves without a warning.
  await page.getByRole("radio", { name: "Form" }).click();
  await page.getByRole("button", { name: `Remove fact ${id}` }).click();
  await page.getByLabel("Change reason").fill(`Removed ${id} ${RUN}`);
  await page.getByRole("button", { name: "Save revision" }).click();
  await saved(page);
  await expect(page.getByRole("group", { name: `Fact ${id}` })).toHaveCount(0);
});

test("the form fits the screen: no horizontal scroll, Add and Remove reachable", async ({ page }) => {
  await openKaveri(page);
  const width = page.viewportSize()!.width;
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scroll).toBeLessThanOrEqual(width);
  for (const name of ["Add fact", "Remove fact F1", "Add source", "Remove test reading T1", "Add exhibit"]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
    const box = (await button.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    if (width < 960) expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
