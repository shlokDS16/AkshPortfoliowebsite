import { expect, test } from "@playwright/test";

test("every desk component, as approved", async ({ page }) => {
  await page.goto("/dev/preview");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // Status ticks and chart lines animate once, when they first scroll into view. Walk the page so every one arms,
  // return to the top, then wait for those animations to finish: a baseline never catches a shape mid tick-in.
  await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
      scrollTo(0, y);
      await frame();
      await frame();
    }
    scrollTo(0, 0);
    await frame();
    // Time-based, finite and running only: scroll-driven ones (the reading hairline) never "finish".
    const settling = document
      .getAnimations()
      .filter((a) => a.timeline === document.timeline && a.playState === "running" && a.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(settling.map((a) => a.finished.catch(() => null)));
  });
  await expect(page).toHaveScreenshot("preview.png", { fullPage: true, mask: [page.locator("nextjs-portal")] });
});
