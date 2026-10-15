import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page } from "@playwright/test";

// What a signed-out visitor sees once a gated revision links public concepts (Plan 4 Task 6), at the two sizes the public projects use.
// Every check reads the live site as an anonymous browser context: no cookies, no session.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
export const SIZES = { 375: { width: 375, height: 812 }, 1280: { width: 1280, height: 800 } } as const;

export type Concept = { slug: string; name: string };
export type ConceptsShown = {
  /** The public concepts of the note's current revision, A to Z as /concepts lists them. */
  concepts: readonly Concept[];
  /** The note's page path (/notes/slug) and title. */
  notePath: string;
  noteTitle: string;
  /** Names that must appear nowhere on these pages (a private concept, a withheld reason). */
  absent?: readonly string[];
};

async function expectClean(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

/** /concepts, one concept page and the note page, for an anonymous visitor: content, what is absent, axe, one h1, no sideways scroll. */
export async function expectPublicConcepts(browser: Browser, size: keyof typeof SIZES, shown: ConceptsShown): Promise<void> {
  const context = await browser.newContext({ viewport: SIZES[size], isMobile: size === 375, hasTouch: size === 375 });
  try {
    const page = await context.newPage();
    const index = await page.goto("/concepts");
    expect(index?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Concepts" })).toBeVisible();
    for (const c of shown.concepts) await expect(page.locator(`main ol a[href="/concepts/${c.slug}"]`)).toHaveText(c.name);
    await expectClean(page);
    for (const text of shown.absent ?? []) expect(await page.content()).not.toContain(text);

    const first = shown.concepts[0];
    const concept = await page.goto(`/concepts/${first.slug}`);
    expect(concept?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: first.name })).toBeVisible();
    await expect(page.getByText(`Notes and case files by Aksh Agrawal that use ${first.name}, newest first.`)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Notes" })).toBeVisible();
    await expect(page.getByText(shown.noteTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Since \d{1,2} [A-Z][a-z]{2} \d{4}$/).first()).toBeVisible();
    await expectClean(page);

    const note = await page.goto(shown.notePath);
    expect(note?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: shown.noteTitle })).toBeVisible();
    const line = page.getByRole("list", { name: "Concepts" });
    await expect(line.getByRole("link")).toHaveText(shown.concepts.map((c) => c.name));
    for (const c of shown.concepts) await expect(line.locator(`a[href="/concepts/${c.slug}"]`)).toBeVisible();
    if (size === 375) {
      for (const h of await line.getByRole("link").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
    }
    await expectClean(page);
    for (const text of shown.absent ?? []) expect(await page.content()).not.toContain(text);
  } finally {
    await context.close();
  }
}
