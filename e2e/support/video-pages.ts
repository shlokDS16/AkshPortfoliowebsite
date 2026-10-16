import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { derivedProblems } from "../../src/modules/showcase/derived-scan";
import { SITE } from "./derived";
import { FRAME_HOST, guardOutbound, hostsOf } from "./outbound";

// What a signed-out visitor, a feed reader, a crawler and a social network see of a listed video (Plan 5b Task 9), and what they see once it is
// unpublished. Every check reads the live site as an anonymous browser context: no cookies, no session. Nothing here reaches Google: every
// request to a host outside this machine is recorded and answered locally (support/outbound.ts); the page may ask for nothing until the
// press, and the press then asks for the privacy-enhanced frame, once.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
export const SIZES = { 375: { width: 375, height: 812 }, 1280: { width: 1280, height: 800 } } as const;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const PNG = [0x89, 0x50, 0x4e, 0x47];
const NOCOOKIE = "youtube-nocookie.com";

export type VideoShown = {
  slug: string;
  title: string;
  objective: string;
  youtubeId: string;
  /** His chapter lines as the page prints them, in order. */
  chapters: readonly { clock: string; title: string }[];
  /** Text that must be in the transcript region (a phrase from the first cue). */
  spoken: string;
};

async function expectClean(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

/** /videos and the video page for an anonymous visitor: content, axe, one h1, no sideways scroll, and no request to YouTube until the press. */
export async function expectPublicVideo(browser: Browser, size: keyof typeof SIZES, shown: VideoShown): Promise<void> {
  const context = await browser.newContext({ viewport: SIZES[size], isMobile: size === 375, hasTouch: size === 375 });
  try {
    // Every address outside this machine, in order. The frame is answered locally, anything else is aborted: nothing leaves the machine.
    const asked = await guardOutbound(context);
    const page = await context.newPage();

    const index = await page.goto("/videos");
    expect(index?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Videos" })).toBeVisible();
    await expect(page.locator(`main a[href="/videos/${shown.slug}"]`).first()).toContainText(shown.title);
    await expectClean(page);
    expect(hostsOf(asked), "the index asks nothing of Google or YouTube").toEqual([]);

    const response = await page.goto(`/videos/${shown.slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: shown.title })).toBeVisible();
    await expect(page.getByText(shown.objective)).toBeVisible();
    const chapters = page.getByRole("region", { name: "Chapters" });
    for (const c of shown.chapters) await expect(chapters.getByRole("link", { name: new RegExp(`${c.clock}\\s*${c.title}`) })).toBeVisible();
    const transcript = page.getByRole("region", { name: "Transcript" });
    await expect(transcript).toContainText(shown.spoken);
    await expect(page.getByText("Typed by machine from the video's captions and not edited.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Play video \(loads YouTube\)/ })).toBeVisible();
    await expectClean(page);
    expect(hostsOf(asked), "nothing is asked of Google or YouTube (ytimg.com, youtube.com, youtube-nocookie.com, google*.com) before the press: no frame, no picture").toEqual([]);

    await page.getByRole("button", { name: /^Play video \(loads YouTube\)/ }).click();
    const frame = page.locator("iframe");
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("src", new RegExp(`^https://www\\.${NOCOOKIE.replace(/\./g, "\\.")}/embed/${shown.youtubeId}`));
    await expect.poll(() => asked.length, { message: "one request after the press" }).toBe(1);
    expect(new URL(asked[0] as string).hostname, "and it is the privacy-enhanced frame").toMatch(FRAME_HOST);
  } finally {
    await context.close();
  }
}

/** The video's structured data, share card, feed entry and sitemap line: present and free of anything the machine keeps private. */
export async function expectVideoSurfaces(page: Page, request: APIRequestContext, shown: VideoShown): Promise<void> {
  const path = `/videos/${shown.slug}`;

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`<loc>${SITE}/videos</loc>`);
  expect(sitemap).toContain(`<loc>${SITE}${path}</loc>`);

  const feed = await (await request.get("/feed.xml")).text();
  const entry = feed.split("<item>").find((chunk) => chunk.includes(`<link>${SITE}${path}</link>`));
  expect(entry, "the video is in the feed").toBeDefined();
  expect(entry).toMatch(new RegExp(`<guid isPermaLink="false">${path}#r\\d+</guid>`));
  expect(entry).toContain("Video · R");
  expect(derivedProblems(entry!)).toEqual([]);
  expect(entry).not.toMatch(UUID);
  expect(entry).not.toMatch(/youtu\.?be|ytimg/i); // the feed names the page, never YouTube

  await page.goto(path);
  const head = await page.evaluate(() => ({
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ""),
    og: document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null,
    ogType: document.querySelector('meta[property="og:type"]')?.getAttribute("content") ?? null,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
    markup: document.head.innerHTML,
  }));
  expect(head.canonical).toBe(`${SITE}${path}`);
  expect(head.ogType).toBe("article");
  expect(head.ld).toHaveLength(1);
  const graph = JSON.parse(head.ld[0]) as unknown;
  const nodes = (Array.isArray(graph) ? graph : [graph]) as { "@type"?: string; name?: string; hasPart?: { "@type": string; name: string; startOffset: number }[]; transcript?: string }[];
  const video = nodes.find((n) => n["@type"] === "VideoObject");
  expect(video, "a VideoObject").toBeDefined();
  expect(video!.name).toBe(shown.title);
  expect(video!.hasPart?.map((c) => c.name)).toEqual(shown.chapters.map((c) => c.title));
  expect(video!.hasPart?.every((c) => c["@type"] === "Clip")).toBe(true);
  expect(video!.transcript ?? "").toContain(shown.spoken);
  expect(head.ld[0]).not.toMatch(/Review|Rating|Offer|FinancialProduct|"price"/);
  expect(`${head.ld[0]}\n${head.markup}`).not.toMatch(UUID);
  expect(head.ld[0]).not.toMatch(/"channel|UC[A-Za-z0-9_-]{22}|privacy|unlisted/i);

  expect(head.og).toContain(`${path}/opengraph-image`);
  const card = await request.get(head.og!);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
  const body = await card.body();
  expect(body.length).toBeGreaterThan(2000);
  expect([...body.subarray(0, 4)]).toEqual(PNG);
  expect((await request.get(head.og!.replace(`/${shown.slug}/`, "/no-such-video/"))).status()).toBe(404);
}

/** After Unpublish: the page, the card, the feed and the sitemap no longer know the video (and /videos is a 404 while none is listed). */
export async function expectVideoGone(request: APIRequestContext, shown: VideoShown, opts: { indexToo: boolean }): Promise<void> {
  const path = `/videos/${shown.slug}`;
  expect((await request.get(path)).status()).toBe(404);
  expect((await request.get(`${path}/opengraph-image`)).status()).toBe(404);
  const feed = await (await request.get("/feed.xml")).text();
  expect(feed).not.toContain(path);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain(path);
  if (opts.indexToo) {
    expect((await request.get("/videos")).status()).toBe(404);
    expect(sitemap).not.toContain(`<loc>${SITE}/videos</loc>`);
  }
}
