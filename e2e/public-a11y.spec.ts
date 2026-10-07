import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The seed's note slug carries a suffix written by publish_revision() ("<title words>-<6 id chars>"), so the note is
// reached through its link on /notes rather than a fixed path.
const NOTE = "How to read receivable days";
const at = (path: string) => ({ name: path, open: async (page: Page) => void (await page.goto(path)) });
const PAGES: { name: string; open: (page: Page) => Promise<void> }[] = [
  ...["/", "/companies", "/companies/kavpump", "/notes"].map(at),
  {
    name: `the note "${NOTE}"`,
    open: async (page) => {
      await page.goto("/notes");
      await page.getByRole("link", { name: NOTE }).click();
      await expect(page.getByRole("heading", { level: 1, name: NOTE })).toBeVisible();
    },
  },
  ...["/process", "/mistakes", "/about"].map(at),
];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const { name, open } of PAGES) {
  test(`${name}: no WCAG 2.2 A/AA violations, one h1`, async ({ page }) => {
    await open(page);
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    await expect(page.locator("h1")).toHaveCount(1);
  });
}

test("the skip link is first and lands on main; the focus ring is a 2 px geru outline", async ({ page }) => {
  await page.goto("/companies/kavpump");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  const ring = await skip.evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.outlineStyle} ${s.outlineWidth}`;
  });
  expect(ring).toBe("solid 2px");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

// Source chips sit inside sentences (WCAG 2.5.8 inline exception); design-dna s14 gives them an ::after hit area
// (inset -8px -3px) instead of a 44 px box, so they are measured with that extension against the 24 px AA minimum.
test("on phone, controls are at least 44 px tall and inline source chips reach 24 px with their hit area", async ({ page, isMobile }) => {
  test.skip(!isMobile, "coarse pointers only");
  await page.goto("/companies/kavpump");
  const targets = page.locator("nav[aria-label='Main'] a, nav[aria-label='On this page'] a, button[aria-expanded]:not(.chip-hit)");
  expect(await targets.count()).toBeGreaterThan(0);
  for (const box of await targets.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  const chips = page.locator("button.chip-hit");
  expect(await chips.count()).toBeGreaterThan(0);
  const hits = await chips.evaluateAll((els) =>
    els.map((el) => {
      const after = getComputedStyle(el, "::after");
      return el.getBoundingClientRect().height - parseFloat(after.top) - parseFloat(after.bottom);
    }),
  );
  for (const h of hits) expect(h).toBeGreaterThanOrEqual(24);
});

// display:block tables on phone (register, fact table, kill criteria, ledger) must keep table semantics for screen
// readers. Playwright's getByRole computes roles from tags, so this reads Chromium's own accessibility tree over CDP:
// every <table> on the page must be exposed as a table with rows and cells, not flattened to generic text. Safari is
// stricter than Chromium here; the trial doc carries a manual VoiceOver/NVDA spot check.
test("tables keep table, row and cell roles in the browser's accessibility tree (display:block on phone)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "reads the Chromium accessibility tree over CDP");
  const cdp = await page.context().newCDPSession(page);
  for (const path of ["/companies", "/companies/kavpump"]) {
    await page.goto(path);
    const domTables = await page.locator("main table:visible").count();
    expect(domTables, path).toBeGreaterThan(0);
    const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as { nodes: { ignored: boolean; role?: { value?: string } }[] };
    const count = (roles: string[]) => nodes.filter((n) => !n.ignored && roles.includes(String(n.role?.value))).length;
    expect({ path, tables: count(["table"]) }).toEqual({ path, tables: domTables });
    expect(count(["row"]), path).toBeGreaterThanOrEqual(2 * domTables); // at least a header row and a body row per table
    expect(count(["cell", "gridcell"]), path).toBeGreaterThan(0);
  }
});
