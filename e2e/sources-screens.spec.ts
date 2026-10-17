import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { KAVERI } from "../src/test/fixtures/casefile";
import { adminDb, hydrated, openItem } from "./support/desk";
import { guardOutbound, hostsOf } from "./support/outbound";
import { seedSourceForCompany, WORLD_CHANNEL, WORLD_NOTE, WORLD_TITLE, type SourcesWorld } from "./support/sources-world";

// Phase 5d Task 4: the sources screens, on a source the server's read would have left (support/sources-world.ts: no request leaves the machine).
// The desk list and the file page's panel, in both themes and at both sizes; then the real path from the panel to the public file: save a
// revision, run the gate, and see the block with its picture from our own route on the public file AT ONCE; then take it off again. The full
// capture-to-public loop with the fixture sites is e2e/sources.spec.ts (Task 5). Serial: each step builds on the one before.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SIZES = { 375: { width: 375, height: 812 }, 1280: { width: 1280, height: 800 } } as const;
const status = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

/** Set SOURCES_SHOTS=<folder> to keep a picture of each screen for a visual review (not part of a normal run). */
async function shot(page: Page, name: string): Promise<void> {
  if (process.env.SOURCES_SHOTS) await page.screenshot({ path: `${process.env.SOURCES_SHOTS}/${name}.png`, fullPage: true });
}

test.describe.configure({ mode: "serial" });
let world: SourcesWorld;

test.beforeAll(async () => {
  world = await seedSourceForCompany(await adminDb(), KAVERI.symbol);
});

test("'Read again' inside the first minute after a read says so in the fixed words, never the server's", async ({ page }) => {
  await page.goto("/desk/sources");
  await hydrated(page);
  // The seeded read was just now, so the one-minute cooldown holds. This test runs first on purpose: a minute later the press would really ask the
  // fixture site and replace the seeded title, which every later step relies on.
  await page.getByRole("listitem").filter({ hasText: WORLD_TITLE }).getByRole("button", { name: "Read again" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("The desk read this link less than a minute ago. Try again in a minute.");
});

async function expectClean(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

for (const [width, size] of Object.entries(SIZES)) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`/desk/sources at ${width} px (${colorScheme}): the saved source in the machine face, axe clean, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme });
      await page.goto("/desk/sources");
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1, name: "Sources" })).toBeVisible();
      const card = page.getByRole("listitem").filter({ hasText: WORLD_TITLE });
      await expect(card.getByText("From YouTube, read", { exact: false })).toBeVisible();
      await expect(card.getByText(WORLD_CHANNEL)).toBeVisible();
      await expect(card.locator("p", { hasText: WORLD_NOTE })).toBeVisible();
      await expect(card.getByText("Private", { exact: true })).toBeVisible();
      await expect(card.getByRole("img", { name: "Thumbnail of the video" })).toBeVisible();
      await expectClean(page);
      await shot(page, `desk-sources-${width}-${colorScheme}`);
    });
  }
}

test("the desk picture comes through the admin-only route as a private JPEG", async ({ page }) => {
  const res = await page.request.get(`/desk/sources/${world.sourceId}/thumb`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/jpeg");
  expect(res.headers()["cache-control"]).toBe("private, max-age=300");
  expect((await page.request.get("/desk/sources/not-a-uuid/thumb")).status()).toBe(404);
});

test("the filters narrow the list and the add form shows its refusal and keeps what was typed", async ({ page }) => {
  await page.goto("/desk/sources?company=kavpump");
  await hydrated(page);
  await expect(page.getByRole("listitem").filter({ hasText: WORLD_TITLE })).toBeVisible();
  await page.goto("/desk/sources?public=1");
  await expect(page.getByRole("listitem").filter({ hasText: WORLD_TITLE })).toHaveCount(0);
  await page.goto("/desk/sources");
  await hydrated(page);
  await page.getByRole("textbox", { name: "Link" }).fill("not a link");
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("A source needs a link.");
  await expect(page.getByRole("textbox", { name: "Link" })).toHaveValue("not a link");
});

for (const [width, size] of Object.entries(SIZES)) {
  test(`the file page's Outside sources panel at ${width} px: axe clean in both themes, the picture warning beside the picture`, async ({ page }) => {
    await page.setViewportSize(size);
    await openItem(page, await adminDb(), KAVERI.title);
    await hydrated(page);
    const panel = page.getByRole("region", { name: "Outside sources" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("The desk does not read pictures. Untick if this one tells people to buy or sell.")).toBeVisible();
    await panel.getByRole("checkbox", { name: "Show on the public file" }).first().check();
    await expect(panel.getByRole("checkbox", { name: "Show its title and picture" }).first()).toBeVisible();
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expectClean(page);
      await shot(page, `panel-${width}-${colorScheme}`);
    }
    await page.emulateMedia({ colorScheme: "light" });
  });
}

