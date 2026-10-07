import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const path of ["/desk", "/desk/items", "/desk/names"]) {
  test(`${path}: no WCAG 2.2 A/AA violations`, async ({ page }) => {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}

type Focused = { text: string; tag: string; href: string };

async function tabUntil(page: Page, match: (el: Focused) => boolean, limit = 120): Promise<void> {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    const el = await page.evaluate(() => {
      const a = document.activeElement;
      return { text: a?.textContent ?? "", tag: a?.tagName ?? "", href: a?.getAttribute("href") ?? "" };
    });
    if (match(el)) return;
  }
  throw new Error("focus never reached the target by keyboard");
}

test("keyboard-complete desk: c opens capture, Enter saves, Esc closes, Tab reaches an item and Save revision", async ({ page }) => {
  await page.goto("/desk/items");
  // The dock marks its button once the key handler is attached (hydration), so `c` is pressed exactly once.
  await expect(page.getByRole("button", { name: "Capture", exact: true })).toHaveAttribute("data-shortcuts", "ready");
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "Capture" });
  await expect(dialog).toBeVisible();
  await page.keyboard.type("keyboard only note");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Saved \d{2}:\d{2} · private note$|^Saved on this phone\. It will sync\.$/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.reload(); // the capture above filed a private note, so the list has at least one item
  await tabUntil(page, (el) => el.tag === "A" && /^\/desk\/items\/[0-9a-f-]{36}$/.test(el.href));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/desk\/items\/[0-9a-f-]{36}/);
  await tabUntil(page, (el) => el.tag === "BUTTON" && el.text.includes("Save revision"));
});

test("a capture on /desk is acknowledged and stored (R2 row 4; unlock-to-saved is timed by hand in the trial)", async ({ page }, testInfo) => {
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  const text = `timed capture ${Date.now().toString(36)}`;
  const started = Date.now();
  await box.fill(text);
  await box.press("Enter");
  await expect(page.getByText(/^Saved \d{2}:\d{2} · private note$/)).toBeVisible();
  testInfo.annotations.push({ type: "capture-ms", description: String(Date.now() - started) });
  await expect(page.getByRole("region", { name: "Today" })).toContainText(text);
});
