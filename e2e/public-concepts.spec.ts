import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Plan 4 Task 5. Two states of the same pages, told apart by what the local database holds:
//  - nothing linked and public (every deploy, until Shlok publishes a note or file that links a concept he made public): /concepts is a
//    404, so is every /concepts/[slug], and no file or note page carries a Concepts line. Nothing a visitor can see has changed.
//  - one public concept linked by a gated revision (Task 6 publishes one through the real gate on the local stack): /concepts, a concept
//    page and the page of an item that carries the line are checked for WCAG 2.2 A/AA, one h1, no sideways scroll.
// A test that does not apply to the state it finds is skipped, never passed.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The first public concept's path, or null while /concepts is a 404. */
async function firstConcept(page: Page): Promise<string | null> {
  const response = await page.goto("/concepts");
  if (response?.status() === 404) return null;
  return page.locator("main ol a").first().getAttribute("href");
}

async function expectClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test("with no public concept: /concepts and every concept page are a 404, and a file and a note carry no Concepts line", async ({ page }) => {
  test.skip((await firstConcept(page)) !== null, "a public concept is linked in this database");
  expect((await page.goto("/concepts"))?.status()).toBe(404);
  expect((await page.goto("/concepts/anything-at-all"))?.status()).toBe(404);
  await page.goto("/companies/kavpump");
  await expect(page.getByRole("list", { name: "Concepts" })).toHaveCount(0);
  await page.goto("/notes");
  await page.getByRole("link", { name: "How to read receivable days" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How to read receivable days" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Concepts" })).toHaveCount(0);
  // Not in the rail or the phone tabs either: the index is reached from a Concepts line, never from the chrome.
  await expect(page.locator("nav a[href='/concepts']")).toHaveCount(0);
});

test("with one public: the index, the concept page and an item's Concepts line pass axe, keep one h1 and do not scroll sideways", async ({ page, isMobile }) => {
  const href = await firstConcept(page);
  test.skip(href === null, "no public concept is linked in this database");
  await expect(page.getByRole("heading", { level: 1, name: "Concepts" })).toBeVisible();
  await expectClean(page);

  await page.goto(href!);
  await expect(page.getByText("CONCEPT", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Notes and case files by Aksh Agrawal that use .+, newest first\.$/)).toBeVisible();
  await expect(page.getByText(/^Since \d{1,2} [A-Z][a-z]{2} \d{4}$/).first()).toBeVisible();
  await expectClean(page);

  // The first note or file listed opens, and its own page carries the line that leads back (a closed case page carries none: it is unchanged).
  const entry = page.locator("main ol li a[href^='/notes/'], main ol li a[href^='/process/'], main ol li a[href^='/companies/']").first();
  test.skip((await entry.count()) === 0, "this concept is used only by closed cases");
  const itemHref = await entry.getAttribute("href");
  await page.goto(itemHref!);
  const line = page.getByRole("list", { name: "Concepts" });
  await expect(line).toBeVisible();
  await expect(line.locator(`a[href="${href}"]`)).toBeVisible();
  if (isMobile) {
    for (const h of await line.getByRole("link").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
  }
  await expectClean(page);
});