async function runGate(page: Page): Promise<void> {
  await page.getByRole("checkbox", { name: /I have not changed my stance on/ }).check();
  await page.getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ }).click();
  await expect(status(page, /^Published\.$/)).toBeVisible();
  await expect(page.locator("#gate").getByTestId("gate-decision")).toHaveAttribute("data-verdict", "pass");
}

test("from the panel to the gate: a ticked source is saved as a revision, the checklist has the rule 14 lines, and the gate passes", async ({ page }) => {
  await page.setViewportSize(SIZES[1280]);
  await openItem(page, await adminDb(), KAVERI.title);
  await hydrated(page);
  const panel = page.getByRole("region", { name: "Outside sources" });
  await panel.getByRole("checkbox", { name: "Show on the public file" }).first().check();
  await panel.getByRole("button", { name: "Use my private note" }).first().click();
  await expect(panel.getByRole("textbox", { name: "What readers see from me" }).first()).toHaveValue(WORLD_NOTE);
  await panel.getByRole("textbox", { name: /Change reason/ }).fill("Added a talk on dealer finance.");
  await panel.getByRole("button", { name: "Save as a new revision" }).click();
  await expect(status(page, /^Revision saved\.$|waiting for the publishing gate/)).toBeVisible();
  const checklist = page.getByRole("heading", { name: "Check before publishing" });
  await expect(checklist).toBeVisible();
  await expect(page.getByText("Outside sources match what you chose (rule 14).")).toBeVisible();
  await expect(page.getByText("Outside titles and links pass the wording check.")).toBeVisible();
  await runGate(page);
});

