import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./support/desk";
import { seedLedgerCaseItem } from "./support/case-item";
import { seedConceptWorld } from "./support/concept-world";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Run in desk-mobile (375) and desk-desktop (1280). The inbox's review page is scanned, in both themes, inside the
// full-flow spec (desk-staging), where a document is waiting for review. An idea's page (with entries) is scanned in
// desk-ledger.spec.ts, where an idea exists.
for (const colorScheme of ["light", "dark"] as const) {
  for (const path of ["/desk", "/desk/inbox", "/desk/items", "/desk/names", "/desk/ledger", "/desk/ledger/new", "/desk/ledger/closes", "/desk/ledger/journal"]) {
    test(`${path} (${colorScheme}): no WCAG 2.2 A/AA violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
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

// Plan 3b Task 4: the item page of a case study from the ledger (the read-only record, no facts editor), in both themes, with no
// sideways scroll. The idea page's "Case study" block is scanned inside desk-ledger.spec.ts, where a closed idea exists.
for (const colorScheme of ["light", "dark"] as const) {
  test(`a ledger case study's item page (${colorScheme}): the record is read-only, there is no facts editor, and axe is clean`, async ({ page }, testInfo) => {
    const item = await seedLedgerCaseItem(await adminDb(), testInfo.project.name.endsWith("mobile") ? "m" : "d");
    await page.emulateMedia({ colorScheme });
    await page.goto(`/desk/items/${item.id}`);
    await expect(page.getByRole("heading", { level: 1, name: item.title })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "From the ledger (sealed; cannot be edited)" })).toBeVisible();
    await expect(page.getByText("I waited too long on the monsoon signal.")).toBeVisible();
    await expect(page.getByText("Whether the ledger has changed could not be read just now.")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Text sheet" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Facts", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save revision" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}

// Phase 4 Task 4: the concept index, one concept page with every block, a read's item page (the private line, no publish panel), the
// item page's picker and the month page, in both themes, with no sideways scroll and axe clean.
for (const colorScheme of ["light", "dark"] as const) {
  test(`concepts, a concept page, the month page and the picker (${colorScheme}): axe clean, no sideways scroll, a read has no publish panel`, async ({ page }, testInfo) => {
    const world = await seedConceptWorld(await adminDb(), `${testInfo.project.name.endsWith("mobile") ? "m" : "d"}-${colorScheme}`);
    await page.emulateMedia({ colorScheme });
    const noSideways = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const clean = async () => {
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    };

    await page.goto("/desk/concepts");
    await expect(page.getByRole("heading", { level: 1, name: "Concepts" })).toBeVisible();
    await expect(page.getByRole("link", { name: world.name })).toBeVisible();
    await noSideways();
    await clean();

    await page.goto(`/desk/concepts/${world.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: world.name })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Learnings" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Reads" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Related concepts" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Seen together in your notes" })).toBeVisible();
    await noSideways();
    await clean();

    await page.getByRole("link", { name: world.read }).click();
    await expect(page.getByRole("heading", { level: 1, name: world.read })).toBeVisible();
    await expect(page.getByText("A read stays private. It is not published.")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Publish checklist/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Change" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Concepts for this note" })).toBeVisible();
    await noSideways();
    await clean();

    await page.goto("/desk/learned");
    await expect(page.getByRole("heading", { level: 1, name: /^What I learned in / })).toBeVisible();
    await expect(page.getByRole("link", { name: world.learning })).toBeVisible();
    await noSideways();
    await clean();
  });
}
