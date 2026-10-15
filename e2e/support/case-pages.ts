import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page } from "@playwright/test";

// What a signed-out visitor sees of a published ledger case (Plan 3b Task 5), at the two sizes the public projects use. Used by
// e2e/cases.spec.ts after each publish. Everything here reads the live site as an anonymous browser context: no cookies, no session.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
export const SIZES = { 375: { width: 375, height: 812 }, 1280: { width: 1280, height: 800 } } as const;

export type CaseShown = {
  slug: string;
  title: string;
  company: string;
  /** Number of reviews (lessons) the page should carry. */
  reviews: number;
  /** Whether the weekly chart should be drawn (the second owner switch was on when this revision passed the gate). */
  chart: boolean;
  /** The kinds of mistake the newest review named, in the words the page uses ("timing" or "timing, sizing"). */
  mistakes: string;
};

async function expectClean(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

/** The case page, /cases, /mistakes and /process for an anonymous visitor: content, what is absent, the in-browser check, axe. */
export async function expectPublicCase(browser: Browser, size: keyof typeof SIZES, shown: CaseShown): Promise<void> {
  const context = await browser.newContext({ viewport: SIZES[size], isMobile: size === 375, hasTouch: size === 375 });
  try {
    const page = await context.newPage();
    const response = await page.goto(`/cases/${shown.slug}`);
    expect(response?.status()).toBe(200);
    // His private note never leaves the ledger: it is in neither the page nor the data the page was built from.
    expect(await response!.text()).not.toContain("Private note");
    await expect(page.getByRole("heading", { level: 1, name: shown.company })).toBeVisible();
    for (const name of ["What he expected", "What happened", "What he learned", "Looking back", "How to check these entries"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await expect(page.getByText("Expected Tamarind Ridge Textiles Ltd to do better than the Nifty 50 over 1 year.")).toBeVisible();
    await expect(page.locator("blockquote").filter({ hasText: "its order book is growing faster than I think the market expects" })).toBeVisible();
    await expect(page.locator("blockquote").filter({ hasText: "Shortening the period to six months." })).toBeVisible();
    await expect(page.locator("blockquote").filter({ hasText: "Closing the idea. The order book fell for two quarters in a row" })).toBeVisible();
    await expect(page.locator("blockquote").filter({ hasText: "The thesis broke because I misread how long the big order would last." })).toBeVisible();
    await expect(page.getByText("His call on his own process: flawed.")).toHaveCount(shown.reviews);
    await expect(page.getByText("A past case, not a view on the share today.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Disclosure" })).toBeVisible();
    await expect(page.getByText("Fingerprint").first()).toBeVisible();
    expect(await page.locator("main").innerText()).toMatch(/Fingerprint\s+[0-9a-f]{64}/);
    // The public copy is off: no entry is said to be listed anywhere, and the page says what its check cannot show.
    await expect(page.getByText(/Listed in the public file/)).toHaveCount(0);
    await expect(page.getByText("the public copy of the fingerprints is not switched on.")).toBeVisible();
    // No result is printed (rule 10.7), with or without the chart.
    expect(await page.locator("main").innerText()).not.toMatch(/₹|%/);
    await expect(page.getByRole("img", { name: /^Weekly line chart/ })).toHaveCount(shown.chart ? 1 : 0);
    if (shown.chart) {
      await expect(page.getByRole("img", { name: /^Weekly line chart of Tamarind Ridge Textiles Ltd and the Nifty 50, both rebased to 100 at the entry close on / })).toBeVisible();
      await expect(page.locator("figure").filter({ has: page.getByRole("img") }).locator("figcaption")).toBeVisible();
    }
    await expectClean(page);

    // The check recomputes every shown fingerprint in the browser, no network.
    const entries = page.locator("section[aria-labelledby=check] details");
    const count = await entries.count();
    expect(count).toBe(3 + shown.reviews);
    for (let i = 0; i < count; i++) {
      const entry = entries.nth(i);
      await entry.locator("summary").click();
      await entry.getByRole("button", { name: "Check in this browser" }).click();
      await expect(entry.getByRole("status")).toHaveText(/^Matches: the fingerprint before it and this text give this fingerprint\.$/);
    }
    await expectClean(page);

    await page.goto("/cases");
    // A database that earlier runs have used holds earlier cases too: this one is found by its own address.
    const mine = (p: Page) => p.locator("li").filter({ has: p.locator(`a[href="/cases/${shown.slug}"]`) });
    await expect(mine(page).getByRole("link", { name: shown.title })).toBeVisible();
    await expectClean(page);

    await page.goto("/mistakes");
    await expect(mine(page).getByRole("link", { name: shown.title })).toBeVisible();
    await expect(mine(page).getByText("His call on his own process: flawed.")).toBeVisible();
    await expect(mine(page).getByText(`Kinds of mistake he named: ${shown.mistakes}.`)).toBeVisible();
    await expectClean(page);

    await page.goto("/process");
    await expect(page.getByRole("heading", { level: 2, name: "How this record is kept" })).toBeVisible();
    await expectClean(page);
  } finally {
    await context.close();
  }
}

/** Status codes only: a page that was public stays public while the switches are off (D28). */
export async function expectStillPublic(browser: Browser, slug: string, company: string): Promise<void> {
  const context = await browser.newContext({ viewport: SIZES[1280] });
  try {
    const page = await context.newPage();
    expect((await page.goto(`/cases/${slug}`))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: company })).toBeVisible();
  } finally {
    await context.close();
  }
}
