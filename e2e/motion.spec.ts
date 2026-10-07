import { expect, test } from "@playwright/test";

test("reduced motion: drawers fade, nothing transitions, status ticks never arm, the reading hairline stays", async ({ page }) => {
  await page.goto("/companies/kavpump");
  await page.getByRole("button", { name: "Details" }).click();
  const drawer = page.locator("[data-strip-drawer]");
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate((el) => getComputedStyle(el).clipPath)).toBe("none");
  const chevron = await page.getByRole("button", { name: "Details" }).evaluate((el) => parseFloat(getComputedStyle(el.querySelector("svg")!).transitionDuration));
  expect(chevron).toBeLessThan(0.001);
  await page.mouse.wheel(0, 2000);
  await expect(page.locator("[data-tick='run']")).toHaveCount(0);
  await expect(page.locator("[data-hairline]").first()).toBeAttached();
});

test("reduced motion: the register-to-file navigation has no view-transition animation", async ({ page }) => {
  await page.goto("/companies");
  const none = await page.evaluate(() => {
    const rule = [...document.styleSheets].flatMap((s) => [...s.cssRules]).find((r) => r.cssText.includes("prefers-reduced-motion: reduce") && r.cssText.includes("::view-transition-group(*)"));
    return Boolean(rule);
  });
  expect(none).toBe(true);
  await page.getByRole("link", { name: "Kaveri Pumps (fictional)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kaveri Pumps (fictional)" })).toBeVisible();
});
