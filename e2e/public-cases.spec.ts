import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installOutboundGuard } from "./support/outbound";

installOutboundGuard(); // nothing leaves the machine; only the YouTube frame, after a press, may be asked for

// Plan 3b Task 3. Two states of the same pages, told apart by the Playwright project, never by what the database holds (a skip decided
// by the data cannot fail in the case it exists for):
//  - nothing public (every deploy, until Shlok switches case studies on and publishes one): /cases is a 404 and /process
//    carries no "How this record is kept" section. Nothing a visitor can see has changed.
//  - one ledger case study public (Task 5 publishes one through the real gate on the local stack, or a fixture row does):
//    the pages below are checked for WCAG 2.2 A/AA, one h1, no sideways scroll, and the in-browser fingerprint check.
// The public-* projects always run on the deploy state; the cases-public-* projects always run after the cases loop. A test that does
// not apply to its project is skipped, never passed.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** True in the projects that run after the cases loop has left one case public. */
const published = () => test.info().project.name.startsWith("cases-public");

/** The first published case's path, or null while /cases is a 404. */
async function firstCase(page: Page): Promise<string | null> {
  const response = await page.goto("/cases");
  if (response?.status() === 404) return null;
  return page.locator("main ol a").first().getAttribute("href");
}

async function expectClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test("with no ledger case study public: /cases is a 404, /process has no record section, Mistakes keeps its empty state", async ({ page }) => {
  test.skip(published(), "runs after the cases loop has left one case public");
  expect((await page.goto("/cases"))?.status()).toBe(404);
  expect((await page.goto("/cases/anything-at-all"))?.status()).toBe(404);
  await page.goto("/process");
  await expect(page.getByRole("heading", { name: "How this record is kept" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Read the closed cases" })).toHaveCount(0);
  await page.goto("/mistakes");
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
});

test("with one public: /cases, the case page, /process and Mistakes pass axe, keep one h1 and do not scroll sideways", async ({ page }) => {
  test.skip(!published(), "the deploy state has no public case study");
  const href = await firstCase(page);
  expect(href).not.toBeNull();
  await expectClean(page);
  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 2, name: "How to check these entries" })).toBeVisible();
  await expectClean(page);
  await page.goto("/process");
  await expect(page.getByRole("heading", { level: 2, name: "How this record is kept" })).toBeVisible();
  await expectClean(page);
  await page.goto("/mistakes");
  await expectClean(page);
});

test("with one public: the browser recomputes an entry's fingerprint from the sealed text and says Matches", async ({ page }) => {
  test.skip(!published(), "the deploy state has no public case study");
  const href = await firstCase(page);
  expect(href).not.toBeNull();
  await page.goto(href!);
  const first = page.locator("section[aria-labelledby=check] details").first();
  await first.locator("summary").click();
  await first.getByRole("button", { name: "Check in this browser" }).click();
  await expect(first.getByRole("status")).toHaveText(/^Matches: the fingerprint before it and this text give this fingerprint\.$/);
});
