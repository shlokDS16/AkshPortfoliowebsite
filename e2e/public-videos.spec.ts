import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Plan 5b Task 9. Two states of the same pages, told apart by the Playwright project, never by what the database holds (a skip decided by the
// data cannot fail in the case it exists for):
//  - no video listed (every deploy, until Shlok adds a YouTube key and publishes one): /videos and every /videos/[slug] are a 404, and the
//    chrome does not link to them. Nothing a visitor can see has changed. The public-* projects run on this state.
//  - one video listed (videos.spec.ts publishes one through the real gate on the local stack and leaves it public): the videos-public-*
//    projects check the index and the video page for WCAG 2.2 A/AA, one h1, no sideways scroll, 44 px targets on the phone, and that the
//    page asks YouTube for nothing until the press. The facts of that video (chapters, transcript, card, feed) are videos.spec.ts.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const listed = () => test.info().project.name.startsWith("videos-public");

async function expectClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test("with no video listed: /videos and every video page are a 404, and no page of the site links to them", async ({ page }) => {
  test.skip(listed(), "runs before the videos loop has listed a video");
  expect((await page.goto("/videos"))?.status()).toBe(404);
  expect((await page.goto("/videos/anything-at-all"))?.status()).toBe(404);
  expect((await page.request.get("/videos/anything-at-all/opengraph-image")).status()).toBe(404);
  for (const path of ["/", "/companies", "/about"]) {
    await page.goto(path);
    await expect(page.locator("a[href='/videos']"), path).toHaveCount(0);
  }
});

test("with a video listed: the index and the video page pass axe, keep one h1, do not scroll sideways, and ask YouTube for nothing before the press", async ({ page, isMobile }) => {
  test.skip(!listed(), "the deploy state lists no video");
  const asked: string[] = [];
  await page.route(/\/\/i\.ytimg\.com\//, (route) => route.abort());
  await page.route(/\/\/(?:www\.)?youtube-nocookie\.com\//, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>frame</title>" }));
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith("youtube-nocookie.com")) asked.push(request.url());
  });

  expect((await page.goto("/videos"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Videos" })).toBeVisible();
  await expectClean(page);
  const href = await page.locator("main ol a, main ul a").first().getAttribute("href");
  expect(href).toMatch(/^\/videos\/[a-z0-9-]+$/);

  await page.goto(href!);
  await expect(page.getByText("VIDEO", { exact: true })).toBeVisible();
  const play = page.getByRole("button", { name: /^Play video \(loads YouTube\)/ });
  await expect(play).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Transcript" })).toBeVisible();
  await expectClean(page);
  if (isMobile) {
    expect((await play.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    for (const h of await page.locator("section[aria-labelledby=chapters-heading] a").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
  }
  expect(asked, "nothing is asked of youtube-nocookie.com before the press").toEqual([]);
});
