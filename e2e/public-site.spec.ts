import { expect, test } from "@playwright/test";

const KAVERI = "Kaveri Pumps (fictional)";

test("home: Case files, stat tiles of counts only, what changed reason first, the register", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Case files" })).toBeVisible();
  await expect(page.getByText("Each file says what Aksh expected, what would prove him wrong, and every revision since. For learning, not advice.")).toBeVisible();
  await expect(page.getByText("Receivable days rose again in FY26; added a test on the dealer count.")).toBeVisible();
  await expect(page.getByRole("link", { name: KAVERI }).first()).toHaveAttribute("href", "/companies/kavpump");
  await expect(page.locator("main")).not.toContainText(/returned \d|hit rate|beat the nifty/i);
});

test("the site disclosure sits at the top on desktop and at the bottom on phone", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await expect(page.getByRole("link", { name: "Disclosures" })).toBeVisible();
  else await expect(page.getByRole("complementary", { name: "Disclosure summary" })).toBeVisible();
});

test("Files: search by symbol; Notes: a learning note lists the file that uses it", async ({ page }) => {
  await page.goto("/companies");
  await page.getByRole("searchbox", { name: "Find a file" }).fill("sahcold");
  await expect(page.getByRole("link", { name: "Sahyadri Cold Chain (fictional)" })).toBeVisible();
  await expect(page.getByRole("link", { name: KAVERI })).toHaveCount(0);
  await page.goto("/notes");
  await page.getByRole("link", { name: "How to read receivable days" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How to read receivable days" })).toBeVisible();
  await expect(page.getByRole("link", { name: KAVERI })).toHaveAttribute("href", "/companies/kavpump");
});

test("process, mistakes and about render with the site disclosure; about states the rules", async ({ page }) => {
  // The slug is generated at publish ("<title>-<6 id chars>"), so reach the note through the list.
  await page.goto("/process");
  await page.getByRole("link", { name: "How I keep a case file" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How I keep a case file" })).toBeVisible();
  await page.goto("/mistakes");
  await expect(page.getByText(/When one of Aksh's tests proves him wrong/)).toBeVisible();
  await page.goto("/about");
  await expect(page.locator("#disclosures")).toContainText("Aksh Agrawal is not a SEBI-registered Research Analyst");
  await expect(page.getByRole("heading", { name: "How a page gets published" })).toBeVisible();
});

test("a missing page says so with a 404; the dev gallery does not exist in production", async ({ page, request }) => {
  const response = await page.goto("/companies/no-such-file");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "No file at this address" })).toBeVisible();
  expect((await request.get("/dev/preview")).status()).toBe(404);
});

test("favicons and the home share card are served", async ({ page, request }) => {
  await page.goto("/");
  const icons = page.locator('link[rel="icon"]');
  await expect(icons).toHaveCount(3);
  const svgHref = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
  const svg = await request.get(svgHref ?? "/missing");
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  const og = await request.get("/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
});

test("follows the OS colour scheme and never scrolls sideways", async ({ page }, testInfo) => {
  for (const path of ["/", "/companies", "/notes", "/about"]) {
    await page.goto(path);
    const { bg, fits } = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      fits: document.documentElement.scrollWidth <= window.innerWidth,
    }));
    expect(bg).toBe(testInfo.project.name.endsWith("-dark") ? "rgb(23, 20, 15)" : "rgb(247, 242, 232)");
    expect(fits).toBe(true);
  }
});
