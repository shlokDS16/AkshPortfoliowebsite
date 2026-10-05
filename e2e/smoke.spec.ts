import { expect, test } from "@playwright/test";

test("home renders with its stylesheet applied", async ({ page }) => {
  const cssStatuses: number[] = [];
  const cssFailures: string[] = [];
  page.on("response", (response) => {
    if (!new URL(response.url()).pathname.endsWith(".css")) return;
    cssStatuses.push(response.status());
    if (!response.ok()) cssFailures.push(response.url());
  });
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Aksh Research Desk" });
  await expect(heading).toBeVisible();

  // The Turbopack CSS-404 regression: no stylesheet is served, or one is served and 404s.
  expect(cssFailures).toEqual([]);
  expect(cssStatuses).toContain(200);

  // Tailwind's `text-2xl` gives 24px and `font-semibold` gives 600; the UA default h1 is 32px / 700.
  const style = await heading.evaluate((el) => {
    const { fontSize, fontWeight } = getComputedStyle(el);
    return { fontSize, fontWeight };
  });
  expect(style).toEqual({ fontSize: "24px", fontWeight: "600" });
});