async function expectBlockOnPublicFile(browser: Browser, size: keyof typeof SIZES): Promise<void> {
  const context = await browser.newContext({ viewport: SIZES[size], isMobile: size === 375, hasTouch: size === 375 });
  try {
    const asked = await guardOutbound(context);
    const page = await context.newPage();
    const response = await page.goto("/companies/kavpump");
    expect(response?.status()).toBe(200);
    const section = page.getByRole("region", { name: "Other people's work I studied" });
    await expect(section).toBeVisible();
    await expect(section.getByText("Videos, articles and letters by others, with my note on each. Linked, not endorsed.")).toBeVisible();
    const titleLine = section.locator("p", { hasText: new RegExp(`^${WORLD_TITLE}$`) });
    await expect(titleLine).toBeVisible();
    await expect(section.getByText("Title on YouTube")).toBeVisible();
    await expect(section.getByText(`YouTube · ${WORLD_CHANNEL}`)).toBeVisible();
    await expect(section.locator("p", { hasText: WORLD_NOTE })).toBeVisible();
    const link = section.getByRole("link", { name: /^Watch on YouTube/ });
    await expect(link).toHaveAttribute("href", `https://www.youtube.com/watch?v=e2eSrcVid01`);
    await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");

    const picture = section.getByRole("img", { name: "Thumbnail of the video" });
    await picture.scrollIntoViewIfNeeded();
    await expect(picture).toHaveAttribute("src", `/media/studied/${world.thumbSha}.jpg`);
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    expect(hostsOf(asked), "no request left the app's own host: the picture comes from /media/studied").toEqual([]);

    await expectClean(page);
    await expect(page.locator("h1")).toHaveCount(1);
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: process.env.SOURCES_SHOTS ? `${process.env.SOURCES_SHOTS}/public-block-${size}-light.png` : undefined });
    await page.emulateMedia({ colorScheme: "dark" });
    await expectClean(page);
    await section.screenshot({ path: process.env.SOURCES_SHOTS ? `${process.env.SOURCES_SHOTS}/public-block-${size}-dark.png` : undefined });
    await page.emulateMedia({ colorScheme: "light" });

    // The sheet a printer gets: the picture is not printed, the title, his note and the address are.
    await page.emulateMedia({ media: "print" });
    await expect(picture).toBeHidden();
    expect(await link.evaluate((a) => getComputedStyle(a, "::after").content)).toContain("https://www.youtube.com/watch?v=e2eSrcVid01");
    await expect(titleLine).toBeVisible();
    await page.emulateMedia({ media: "screen" });

    const image = await context.request.get(`/media/studied/${world.thumbSha}.jpg`);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/jpeg");
    expect(image.headers()["cache-control"]).toBe("public, max-age=3600, s-maxage=3600");
    expect(image.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await context.request.get(`/media/studied/${"0".repeat(64)}.jpg`)).status()).toBe(404);
    expect((await context.request.get(`/media/studied/${world.thumbSha}.png`)).status()).toBe(404);
  } finally {
    await context.close();
  }
}

for (const size of [375, 1280] as const) {
  test(`the public file shows the source at once at ${size} px, with its picture from our own route, and nothing leaves the app's host`, async ({ browser }) => {
    await expectBlockOnPublicFile(browser, size);
  });
}

test("the derived surfaces do not change: the feed and the sitemap name no outside source", async ({ request }) => {
  const feed = await (await request.get("/feed.xml")).text();
  expect(feed).not.toContain(WORLD_TITLE);
  expect(feed).not.toContain("e2eSrcVid01");
  expect(feed).not.toMatch(/ytimg|\/media\/studied/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toMatch(/media\/studied|youtube/);
});

test("taking the source off the file is a new revision, and the public block goes with the next gate pass", async ({ page, browser }) => {
  await page.setViewportSize(SIZES[1280]);
  await openItem(page, await adminDb(), KAVERI.title);
  await hydrated(page);
  const panel = page.getByRole("region", { name: "Outside sources" });
  await expect(panel.getByRole("checkbox", { name: "Show on the public file" }).first()).toBeChecked();
  // While the public file lists it, the desk will not archive it, and says why.
  await page.goto("/desk/sources");
  await hydrated(page);
  await expect(page.getByRole("listitem").filter({ hasText: WORLD_TITLE }).getByText("On the public file")).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: WORLD_TITLE }).getByRole("button", { name: "Archive" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("It is on the public file. Save a revision without it first.");

  await openItem(page, await adminDb(), KAVERI.title);
  await hydrated(page);
  await page.getByRole("region", { name: "Outside sources" }).getByRole("checkbox", { name: "Show on the public file" }).first().uncheck();
  await page.getByRole("region", { name: "Outside sources" }).getByRole("button", { name: "Save as a new revision" }).click();
  await expect(status(page, /^Revision saved\.$|waiting for the publishing gate/)).toBeVisible();
  await runGate(page);

  const context = await browser.newContext({ viewport: SIZES[1280] });
  try {
    const gone = await context.newPage();
    await gone.goto("/companies/kavpump");
    await expect(gone.getByRole("region", { name: "Other people's work I studied" })).toHaveCount(0);
    // The picture is no longer shown by any public entry, so the route stops serving it (storage says not readable).
    expect((await context.request.get(`/media/studied/${world.thumbSha}.jpg`)).status()).toBe(404);
  } finally {
    await context.close();
  }
});
