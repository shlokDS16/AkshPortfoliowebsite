import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const KAVERI = "Kaveri Pumps (fictional)";

test("the file reads in B+ order with its strip, dateline, view, tests, facts, history and disclosure", async ({ page, isMobile }) => {
  await page.goto("/companies/kavpump");
  await expect(page.getByRole("heading", { level: 1, name: KAVERI })).toBeVisible();
  await expect(page.getByText(/^FILE \d{2} · R2$/)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Disclosure summary" })).toContainText("For learning · Aksh holds no position · Figures to");
  await expect(page.getByText("R2 of 2")).toBeVisible();
  await page.getByRole("button", { name: "S1 p. 131" }).click();
  await expect(page.getByRole("region", { name: "Source for ₹1,284 cr" })).toContainText("Revenue from operations rose to ₹1,284 crore.");
  // F1 was typed by hand, so no filed page backs it: its card claims nothing (Task 9, R19).
  await expect(page.getByTestId("checked-line")).toHaveCount(0);
  await expect(page.getByLabel("0 met, 1 watching, 1 not met, 1 no data")).toBeVisible();
  await expect(page.getByRole("img", { name: /Receivable days, FY22 to FY26: from 81 days in FY22 to 142 days in FY26/ })).toBeAttached();
  await expect(page.locator("#disclosure")).toContainText("Position in the security discussed: No.");
  if (isMobile) {
    const index = page.getByRole("navigation", { name: "On this page" });
    await expect(index).toBeVisible();
    await index.getByRole("link", { name: /History/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Revisions" })).toBeInViewport();
  } else {
    await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: /^Tests/ })).toHaveAttribute("href", "#tests");
  }
});

test("the source card says which page a filed figure was printed on, and only for the figure that has a provenance record", async ({ page }) => {
  await page.goto("/companies/kavpump");
  // F2 (Gross margin, p. 140) was filed from a document page through the inbox's own path (e2e/support/checked-fact.ts).
  await page.getByRole("button", { name: "S1 p. 140" }).click();
  const card = page.getByRole("region", { name: /^Source for 31\.4/ });
  await expect(card.getByTestId("checked-line")).toHaveText("Printed on p. 140 of Annual report 2025-26 (fictional seed data); matched by the desk and accepted by the analyst.");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  // F1 (p. 131) and F3 (p. 152) have no record: no line, and only the one card is open.
  await expect(page.getByTestId("checked-line")).toHaveCount(1);
  await page.getByRole("button", { name: "S1 p. 131" }).click();
  await expect(page.getByRole("region", { name: "Source for ₹1,284 cr" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Source for ₹1,284 cr" }).getByTestId("checked-line")).toHaveCount(0);
});

test("no threshold-meter label overlaps another or leaves its meter", async ({ page }) => {
  await page.goto("/companies/kavpump#tests");
  const meters = page.locator("[role='img']:has([data-row='threshold-label'])");
  await expect(meters).toHaveCount(2);
  for (const meter of await meters.all()) {
    const box = (await meter.boundingBox())!;
    const label = (await meter.locator("[data-row='threshold-label'] > span").boundingBox())!;
    const ends = await Promise.all((await meter.locator("[data-row='scale'] > span").all()).map(async (e) => (await e.boundingBox())!));
    expect(label.x).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(label.x + label.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    for (const b of ends) {
      const overlaps = label.x < b.x + b.width && b.x < label.x + label.width && label.y < b.y + b.height && b.y < label.y + label.height;
      expect(overlaps).toBe(false);
    }
    expect(ends[0].x + ends[0].width).toBeLessThan(ends[1].x);
  }
});

test("the revision diff gives the reason first and can show R1 in full", async ({ page }) => {
  await page.goto("/companies/kavpump#history");
  const history = page.getByRole("region", { name: "Revisions" });
  await expect(history).toContainText("Receivable days rose again in FY26; added a test on the dealer count.");
  await expect(history).toContainText("T3: The dealer count shrinks for two straight years.");
  await history.getByRole("radio", { name: "R1" }).click();
  await expect(history).not.toContainText("T3: The dealer count shrinks");
});

test("the register row leads to the file and Back returns to Files", async ({ page, isMobile }) => {
  await page.goto("/companies");
  await page.getByRole("link", { name: KAVERI }).click();
  await expect(page).toHaveURL(/\/companies\/kavpump$/);
  await expect(page.getByRole("heading", { level: 1, name: KAVERI })).toBeVisible();
  if (isMobile) await page.getByRole("link", { name: "Back to Files" }).click();
  else await page.goBack();
  await expect(page).toHaveURL(/\/companies$/);
});

test("the file's share card is an image linked from its metadata", async ({ page, request }) => {
  await page.goto("/companies/kavpump");
  const url = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  const image = await request.get(url ?? "/missing");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  const unknown = await request.get(new URL(url!).pathname.replace("/kavpump/", "/no-such-file/"));
  expect(unknown.status()).toBe(404);
});
