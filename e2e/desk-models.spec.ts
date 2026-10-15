import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { formatNumber } from "@/modules/valuation/client";
import { smallModel, smallPerShare } from "../scripts/fixtures/make-models";
import { adminDb, documentIdOf, expectNoViolationsInBothThemes, hydrated, retire } from "./support/desk";
import { E2E_CRON_SECRET, E2E_SITE_URL } from "./support/stack";

// Plan 2.7 Task 3: a valuation workbook end to end on the LOCAL stack, in desk-mobile (375) and desk-desktop (1280). Each run uploads
// its own copy of the fixture (one extra text cell, so the hash is new) under its own private company, because the local database is
// not reset and documents.sha256 is unique.

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const RESULT_FORMAT = "#,##0.00";

let db: Db;
test.beforeAll(async () => {
  db = await adminDb();
});

/** The pump helper of desk-ingestion.spec.ts: one drain of the job queue through the cron route. */
async function pump(request: APIRequestContext) {
  const response = await request.post("/api/jobs/run", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(response.status()).toBe(200);
}

const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

test("a workbook is read, its cells confirmed, a scenario recalculated, saved and picked again; signed out it is the login page", async ({ page, request, browser }, testInfo) => {
  test.setTimeout(240_000);
  const run = `${Date.now().toString(36)}${testInfo.project.name === "desk-mobile" ? "M" : "D"}`.toUpperCase();
  const symbol = `KVM${run}`;
  const title = `model-small-${run}`;

  // A private company for this run, through the capture box.
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(`first note on $${symbol}`);
  await box.press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  // Drop the workbook with its company; pump until the card is in Ready for you.
  await page.goto("/desk/inbox");
  await hydrated(page);
  await page.getByText("Company, filing date and link (optional)").click();
  await page.getByLabel("Company, as $SYMBOL").fill(`$${symbol}`);
  await page.getByLabel("Choose a file").setInputFiles({ name: `${title}.xlsx`, mimeType: XLSX_MIME, buffer: Buffer.from(smallModel(run)) });
  const card = page.locator("article", { hasText: title });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await pump(request);
    await page.reload();
    await expect(card.locator("xpath=ancestor::section[1]")).toHaveAccessibleName(/^Ready for you/, { timeout: 2_000 });
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 4_000] });
  await expect(card.getByText(/^Model read: 3 sheets, \d+ cells, \d+ formulas\. Choose its inputs and results\.$/)).toBeVisible();
  await expect(card.getByText(/Excel workbook/)).toBeVisible();
  await expect(card.getByRole("link", { name: "Review" })).toHaveCount(0);

  // Open model -> Confirm: the report first, with the stale cell and the function the desk cannot compute.
  await card.getByRole("link", { name: "Open model" }).click();
  await expect(page).toHaveURL(/\/desk\/models\/[0-9a-f-]{36}$/);
  const modelUrl = page.url();
  await expect(page.getByRole("heading", { level: 1, name: `$${symbol}` })).toBeVisible();
  await expect(page.getByText("Private. Scenario outputs from your workbook; never published (rule 9).")).toBeVisible();
  const report = page.getByRole("region", { name: "How the workbook was checked" });
  await expect(report.getByText("Checks!B3", { exact: true })).toBeVisible();
  await expect(report.getByText(/uses a function the desk cannot compute yet: CUBEVALUE/)).toBeVisible();
  for (const box of await page.getByRole("checkbox").all()) await expect(box).not.toBeChecked();
  await noSideScroll(page);
  await expectNoViolationsInBothThemes(page);

  // Tick two inputs and one result, label one of them, confirm.
  await page.getByRole("checkbox", { name: /^Assumptions!B1, / }).check();
  await page.getByRole("checkbox", { name: /^Assumptions!B2, / }).check();
  await page.getByRole("checkbox", { name: /^DCF!B13, / }).check();
  await page.getByRole("textbox", { name: "Your label for Assumptions!B1 (optional)" }).fill("Cost of capital");
  await page.getByRole("button", { name: "Use 2 inputs and 1 result" }).click();

  // Scenarios: the calculator loads in its worker; change the cost of capital to 12.5%.
  const field = page.getByRole("textbox", { name: "Cost of capital, scenario value in percent" });
  await expect(field).toBeEnabled({ timeout: 30_000 });
  await expect(field).toHaveValue("11.5");
  const row = page.getByRole("row", { name: /Per-share result/ });
  await expect(row.getByRole("cell").nth(1)).toHaveText(formatNumber(smallPerShare(), RESULT_FORMAT));
  await field.fill("12.5");
  const expected = formatNumber(smallPerShare(0.125), RESULT_FORMAT);
  expect(expected).not.toBe(formatNumber(smallPerShare(), RESULT_FORMAT));
  await expect(row.getByRole("cell").nth(1)).toHaveText(expected, { timeout: 15_000 });
  await noSideScroll(page);

  // Save it as "Bear"; reload; pick it again: the input and the recomputed output come back.
  await page.getByText("Save as scenario").click();
  await page.getByRole("textbox", { name: "Name" }).fill("Bear");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Scenario" })).toHaveValue(/^[0-9a-f-]{36}$/, { timeout: 15_000 });
  await page.reload();
  await expect(field).toBeEnabled({ timeout: 30_000 });
  await expect(field).toHaveValue("11.5");
  await page.getByRole("combobox", { name: "Scenario" }).selectOption({ label: "Bear" });
  await expect(field).toHaveValue("12.5");
  await expect(row.getByRole("cell").nth(1)).toHaveText(expected, { timeout: 15_000 });
  await expectNoViolationsInBothThemes(page);

  // The sensitivity grid: its centre is this scenario (3 x 3 on the phone, 5 x 5 on the desktop).
  await page.getByRole("button", { name: "Fill the grid" }).click();
  const grid = page.getByRole("table", { name: /^Per-share result: / });
  await expect(grid).toBeVisible({ timeout: 30_000 });
  await expect(grid.getByRole("row")).toHaveCount(testInfo.project.name === "desk-mobile" ? 4 : 6);
  await expect(grid.getByRole("cell", { name: /this scenario/ })).toHaveText(`${expected}this scenario`);
  await noSideScroll(page);

  // The list: this company's row links to this model page (the header's "All models" is the way there; the list has no tab).
  await page.getByRole("link", { name: "All models" }).click();
  await expect(page).toHaveURL(/\/desk\/models$/);
  await expect(page.getByRole("link", { name: `$${symbol}`, exact: true })).toHaveAttribute("href", new URL(modelUrl).pathname);
  await noSideScroll(page);

  // The served wasm is public (the proxy only covers /desk); the model page, signed out, is the login page.
  // An empty storage state: the project's admin session must not carry over into this context.
  const anon = await browser.newContext({ baseURL: E2E_SITE_URL, storageState: { cookies: [], origins: [] } });
  const wasm = await anon.request.get("/vendor/ironcalc-0.8.4.wasm");
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()["content-type"]).toContain("application/wasm");
  const signedOut = await anon.newPage();
  await signedOut.goto(modelUrl);
  await expect(signedOut).toHaveURL(/\/login/);
  await anon.close();

  await retire(db, await documentIdOf(db, title));
});
