import { expect, test, type Page } from "@playwright/test";
import { derivedProblems } from "../src/modules/showcase/derived-scan";
import { discover, expectedSitemapPaths, isFeedDate, SITE, state, type Pages } from "./support/derived";

// Plan 5a Task 4 (spec s12, publishing rule 11): the surfaces built from the public snapshot, checked from outside, as a feed reader, a
// crawler and a social network would see them. They run in the public-* projects (the deploy state: two files and three notes, no case,
// no concept) and again in cases-public-* and concepts-public-* (after those loops each left something public). Which state a project is
// in is told by its name (support/derived.ts); what must be listed is read back from the live index pages, so the sitemap, the feed and
// the pages are compared with each other and a drift between them fails. The print half is public-print.spec.ts.
const FORBIDDEN_TYPES = /Review|Rating|Offer|FinancialProduct|InvestmentOrDeposit|"price"/;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const PNG = [0x89, 0x50, 0x4e, 0x47];

let pages: Pages;
test.beforeAll(async ({ request }) => {
  pages = await discover(request);
});

test("the deploy state lists two files and the notes, and no case or concept; a loop that published one shows it", async () => {
  const s = state();
  expect(pages.files).toEqual(expect.arrayContaining(["/companies/kavpump", "/companies/sahcold"]));
  expect(pages.notes.length).toBeGreaterThanOrEqual(2);
  expect(pages.process.length).toBeGreaterThanOrEqual(1);
  if (s.deploy) expect([pages.cases, pages.concepts]).toEqual([[], []]);
  if (s.casePublic) expect(pages.cases.length).toBeGreaterThanOrEqual(1);
  if (s.conceptsPublic) expect(pages.concepts.length).toBeGreaterThanOrEqual(1);
});

