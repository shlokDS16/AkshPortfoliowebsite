import { expect, test as setup, type Page } from "@playwright/test";
import { requireStack } from "../support/auth";
import { KAVERI, NOTES, PROCESS_NOTE, SAHYADRI, type SeedFile, type SeedNote } from "../../src/test/fixtures/casefile";

// LOCAL stack only (e2e/support/stack.ts refuses any other API URL). Every write goes through the desk screens
// Aksh uses: capture, New names, Details, revisions, the gate. The hosted trial content is entered by Aksh.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// The notice paragraph is the page's status role; filtering by text keeps the selector strict-mode safe (A1.7).
const status = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

// The capture dock marks its button once the page's client code is attached. Text typed into an uncontrolled
// field before that point can be reset by hydration, so every screen waits for it before the first fill.
const hydrated = (page: Page) => expect(page.getByRole("button", { name: "Capture", exact: true })).toHaveAttribute("data-shortcuts", "ready");

async function saveRevision(page: Page, bodyMd: string, sheet: string | null, reason: string) {
  await page.getByLabel("Body (Markdown)").fill(bodyMd);
  if (sheet !== null) await page.getByLabel("Facts sheet").fill(sheet);
  await page.getByLabel("Change reason").fill(reason);
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(status(page, /^Revision saved\.$|waiting for the publishing gate/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check before publishing" })).toBeVisible();
}

async function publish(page: Page, company: string | null) {
  if (company) {
    const make = page.getByRole("button", { name: `Make ${company} public` });
    if (await make.isVisible()) {
      await make.click();
      await expect(status(page, "Company made public")).toBeVisible();
    }
    await page.getByRole("checkbox", { name: /I have not changed my stance on/ }).check();
  }
  await page.getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ }).click();
  await expect(status(page, /^Published\.$/)).toBeVisible();
  await expect(page.locator("#gate").getByTestId("gate-decision")).toHaveAttribute("data-verdict", "pass");
}

// publish_revision() writes the slug ("<title words>-<6 id chars>"), so the fixture slug is only a placeholder: files
// that list a note under Read first (`R | slug` in the sheet) are written with the slug the note actually got.
const noteSlugs = new Map<string, string>();

async function recordSlug(page: Page, note: SeedNote) {
  const slug = page.getByTestId("slug");
  await expect(slug).not.toContainText("automatically");
  noteSlugs.set(note.slug, (await slug.innerText()).trim());
}

async function seedNote(page: Page, note: SeedNote) {
  await page.goto("/desk/items");
  const existing = page.getByRole("link", { name: note.title });
  if (await existing.count()) {
    await existing.first().click();
    await recordSlug(page, note);
    return;
  }
  await page.getByLabel("Kind").selectOption(note.kind);
  await page.getByLabel("Title").fill(note.title);
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("heading", { name: note.title })).toBeVisible();
  await hydrated(page);
  await page.getByLabel("Learning objective").fill(note.learningObjective);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(status(page, "Details saved.")).toBeVisible();
  await saveRevision(page, note.bodyMd, null, note.reason);
  await publish(page, null);
  await recordSlug(page, note);
}

async function seedFile(page: Page, file: SeedFile) {
  await page.goto("/desk/items");
  if (await page.getByRole("link", { name: file.title }).count()) return;
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused(); // the box takes focus once hydrated
  await box.fill(`t: $${file.symbol} first pass on ${file.name}`);
  await box.press("Enter");
  await expect(page.getByText(/^Saved \d{2}:\d{2} · \$/)).toBeVisible();

  await page.goto("/desk/names");
  await hydrated(page);
  const card = page.getByRole("article").filter({ hasText: `$${file.symbol}` });
  await card.getByRole("button", { name: "New company" }).click();
  await card.getByLabel("Name").fill(file.name);
  await card.getByLabel("Sector").selectOption(file.sector);
  await card.getByRole("button", { name: "Yes, add it" }).click();
  await expect(status(page, "Saved. The name is screened.")).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: `$${file.symbol}` })).toHaveCount(0);

  await page.goto("/desk/items");
  await page.getByRole("link", { name: `${file.symbol} thesis` }).click();
  await expect(page.getByRole("heading", { name: `${file.symbol} thesis`, level: 1 })).toBeVisible();
  await hydrated(page);
  await page.getByLabel("Title").fill(file.title);
  await page.getByLabel("Learning objective").fill(file.learningObjective);
  await page.getByLabel("Holds position").selectOption(file.holdsPosition);
  await page.getByLabel("Data as of").fill(daysAgo(45));
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(status(page, "Details saved.")).toBeVisible();
  for (const revision of file.revisions) {
    const sheet = [...noteSlugs].reduce((s, [placeholder, slug]) => s.replaceAll(`R | ${placeholder}`, `R | ${slug}`), revision.sheet);
    await saveRevision(page, revision.bodyMd, sheet, revision.reason);
    await publish(page, file.name);
  }
}

setup("seed two fictional files and three notes through the desk UI", async ({ page }) => {
  requireStack(); // explicit local-only guard (refuses a non-local API URL), whatever ran before
  setup.setTimeout(300_000);
  for (const note of [...NOTES, PROCESS_NOTE]) await seedNote(page, note);
  for (const file of [KAVERI, SAHYADRI]) await seedFile(page, file);
  await page.goto("/desk/items");
  for (const title of [KAVERI.title, SAHYADRI.title, ...NOTES.map((n) => n.title), PROCESS_NOTE.title]) {
    await expect(page.getByRole("listitem").filter({ hasText: title })).toContainText("public");
  }
});
