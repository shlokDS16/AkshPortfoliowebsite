import { expect, test } from "@playwright/test";

test("home renders with its stylesheet applied", async ({ page }) => {
  const cssFailures: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes(".css") && !response.ok()) cssFailures.push(response.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Aksh Research Desk" })).toBeVisible();
  expect(cssFailures).toEqual([]);
});
