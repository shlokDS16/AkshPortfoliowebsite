import { expect, test } from "@playwright/test";

test("home renders with its stylesheet and the display type applied", async ({ page }) => {
  const cssFailures: string[] = [];
  const cssStatuses: number[] = [];
  page.on("response", (response) => {
    if (!new URL(response.url()).pathname.endsWith(".css")) return;
    cssStatuses.push(response.status());
    if (!response.ok()) cssFailures.push(response.url());
  });
  await page.goto("/");
  const heading = page.getByRole("heading", { level: 1, name: "Case files" });
  await expect(heading).toBeVisible();
  // The Turbopack CSS-404 regression (Plan 1A Task 2).
  expect(cssFailures).toEqual([]);
  expect(cssStatuses).toContain(200);
  // display token: 40 px / 600 on desktop (the default 1280 px viewport); the UA h1 is 32 px / 700.
  const style = await heading.evaluate((el) => ({ fontSize: getComputedStyle(el).fontSize, fontWeight: getComputedStyle(el).fontWeight }));
  expect(style).toEqual({ fontSize: "40px", fontWeight: "600" });
});
