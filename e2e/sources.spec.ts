import { expect, test, type Browser, type Page } from "@playwright/test";
import { KAVERI } from "../src/test/fixtures/casefile";
import type { Db } from "@/lib/supabase/types";
import { requireStack } from "./support/auth";
import { adminDb, expectNoViolationsInBothThemes, hydrated, openItem } from "./support/desk";
import { guardOutbound, hostsOf, installOutboundGuard } from "./support/outbound";
import { BUY, CHANNEL, CLEAN, PRICE, capture, listIt, panelRow, runGate, saveRevision, status, storedSource, thumbShaOf, waitForRead, type Fixture } from "./support/sources-flow";

installOutboundGuard(); // nothing leaves the machine: the web server runs with LLM_ADAPTER=fixture (made-up YouTube and picture server, support/stack.ts)

// Phase 5d Task 5: the sources loop on the LOCAL stack, through the screens Aksh uses. An `s:` capture of a YouTube link with a company and a
// concept; the made-up YouTube answers (src/modules/documents/fixture-sources.ts); the card shows the title and the channel; the same link again
// adds the note to the one card. On the Kaveri file's "Outside sources" panel: a title with "buy" in it is refused under rule 1 until
// "Show its title and picture" is unticked; a title with a rupee price is refused under rule 3 until the same untick; a clean title, ticked and with
// a note for readers, passes and is on the public file AT ONCE with its picture from our own /media/studied route and no request to any other
// host. Unpublish takes the block away; the last step takes every source off the file again. It leaves the Kaveri file public with no outside
// source (like sources-screens.spec.ts, which runs before it). The links are the made-up ones, so they are the same every run: after `supabase db reset`.

const COMPANY_PATH = "/companies/kavpump";
const SIZES = { 375: { width: 375, height: 812 }, 1280: { width: 1280, height: 800 } } as const;
const FIRST_NOTE = "why the bull case is thin";
const SECOND_NOTE = "second look after the results";
const PUBLIC_NOTE = "A plain walk through a balance sheet, which I use to read dealer credit.";
const PICTURE = "Thumbnail of the video";
const ALL = [BUY, PRICE, CLEAN] as const;

test.describe.configure({ mode: "serial" });

let db: Db;

test.beforeAll(async () => {
  requireStack();
  db = await adminDb();
  for (const video of ALL) {
    if (await storedSource(db, video.id)) throw new Error(`The link ${video.id} is already saved in this database. Run \`pnpm supabase db reset\` before the full suite.`);
  }
});

/** A signed-out visitor: a fresh context with no session, nothing asked of any host but the app's own. */
async function visitor<T>(browser: Browser, size: keyof typeof SIZES, run: (page: Page, asked: string[]) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport: SIZES[size], isMobile: size === 375, hasTouch: size === 375 });
  try {
    const asked = await guardOutbound(context);
    return await run(await context.newPage(), asked);
  } finally {
    await context.close();
  }
}

/** The public file's raw HTML and data, as a signed-out visitor is sent them. */
async function publicHtml(browser: Browser): Promise<string> {
  return visitor(browser, 1280, async (page) => {
    const res = await page.request.get(COMPANY_PATH);
    expect(res.status()).toBe(200);
    return res.text();
  });
}

const pictureStatus = (browser: Browser, video: Fixture) => visitor(browser, 1280, async (page) => (await page.request.get(`/media/studied/${thumbShaOf(video.id)}.jpg`)).status());

async function openKaveri(page: Page): Promise<void> {
  await openItem(page, db, KAVERI.title);
  await hydrated(page);
}

test("an s: capture with a company and a concept is read by the made-up YouTube; the card shows its title and channel", async ({ page }) => {
  await capture(page, `s: https://youtu.be/${BUY.id} $${KAVERI.symbol} #moats ${FIRST_NOTE}`);
  const read = await waitForRead(db, BUY);
  expect(read.note).toContain(FIRST_NOTE);
  expect(read.thumb).toBe(thumbShaOf(BUY.id));

  await page.goto("/desk/sources");
  const card = page.getByRole("listitem").filter({ hasText: BUY.title });
  await expect(card).toHaveCount(1);
  await expect(card.getByText("From YouTube, read", { exact: false })).toBeVisible();
  await expect(card.getByText(CHANNEL)).toBeVisible();
  // The shown note, not the edit box under it that holds the same words.
  await expect(card.getByRole("paragraph").filter({ hasText: FIRST_NOTE })).toBeVisible();
  await expect(card.getByText("Private", { exact: true })).toBeVisible();
  await expect(card.getByRole("img", { name: PICTURE })).toBeVisible();
  await expect(card.getByRole("link", { name: new RegExp(`${KAVERI.symbol}|Kaveri`) })).toBeVisible();
  await expect(card.getByRole("link", { name: "#moats" })).toBeVisible();
});

