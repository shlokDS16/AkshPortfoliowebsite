import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { fixtureLettersDirectory, peekFixtureLetters, resetFixtureLetters, type FixtureLetters } from "../../src/lib/providers/fixture-letters";
import { requireStack } from "./auth";
import { guardOutbound } from "./outbound";
import { E2E_SITE_URL } from "./stack";

// What the letters loop (e2e/letters.spec.ts) shares: the fixture outbox, a signed-out visitor, and the public pages of a letter. Nothing here
// can send. The web server runs with DISTRIBUTION_ADAPTER=fixture (support/stack.ts), so "sending" appends to a JSON file in the temp folder
// named from the local database's address; this process reads that file and never writes to it except to empty it. LOCAL stack only.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
export const ASKED = "Thanks. Aksh sends confirmation emails by hand, usually within a day. Open the link in it to start receiving letters.";

const where = () => ({ directory: fixtureLettersDirectory(requireStack().apiUrl) });
/** What the fixture ports were asked to send so far. */
export const outbox = (): FixtureLetters => peekFixtureLetters(where());
/** Forgets everything "sent" (the file is the fixture's own; the real service has no such file). */
export const emptyOutbox = (): void => resetFixtureLetters(where());

/** A browser context with no session, routed through the outbound guard. The caller closes it. */
export async function signedOut(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: E2E_SITE_URL, viewport: { width: 1280, height: 800 } });
  await guardOutbound(context);
  return context;
}

/** What a reader does on /letters: waits the three seconds a person needs, ticks, asks. The page answers with the same sentence every time. */
export async function askToSubscribe(browser: Browser, email: string): Promise<void> {
  const context = await signedOut(browser);
  try {
    const page = await context.newPage();
    await page.goto("/letters");
    await page.waitForTimeout(3300);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("I am 18 or older").check();
    await page.getByRole("button", { name: "Ask to subscribe" }).click();
    await expect(page.getByText(ASKED)).toBeVisible();
  } finally {
    await context.close();
  }
}

/** The one link in the confirmation email that went to this address (null when none went). */
export function confirmationLinkFor(email: string): string | null {
  const mail = outbox().emails.filter((e) => e.to === email.toLowerCase());
  if (mail.length === 0) return null;
  expect(mail, "exactly one confirmation email for this address").toHaveLength(1);
  const link = /https?:\/\/\S+\/letters\/confirm\?t=\S+?(?=\s|\)|$)/.exec(mail[0].text)?.[0];
  return link ?? null;
}

/** The email's link opened as the reader opens it: a GET shows a button and changes nothing; the press confirms. */
export async function confirmFromEmail(browser: Browser, email: string, stateOf: () => Promise<string | undefined>): Promise<void> {
  const link = confirmationLinkFor(email);
  expect(link, "the confirmation email holds a token link").not.toBeNull();
  const context = await signedOut(browser);
  try {
    const page = await context.newPage();
    await page.goto(link!);
    await expect(page.getByRole("heading", { level: 1, name: "Confirm your subscription" })).toBeVisible();
    expect(await stateOf(), "opening the link changes nothing").toBe("sent");
    await page.getByRole("button", { name: "Yes, send me the letters" }).click();
    await expect(page).toHaveURL(/\/letters\/confirm\?r=confirmed$/);
    await expect(page.getByText("You will get the next letter.")).toBeVisible();
    expect(await stateOf()).toBe("confirmed");
  } finally {
    await context.close();
  }
}

/** What a reader does on /letters/leave. */
export async function leave(browser: Browser, email: string): Promise<void> {
  const context = await signedOut(browser);
  try {
    const page = await context.newPage();
    await page.goto("/letters/leave");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Done. If a letter was already on its way, it may still arrive.")).toBeVisible();
  } finally {
    await context.close();
  }
}

export type LetterShown = { slug: string; subject: string; objective: string };

async function clean(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

/** The archive, the letter page, its card, the feed and the sitemap, for a visitor with no session. Returns the card's address and the first entry's title. */
export async function expectLetterPublic(browser: Browser, shown: LetterShown): Promise<{ card: string; firstEntry: string }> {
  const context = await signedOut(browser);
  try {
    const page = await context.newPage();
    expect((await page.goto("/letters"))?.status()).toBe(200);
    await expect(page.getByRole("link", { name: shown.subject })).toHaveAttribute("href", `/letters/${shown.slug}`);
    await clean(page);

    expect((await page.goto(`/letters/${shown.slug}`))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: shown.subject })).toBeVisible();
    await expect(page.getByText(shown.objective)).toBeVisible();
    const entries = page.getByRole("region", { name: "What changed" }).getByRole("listitem");
    expect(await entries.count()).toBeGreaterThan(0);
    const firstEntry = ((await entries.first().getByRole("link").first().textContent()) ?? "").trim();
    expect(firstEntry).not.toBe("");
    await expect(page.getByText(/unsubscribe/i)).toHaveCount(0);
    await clean(page);

    const card = (await page.locator("meta[property='og:image']").getAttribute("content")) ?? "";
    expect(card).toContain(`/letters/${shown.slug}/opengraph-image`);
    const image = await page.request.get(card);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    expect(await (await page.request.get("/feed.xml")).text()).toContain(`/letters/${shown.slug}#r`);
    expect(await (await page.request.get("/sitemap.xml")).text()).toContain(`/letters/${shown.slug}`);
    return { card, firstEntry };
  } finally {
    await context.close();
  }
}

/** After Unpublish: the page, its card, its feed line and its sitemap line are gone. */
export async function expectLetterGone(browser: Browser, slug: string, card: string): Promise<void> {
  const context = await signedOut(browser);
  try {
    const request = context.request;
    expect((await request.get(`/letters/${slug}`)).status()).toBe(404);
    expect((await request.get(card)).status()).toBe(404);
    expect(await (await request.get("/feed.xml")).text()).not.toContain(`/letters/${slug}`);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain(`/letters/${slug}`);
  } finally {
    await context.close();
  }
}
