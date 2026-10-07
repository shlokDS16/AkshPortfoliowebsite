import { expect, test, type Page } from "@playwright/test";

// Phone only: the floating Capture button and the tab bar must leave the last control on a desk page clear, with air around them.
async function coveredControls(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.mouse.wheel(0, 100_000); // real scrolling: the page may animate scrollTo
  await expect.poll(() => page.evaluate(() => Math.round(scrollY + innerHeight) >= document.documentElement.scrollHeight - 1)).toBe(true);
  await page.waitForTimeout(300); // the tab bar settles after the scroll
  return page.evaluate(() => {
    const rect = (el: Element) => el.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number };
    const hit = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const covers = [...document.querySelectorAll('button[aria-keyshortcuts="c /"], nav[aria-label="Desk sections"]')]
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).position === "fixed")
      .map(rect)
      .map((r) => ({ x: r.x - 24, y: r.y - 24, width: r.width + 48, height: r.height + 48 })); // 24 px of air around each
    return [...document.querySelectorAll("main a[href], main button, main input, main select, main textarea, main summary")]
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => covers.some((c) => hit(rect(el), c)))
      .map((el) => (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40));
  });
}

test("on a phone nothing in the desk pages sits under the Capture button or the tab bar", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the button floats only on phone");
  for (const path of ["/desk", "/desk/items", "/desk/names", "/desk/companies"]) {
    await page.goto(path);
    expect(await coveredControls(page), path).toEqual([]);
  }
  await page.goto("/desk/items");
  await page.locator('main a[href^="/desk/items/"]').first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await coveredControls(page), "item page").toEqual([]);
});