test("the same link again is one card: his new note is added under a dated line, and nothing else is read", async ({ page }) => {
  const before = await storedSource(db, BUY.id);
  await capture(page, `s: https://youtu.be/${BUY.id} ${SECOND_NOTE}`);
  await expect.poll(async () => (await storedSource(db, BUY.id))?.note ?? "").toContain(SECOND_NOTE);
  const after = (await storedSource(db, BUY.id))!;
  expect(after.note).toContain(FIRST_NOTE);
  expect(after.note).toMatch(/— \d{1,2} [A-Z][a-z]{2} \d{4}[\s\S]*second look after the results/);
  expect(after.thumb).toBe(before?.thumb);
  const rows = await db.from("source_links").select("id").eq("url_key", `yt:${BUY.id}`);
  expect(rows.data).toHaveLength(1);

  await page.goto("/desk/sources");
  const card = page.getByRole("listitem").filter({ hasText: BUY.title });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(FIRST_NOTE);
  await expect(card).toContainText(SECOND_NOTE);
});

test("two more links are saved and read, each with its own picture", async ({ page }) => {
  await capture(page, `s: https://youtu.be/${PRICE.id} $${KAVERI.symbol} a talk with a price in its title`);
  const price = await waitForRead(db, PRICE); // one at a time: a capture is stored before the next page load
  await capture(page, `s: https://youtu.be/${CLEAN.id} $${KAVERI.symbol} #moats dealer credit explained plainly`);
  const clean = await waitForRead(db, CLEAN);
  expect(price.thumb).toBe(thumbShaOf(PRICE.id));
  expect(clean.thumb).toBe(thumbShaOf(CLEAN.id));
  expect(new Set([price.thumb, clean.thumb, thumbShaOf(BUY.id)]).size).toBe(3);
  await page.goto("/desk/sources?company=kavpump");
  for (const video of ALL) await expect(page.getByRole("listitem").filter({ hasText: video.title })).toHaveCount(1);
});

test("a title with 'buy' in it, ticked, is refused under rule 1 for the outside title; the public file is unchanged", async ({ page, browser }) => {
  await openKaveri(page);
  await listIt(panelRow(page, BUY), true);
  await saveRevision(page, "Added a talk on a pump maker.");
  await runGate(page, "fail");
  const failure = page.locator("#gate").getByTestId("gate-failure").first();
  await expect(failure).toHaveAttribute("data-rule", "1");
  await expect(failure).toContainText("In: Title of an outside source");
  await expect(failure.getByTestId("flagged-sentence")).toContainText(BUY.title);

  // The panel says what the last run refused, in the gate's own sentences.
  await page.reload();
  await expect(page.getByRole("region", { name: "Outside sources" }).getByRole("group", { name: "The last gate run refused" })).toContainText("Title of an outside source");

  expect(await publicHtml(browser)).not.toContain(BUY.title);
  await visitor(browser, 1280, async (p) => {
    await p.goto(COMPANY_PATH);
    await expect(p.getByRole("region", { name: "Other people's work I studied" })).toHaveCount(0);
  });
});

test("'Show its title and picture' unticked: the same source passes, and the public file lists the link alone", async ({ page, browser }) => {
  await openKaveri(page);
  await listIt(panelRow(page, BUY), false);
  await saveRevision(page, "Showing the link alone.");
  await runGate(page, "pass");

  const html = await publicHtml(browser);
  expect(html).not.toContain(BUY.title);
  expect(html).not.toContain(FIRST_NOTE); // his private note is not copied anywhere by a tick
  await visitor(browser, 1280, async (p, asked) => {
    await p.goto(COMPANY_PATH);
    const section = p.getByRole("region", { name: "Other people's work I studied" });
    await expect(section.getByRole("listitem")).toHaveCount(1);
    await expect(section.getByText("A video on YouTube")).toBeVisible();
    await expect(section.getByRole("img")).toHaveCount(0);
    await expect(section.getByRole("link", { name: /^Watch on YouTube/ })).toHaveAttribute("href", new RegExp(BUY.id));
    expect(hostsOf(asked)).toEqual([]);
  });
  expect(await pictureStatus(browser, BUY)).toBe(404);
});

test("a title with a rupee price, ticked, is refused under rule 3; unticked, it passes", async ({ page, browser }) => {
  await openKaveri(page);
  await listIt(panelRow(page, PRICE), true);
  await saveRevision(page, "Added a second talk.");
  await runGate(page, "fail");
  const failure = page.locator("#gate").getByTestId("gate-failure").first();
  await expect(failure).toHaveAttribute("data-rule", "3");
  await expect(failure).toContainText("In: Title of an outside source");
  expect(await publicHtml(browser)).not.toContain(PRICE.title);

  await openKaveri(page);
  await listIt(panelRow(page, PRICE), false);
  await saveRevision(page, "Showing the link alone.");
  await runGate(page, "pass");
  expect(await publicHtml(browser)).not.toContain(PRICE.title);
  expect(await pictureStatus(browser, PRICE)).toBe(404);
});

