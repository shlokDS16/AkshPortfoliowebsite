import { expect, test, type Page } from "@playwright/test";
import { extractText } from "unpdf";
import { derivedProblems } from "../src/modules/showcase/derived-scan";
import { discover, SITE, state, type Pages } from "./support/derived";

// Plan 5a Task 3 and 4 (spec s5, publishing rule 11.4): a public page prints as a dated document that carries its disclosure, and print
// shows nothing the screen hides. Same states as public-distribution.spec.ts (told by the project's name). The PDF is Chromium's own
// (page.pdf at A4 with the page's own @page margins), read back with unpdf, so what is asserted is what lands on paper.
const HEAD =
  "Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser. Nothing here is a recommendation, offer or solicitation to buy or sell any security. Figures are shown with a minimum 30-day lag. Position in the security discussed: ";
const TAIL = " Investments in securities are subject to market risk; consult a SEBI-registered adviser before acting. Last reviewed ";
const DATE = "\\d{1,2} [A-Z][a-z]{2} \\d{4}";
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const PRINT_ONLY = "[data-print-masthead], [data-print-disclosure], [data-print-banner]";
// Next's own live region for screen readers: injected after a client navigation, whenever hydration finishes, and never on the page.
const FRAMEWORK = "next-route-announcer";
const VISIBLE = { contentVisibilityAuto: true, visibilityProperty: true };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let pages: Pages;
test.beforeAll(async ({ request }) => {
  pages = await discover(request);
});

const printable = () => [
  { name: "file", path: "/companies/kavpump", position: "No" },
  { name: "learning note", path: pages.notes[0], position: "Not disclosed" },
  { name: "process note", path: pages.process[0], position: "Not disclosed" },
  ...(state().casePublic ? [{ name: "case", path: pages.cases[0], position: "(?:Yes|No|Not disclosed)" }] : []),
];

async function pdfText(page: Page): Promise<{ pages: number; text: string }> {
  const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true });
  const { totalPages, text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  return { pages: totalPages, text: text.replace(/\s+/g, " ") };
}

test("Save as PDF is on each printable page, opens the browser's print, and is not on the paper; the masthead is on the paper and not on the screen", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { printCalls: 0 });
    window.print = () => void ((window as unknown as { printCalls: number }).printCalls += 1);
  });
  for (const { name, path } of printable()) {
    await page.goto(path);
    const button = page.getByRole("button", { name: "Save as PDF" });
    await expect(button, name).toHaveCount(1);
    await expect(button, name).toBeVisible();
    await button.click();
    expect(await page.evaluate(() => (window as unknown as { printCalls: number }).printCalls), name).toBe(1);
    const masthead = page.locator("[data-print-masthead]");
    await expect(masthead, name).toBeHidden();
    await page.emulateMedia({ media: "print" });
    await expect(button, name).toBeHidden();
    await expect(masthead, name).toBeVisible();
    await expect(masthead, name).toContainText(`${SITE}${path}`);
    await expect(masthead, name).toContainText(/This copy shows revision R\d+ of /);
    await expect(masthead, name).toContainText("The current version is at the address above.");
    await page.emulateMedia({ media: null });
  }
});

test("on a phone, print shows what the screen shows and adds only the masthead, the disclosure and the desk banner", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the A4 print layout is the phone layout: only there is the screen the same page to compare with");
  for (const { name, path } of printable()) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.emulateMedia({ media: "screen" });
    await page.evaluate((opts) => {
      for (const el of document.querySelectorAll("body *")) if (el.checkVisibility(opts)) el.setAttribute("data-on-screen", "");
    }, VISIBLE);
    await page.emulateMedia({ media: "print" });
    const added = await page.evaluate(
      ({ opts, allowed }) =>
        [...document.querySelectorAll("body *:not([data-on-screen])")]
          .filter((el) => el.checkVisibility(opts) && !el.closest(allowed))
          .map((el) => `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ")[0]}` : ""}`),
      { opts: VISIBLE, allowed: `${PRINT_ONLY}, ${FRAMEWORK}` },
    );
    expect(added, `${name}: shown in print but not on screen`).toEqual([]);
    await expect(page.locator(PRINT_ONLY).first(), `${name}: the comparison ran in print`).toBeVisible();
    // And the other way, on purpose: the chrome of a screen is not on the paper.
    for (const chrome of ["nav[aria-label='Main']", "nav[aria-label='On this page']", "header:has(a[aria-label='Find a file'])"]) await expect(page.locator(chrome), `${name} ${chrome}`).toBeHidden();
    await page.emulateMedia({ media: null });
  }
});

test("a PDF of each public page is dated, addressed and carries the standard disclosure in full, without the screen's controls", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium" || !/-1280/.test(test.info().project.name), "page.pdf is Chromium's; one desktop project per state is enough");
  for (const { name, path, position } of printable()) {
    await page.goto(path);
    const { pages: count, text } = await pdfText(page);
    expect(count, name).toBeGreaterThanOrEqual(1);
    expect(text, `${name}: the standard disclosure`).toMatch(new RegExp(`${escape(HEAD)}${position}\\.${escape(TAIL)}${DATE}\\.`));
    // A long address wraps inside a word on paper, so the text layer holds a space where the line broke.
    expect(text.replace(/\s+/g, ""), `${name}: the masthead`).toContain(`${SITE}${path}`);
    expect(text).toMatch(new RegExp(`This copy shows revision R\\d+ of ${DATE}\\. (?:Figures to ${DATE}\\. )?The current version is at the address above\\.`));
    expect(text).toMatch(/Aksh Agrawal · Case files/i);
    expect(text, name).not.toMatch(UUID);
    // The screen's controls and chrome are not on paper.
    for (const gone of ["Save as PDF", "Skip to content", "Find a file", "On this page"]) expect(text, `${name}: ${gone}`).not.toContain(gone);
    expect(text, `${name}: tab labels`).not.toMatch(/Desk\s+Files(?:\s+\d+)?\s+Notes/);
    expect(text, `${name}: phone index`).not.toMatch(/View\s+Tests(?:\s+\d+)?\s+Facts/);
    if (name === "file") {
      expect(text).toContain("Figures to");
      expect(text).toMatch(/\bR1\b/); // the revision list prints, with its first version
      expect(text).toMatch(/\bR2\b/);
    }
    if (name === "case") {
      // Rule 10.7: no result figure, no id, no verdict on a printed case study.
      expect(derivedProblems(text), "a printed case study").toEqual([]);
    }
  }
});

test("a printed page is the light theme whatever the system is set to", async ({ page }) => {
  await page.goto("/companies/kavpump");
  await page.emulateMedia({ media: "print" });
  const ink = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { color: style.color, background: style.backgroundColor, paper: getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() };
  });
  expect(ink.paper.toUpperCase()).toBe("#F7F2E8");
  expect(ink.color).toBe("rgb(43, 37, 30)");
  expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(ink.background); // white paper: the cream is a screen colour
});