test("/feed.xml parses as RSS in the browser, lists the seeded file, is dated by its newest item and carries no figure or id of the machine's", async ({ page }) => {
  await page.goto("/about");
  const read = () =>
    page.evaluate(async () => {
      const response = await fetch("/feed.xml");
      const text = await response.text();
      const doc = new DOMParser().parseFromString(text, "application/xml");
      const atom = doc.getElementsByTagNameNS("http://www.w3.org/2005/Atom", "link")[0];
      const field = (item: Element, tag: string) => item.querySelector(tag)?.textContent ?? "";
      return {
        status: response.status,
        type: response.headers.get("content-type"),
        text,
        error: doc.querySelector("parsererror")?.textContent ?? null,
        root: doc.documentElement.tagName,
        channelTitle: doc.querySelector("channel > title")?.textContent ?? null,
        lastBuild: doc.querySelector("channel > lastBuildDate")?.textContent ?? null,
        self: { href: atom?.getAttribute("href") ?? null, rel: atom?.getAttribute("rel") ?? null },
        items: [...doc.querySelectorAll("item")].map((i) => ({
          title: field(i, "title"), link: field(i, "link"), guid: field(i, "guid"), pubDate: field(i, "pubDate"), description: field(i, "description"),
          permaLink: i.querySelector("guid")?.getAttribute("isPermaLink") ?? null,
        })),
      };
    });
  const feed = await read();
  expect(feed.status).toBe(200);
  expect(feed.type).toBe("application/rss+xml; charset=utf-8");
  expect(feed.error).toBeNull();
  expect(feed.root).toBe("rss");
  expect(feed.channelTitle).toBe("Case files · Aksh Agrawal");
  expect(feed.self).toEqual({ href: `${SITE}/feed.xml`, rel: "self" });
  expect(feed.items.length).toBeGreaterThanOrEqual(5);
  expect(feed.items.length).toBeLessThanOrEqual(50);
  expect(feed.items.find((i) => i.link === `${SITE}/companies/kavpump`)?.title).toMatch(/^Kaveri Pumps \(fictional\) · File 01 · R\d+$/);
  for (const item of feed.items) {
    expect(item.link.startsWith(`${SITE}/`)).toBe(true);
    expect(item.guid).toMatch(/^\/[a-z0-9/-]+#r\d+$/);
    expect(item.permaLink).toBe("false");
    expect(isFeedDate(item.pubDate), item.pubDate).toBe(true);
    expect(item.description).toContain("For learning, not advice. Figures on the page are at least 30 days old.");
    expect(derivedProblems(`${item.title}\n${item.description}`), item.link).toEqual([]);
  }
  expect(feed.lastBuild).toBe(feed.items[0].pubDate); // the newest item's date, not "now": an unchanged feed is byte-identical
  expect((await read()).text).toBe(feed.text);

  const s = state();
  const paths = [...new Set(feed.items.map((i) => i.link.slice(SITE.length)))];
  for (const p of paths) expect(/^\/(companies|notes|process|cases)\/./.test(p), p).toBe(true);
  if (s.deploy) for (const p of paths) expect(p.startsWith("/cases/"), p).toBe(false);
  if (s.casePublic) {
    for (const href of pages.cases) {
      const item = feed.items.find((i) => i.link === `${SITE}${href}`);
      expect(item, `a feed item for ${href}`).toBeDefined();
      expect(item!.description).toMatch(/Closed case · written \d{1,2} [A-Z][a-z]{2} \d{4}/);
    }
  }
});

test("/sitemap.xml lists exactly the public pages of this state, each dated by day", async ({ page }) => {
  await page.goto("/about");
  const sitemap = await page.evaluate(async () => {
    const response = await fetch("/sitemap.xml");
    const doc = new DOMParser().parseFromString(await response.text(), "application/xml");
    return {
      status: response.status,
      type: response.headers.get("content-type"),
      error: doc.querySelector("parsererror")?.textContent ?? null,
      urls: [...doc.querySelectorAll("url")].map((u) => ({ loc: u.querySelector("loc")?.textContent ?? "", lastmod: u.querySelector("lastmod")?.textContent ?? null })),
    };
  });
  expect(sitemap.status).toBe(200);
  expect(sitemap.type).toContain("xml");
  expect(sitemap.error).toBeNull();
  expect(sitemap.urls.every((u) => u.loc.startsWith(SITE))).toBe(true);
  const listed = sitemap.urls.map((u) => u.loc.slice(SITE.length) || "/").sort();
  expect(listed).toEqual(expectedSitemapPaths(pages));
  for (const u of sitemap.urls) {
    if (u.lastmod !== null) expect(u.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(u.loc).not.toMatch(UUID);
  }
  if (state().deploy) for (const p of listed) expect(/^\/(cases|mistakes|concepts)(\/|$)/.test(p), p).toBe(false);
});

test("/robots.txt keeps every crawler out of a build that is not production, and names no sitemap", async ({ request }) => {
  // The production answer (allow the site, keep /desk, /login, /auth, /api and /dev out, name the sitemap) is the unit test of robotsFor and
  // of the route: the local server has no VERCEL_ENV, which is the non-production case.
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
  expect(lines).toEqual(["User-Agent: *", "Disallow: /"]);
});

type Head = {
  title: string; description: string | null; canonical: string | null; ogUrl: string | null; ogType: string | null; ogImage: string | null;
  twitter: string | null; rss: string | null; ld: string[]; head: string;
};
async function headOf(page: Page): Promise<Head> {
  return page.evaluate(() => {
    const meta = (sel: string) => document.querySelector(sel)?.getAttribute("content") ?? null;
    return {
      title: document.title,
      description: meta('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      ogUrl: meta('meta[property="og:url"]'),
      ogType: meta('meta[property="og:type"]'),
      ogImage: meta('meta[property="og:image"]'),
      twitter: meta('meta[name="twitter:card"]'),
      rss: document.querySelector('link[rel="alternate"][type="application/rss+xml"]')?.getAttribute("href") ?? null,
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ""),
      head: document.head.innerHTML,
    };
  });
}

test("every public page carries its title, canonical address, feed link, card and one structured-data script, and says nothing about what is not public", async ({ page, request }) => {
  const paths = expectedSitemapPaths(pages);
  const cards = new Set<string>();
  const s = state();
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    const h = await headOf(page);
    const url = `${SITE}${path}`;
    // Next writes the site's own address without the trailing slash; a sitemap names it with one. The same page.
    const same = (got: string | null) => (path === "/" ? got === SITE || got === `${SITE}/` : got === url);
    expect(h.title.length, `${path} title`).toBeGreaterThan(0);
    expect(h.description?.length, `${path} description`).toBeGreaterThan(0);
    expect(same(h.canonical), `${path} canonical ${h.canonical}`).toBe(true);
    expect(same(h.ogUrl), `${path} og:url ${h.ogUrl}`).toBe(true);
    expect(h.ogType, `${path} og:type`).toBe(/^\/(companies|notes|process|cases)\/./.test(path) ? "article" : "website");
    expect(h.twitter).toBe("summary_large_image");
    expect(h.rss).toBe(`${SITE}/feed.xml`);
    expect(h.ld, `${path} structured data`).toHaveLength(1);
    const data: unknown = JSON.parse(h.ld[0]);
    expect(Array.isArray(data) ? data.length : 1).toBeGreaterThan(0);
    // No rating, price or offer; no id of the database; on a case, no figure and no verdict (rule 10.7).
    expect(h.ld[0]).not.toMatch(FORBIDDEN_TYPES);
    expect(`${h.ld[0]}\n${h.head}`, `${path} head`).not.toMatch(UUID);
    expect(derivedProblems(`${h.title}\n${h.description}\n${h.ld[0]}`), path).toEqual([]);
    if (s.deploy) expect(`${h.head}\n${h.ld[0]}`, `${path} mentions what is not public`).not.toMatch(/\/(cases|concepts|mistakes)\b/);
    expect(h.ogImage, `${path} og:image`).not.toBeNull();
    cards.add(h.ogImage!);
  }
  // Every card is a real PNG.
  for (const card of cards) {
    const image = await request.get(card);
    expect(image.status(), card).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    const body = await image.body();
    expect(body.length).toBeGreaterThan(2000);
    expect([...body.subarray(0, 4)]).toEqual(PNG);
  }
  expect(cards.size).toBeGreaterThanOrEqual(1 + pages.files.length + pages.notes.length + pages.process.length);
});

test("a share card for a slug that does not exist is a 404, for a file, a note, a process note and (once public) a case and a concept", async ({ page, request }) => {
  const s = state();
  const sample = [pages.files[0], pages.notes[0], pages.process[0], ...(s.casePublic ? [pages.cases[0]] : []), ...(s.conceptsPublic ? [pages.concepts[0]] : [])];
  for (const path of sample) {
    await page.goto(path);
    const card = (await headOf(page)).ogImage!;
    expect(card).toContain(`${path}/opengraph-image`);
    const slug = path.split("/").pop()!;
    expect((await request.get(card.replace(`/${slug}/`, "/no-such-page/"))).status(), path).toBe(404);
  }
});

test("the shared surfaces of a case (metadata, structured data, feed item) name no figure and no verdict (rule 10.7)", async ({ page, request }) => {
  test.skip(!state().casePublic, "the deploy state has no public case study");
  const href = pages.cases[0];
  await page.goto(href);
  const h = await headOf(page);
  expect(derivedProblems(`${h.title}\n${h.description}\n${h.ld[0]}`)).toEqual([]);
  const feed = await (await request.get("/feed.xml")).text();
  const item = feed.split("<item>").find((chunk) => chunk.includes(`<link>${SITE}${href}</link>`));
  expect(item, "the case is in the feed").toBeDefined();
  expect(derivedProblems(item!)).toEqual([]);
});