test("a clean title, ticked and with his note for readers, passes and is on the public file at once", async ({ page, browser }) => {
  await openKaveri(page);
  const row = panelRow(page, CLEAN);
  await listIt(row, true);
  await row.getByRole("textbox", { name: "What readers see from me" }).fill(PUBLIC_NOTE);
  await saveRevision(page, "Added a clean talk with a note.");
  await runGate(page, "pass");
  // No hold: the very next signed-out read of the file already has it.
  await visitor(browser, 1280, async (p) => {
    await p.goto(COMPANY_PATH);
    await expect(p.getByRole("region", { name: "Other people's work I studied" }).getByText(CLEAN.title)).toBeVisible();
  });
});

for (const size of [375, 1280] as const) {
  test(`the public file at ${size} px: one full card with our own picture, two plain links, nothing private, axe clean, no other host asked`, async ({ browser }) => {
    await visitor(browser, size, async (page, asked) => {
      expect((await page.goto(COMPANY_PATH))?.status()).toBe(200);
      const section = page.getByRole("region", { name: "Other people's work I studied" });
      await expect(section).toBeVisible();
      const cards = section.getByRole("listitem");
      await expect(cards).toHaveCount(3);

      const full = cards.filter({ hasText: CLEAN.title });
      await expect(full).toHaveCount(1);
      await expect(full.getByText("Title on YouTube")).toBeVisible();
      await expect(full.getByText(`YouTube · ${CHANNEL}`)).toBeVisible();
      await expect(full.getByText(PUBLIC_NOTE)).toBeVisible();
      const picture = full.getByRole("img", { name: PICTURE });
      await picture.scrollIntoViewIfNeeded();
      await expect(picture).toHaveAttribute("src", `/media/studied/${thumbShaOf(CLEAN.id)}.jpg`);
      await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

      for (const plain of [BUY, PRICE]) {
        const card = cards.filter({ has: page.locator(`a[href*="${plain.id}"]`) });
        await expect(card).toHaveCount(1);
        await expect(card.getByText("A video on YouTube")).toBeVisible();
        await expect(card.getByRole("img")).toHaveCount(0);
        await expect(card).not.toContainText(plain.title);
      }
      await expect(section.getByRole("img")).toHaveCount(1);

      expect(hostsOf(asked), "no request left the app's own host: the picture comes from /media/studied").toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await expect(page.locator("h1")).toHaveCount(1);
      await expectNoViolationsInBothThemes(page);

      const html = await (await page.request.get(COMPANY_PATH)).text();
      for (const hidden of [BUY.title, PRICE.title, FIRST_NOTE, SECOND_NOTE, "dealer credit explained plainly"]) expect(html).not.toContain(hidden);
      const image = await page.request.get(`/media/studied/${thumbShaOf(CLEAN.id)}.jpg`);
      expect(image.status()).toBe(200);
      expect(image.headers()["content-type"]).toBe("image/jpeg");
      expect(image.headers()["cache-control"]).toBe("public, max-age=3600, s-maxage=3600");
      for (const plain of [BUY, PRICE]) expect((await page.request.get(`/media/studied/${thumbShaOf(plain.id)}.jpg`)).status()).toBe(404);
    });
  });
}

test("Unpublish takes the block and the picture away; publishing the same revision again brings them back", async ({ page, browser }) => {
  await openKaveri(page);
  await page.locator("#gate").getByRole("button", { name: "Unpublish" }).click();
  await expect(status(page, /private again/)).toBeVisible();
  await expect(page.getByTestId("visibility")).toHaveText("Private");
  await visitor(browser, 1280, async (p) => {
    await p.goto(COMPANY_PATH);
    await expect(p.getByRole("region", { name: "Other people's work I studied" })).toHaveCount(0);
  });
  expect(await pictureStatus(browser, CLEAN)).toBe(404);

  await runGate(page, "pass");
  await expect(page.getByTestId("visibility")).toHaveText("Public");
  await visitor(browser, 1280, async (p) => {
    await p.goto(COMPANY_PATH);
    await expect(p.getByRole("region", { name: "Other people's work I studied" }).getByRole("listitem")).toHaveCount(3);
  });
  expect(await pictureStatus(browser, CLEAN)).toBe(200);
});

test("cleanup: taking every source off the file is one more revision; the block and the picture go, the file stays public", async ({ page, browser }) => {
  await openKaveri(page);
  for (const video of ALL) await panelRow(page, video).getByRole("checkbox", { name: "Show on the public file" }).uncheck();
  await saveRevision(page, "Took the outside sources off the file.");
  await runGate(page, "pass");
  await visitor(browser, 1280, async (p) => {
    expect((await p.goto(COMPANY_PATH))?.status()).toBe(200);
    await expect(p.getByRole("region", { name: "Other people's work I studied" })).toHaveCount(0);
  });
  expect(await pictureStatus(browser, CLEAN)).toBe(404);
});
