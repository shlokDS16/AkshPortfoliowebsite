import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installOutboundGuard } from "./support/outbound";

installOutboundGuard(); // nothing leaves the machine

// Plan 5c Task 15. The published half of the public letters pages, signed out, at 375 and 1280. Told apart by the Playwright project, never by
// what the database holds: the public-* projects run on the deploy state (no letter; e2e/public-letters.spec.ts checks that), and the
// letters-public-* projects run after letters.spec.ts, which leaves one SENT letter public with the sign-ups shut. The facts of that letter
// (its words, its card, the feed and sitemap lines, its removal) are letters.spec.ts.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const published = () => test.info().project.name.startsWith("letters-public");

async function expectClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test("with a letter on the archive and the sign-ups shut: the archive lists it, the letter passes axe and does not scroll sideways, and there is no form to subscribe", async ({ page }) => {
  test.skip(!published(), "the deploy state has no public letter");
  expect((await page.goto("/letters"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Letters" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask to subscribe" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Stop my letters" })).toBeVisible();
  await expectClean(page);

  const href = await page.locator("main ol a, main ul a").filter({ hasNotText: "Stop my letters" }).first().getAttribute("href");
  expect(href).toMatch(/^\/letters\/[a-z0-9-]+$/);
  await page.goto(href!);
  await expect(page.getByText("LETTER", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "What changed" })).toBeVisible();
  await expect(page.getByText(/unsubscribe/i)).toHaveCount(0);
  await expectClean(page);

  // The leave page is there whatever the switch says.
  expect((await page.goto("/letters/leave"))?.status()).toBe(200);
  await expectClean(page);
});
