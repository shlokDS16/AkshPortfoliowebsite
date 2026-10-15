import { expect, test } from "@playwright/test";
import { extractText } from "unpdf";

// Plan 5a Task 3 (spec s5, D71, publishing rule 11.4): a desk page may be printed, and the paper says it is private. Runs in the desk-*
// projects, which carry the admin's session. Printing is not blocked; the desk's bars and tabs stay off the paper.
const BANNER = "Private desk copy. Not for sharing: it has not passed the publish gate and may show figures less than 30 days old.";

test("a printed desk page carries the private-copy banner and none of the desk's chrome; on screen there is no banner", async ({ page }) => {
  await page.goto("/desk/items");
  await expect(page.getByRole("link", { name: "Concepts" })).toBeVisible();
  await expect(page.locator("[data-print-banner]")).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-print-banner]")).toBeVisible();
  await expect(page.locator("[data-print-banner]")).toHaveText(BANNER);
  // Role queries leave out what is hidden, so the chrome is named by its markup: both tab bars, the sign-out button and the capture dock.
  const tabs = page.locator("nav[aria-label='Desk sections']");
  await expect(tabs).toHaveCount(2);
  for (const nav of await tabs.all()) await expect(nav).toBeHidden();
  await expect(page.locator("button", { hasText: "Sign out" })).toBeHidden();
  await expect(page.locator("button[data-shortcuts]")).toBeHidden();
  await page.emulateMedia({ media: null });
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("a desk PDF names itself private on its first page, in the page's own block", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium" || test.info().project.name !== "desk-desktop", "page.pdf is Chromium's; once is enough");
  await page.goto("/desk/items");
  const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true });
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  expect(text.replace(/\s+/g, " ")).toContain(BANNER);
  expect(text).not.toContain("Sign out");
});
