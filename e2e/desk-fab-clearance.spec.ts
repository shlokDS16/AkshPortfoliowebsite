import { expect, test, type Page } from "@playwright/test";
import { seedConceptWorld } from "./support/concept-world";
import { adminDb } from "./support/desk";

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

// The item page with the concept picker open: Save concepts sits mid-page, above a checklist whose "Make <concept> public" button carries
// the concept's name. A long name once widened the whole phone page (the layout viewport grew past 375 px and the page shrank to fit), and
// the button could then not be scrolled clear of the tab bar. The page stays as wide as the phone, and the button can be brought clear.
test("on a phone the picker's Save concepts button scrolls clear of the bars and the page stays as wide as the phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the bars float only on phone");
  const world = await seedConceptWorld(await adminDb(), "f-m");
  await page.goto(`/desk/concepts/${world.slug}`);
  await page.getByRole("link", { name: world.learning }).click();
  await page.getByRole("region", { name: "Concepts", exact: true }).getByRole("button", { name: "Change" }).click();
  await expect(page.getByRole("button", { name: "Save concepts" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "sideways overflow").toBeLessThanOrEqual(width);
  for (const block of ["start", "center", "end"] as const) {
    const reached = await page.evaluate((b) => {
      const button = [...document.querySelectorAll("main button")].find((el) => el.textContent?.trim() === "Save concepts")!;
      button.scrollIntoView({ block: b, inline: b, behavior: "instant" });
      const r = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }, block);
    expect(reached, `Save concepts scrolled to the ${block} of the screen`).toBe(true);
  }
});
