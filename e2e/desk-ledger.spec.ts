import { expect, test, type Page } from "@playwright/test";
import { requireStack } from "./support/auth";
import { adminDb, expectNoViolationsInBothThemes, hydrated } from "./support/desk";
import { resetToFreshHeartbeats } from "./support/heartbeats";
import { createLedgerCompany, entryIsToday, nearVoidCutoff, seedTodayCloses } from "./support/ledger";
import { E2E_CRON_SECRET } from "./support/stack";

// The private Ledger screens through the real local stack (Plan 3a Task 10): record an idea, see it sealed, add a note, run the
// daily route, close it, write the lesson, and find it in the lists. Runs in the 375 px and the 1280 px desk projects. The
// anonymous-visitor checks are in guard.spec.ts.

test.afterAll(async () => {
  await resetToFreshHeartbeats(requireStack());
});

const THESIS = "  Orders are growing faster than the street expects.\n  I would be wrong if margins fall below 12%.  ";
const NOTE = "Margins held at 14% <b>not bold</b>";

/** Selects a radio the way a keyboard user does: focus it, press Space. */
async function choose(page: Page, label: string): Promise<void> {
  await page.getByLabel(label).focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel(label)).toBeChecked();
}

async function wordsOf(page: Page): Promise<string[]> {
  return page.locator("[data-words]").evaluateAll((els) => els.map((e) => e.textContent ?? ""));
}

async function send(page: Page, button: string): Promise<void> {
  const target = page.getByRole("button", { name: button });
  await expect(target).toBeEnabled(); // enabled once the page's code is attached
  await target.click();
}

test("an idea's whole life: recorded, sealed, noted, scored, closed, learned from, and listed", async ({ page, request }, testInfo) => {
  test.setTimeout(300_000);
  const stack = requireStack();
  const db = await adminDb();
  const company = await createLedgerCompany(db, testInfo.project.name.endsWith("mobile") ? "M" : "D");

  // The Ledger tab: the status block shows the check with its standing limit, never one without the other.
  await page.goto("/desk/ledger");
  await expect(page.getByRole("heading", { level: 1, name: "Ledger" })).toBeVisible();
  await expect(page.getByTestId("chain-ok")).toContainText("Consistent with itself");
  await expect(page.getByTestId("chain-ok")).toContainText("It does not show that nothing could have been changed.");
  await expect(page.getByRole("navigation", { name: "Desk sections" }).first()).toBeAttached();
  await page.getByRole("link", { name: "Record an idea" }).click();
  await expect(page).toHaveURL(/\/desk\/ledger\/new$/);
  await hydrated(page);

  // New idea, by keyboard once the company is picked. No date field exists.
  expect(await page.locator('input[type="date"], input[name*="date" i]').count()).toBe(0);
  await expect(page.locator("#idea-company option", { hasText: "Choose a company" })).toBeDisabled();
  await page.getByLabel("Company").selectOption({ label: `${company.name} (${company.symbol})` });
  await choose(page, "Expects to do worse than the Nifty 50");
  await choose(page, "1 year");
  await choose(page, "No, I do not hold it");
  await page.getByLabel("Why do you think so, and what would prove you wrong?").focus();
  await page.keyboard.type(THESIS);
  await expect(page.getByRole("button", { name: "Record the idea" })).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Record the idea" })).toBeFocused();
  await page.keyboard.press("Enter");

  // Sealed: the idea page, his words exactly as typed, the date set by the desk.
  await expect(page).toHaveURL(/\/desk\/ledger\/[0-9a-f-]{36}\?notice=idea-recorded/);
  const ideaUrl = page.url().split("?")[0] as string;
  await expect(page.getByText("Idea recorded and sealed.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(company.name);
  await expect(page.getByText(/Sealed \d{1,2} \w{3} 20\d\d, \d\d:\d\d\./)).toBeVisible();
  await expect(page.getByText("Entry will be set at the next close.").first()).toBeVisible();
  await expect(page.getByText("Expects to do worse than the Nifty 50").first()).toBeVisible();
  expect(await wordsOf(page)).toEqual([THESIS]);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Scored by the desk", "What you wrote", "Add to this idea"]);
  await hydrated(page);
  if (!nearVoidCutoff()) await expect(page.locator("#event-kind option", { hasText: "Withdraw this idea" })).toHaveCount(1);
  // There is no edit, no delete and no way to reopen.
  await expect(page.getByRole("button", { name: /edit|delete|reopen|remove/i })).toHaveCount(0);

  // An empty entry is refused in words, beside the form, and what was typed stays.
  await page.getByLabel("Your note").fill("   ");
  await send(page, "Add the note");
  await expect(page.getByRole("alert").filter({ hasText: "Write your own words first. An entry cannot be empty." })).toBeVisible();
  await expect(page.getByLabel("Your note")).toHaveValue("   ");

  // A note, by keyboard. His words come back as text, not as markup, and exactly as typed.
  await page.getByLabel("Your note").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(NOTE);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Add the note" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Entry added and sealed.")).toBeVisible();
  expect(await wordsOf(page)).toEqual([THESIS, NOTE]);
  await expect(page.locator("[data-words] b")).toHaveCount(0);
  await expect(page.locator("[data-event]")).toHaveCount(2);

  // The daily route (fixture market data) scores the idea. When today's close can set the entry, seed it and see the date.
  const today = entryIsToday() ? await seedTodayCloses(stack, company.symbol) : null;
  const daily = await request.get("/api/cron/daily", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  if (daily.status() !== 200) {
    const beat = await db.from("heartbeats").select("job, detail").eq("ok", false).order("ran_at", { ascending: false }).limit(1);
    expect(daily.status(), `${await daily.text()} ${JSON.stringify(beat.data)}`).toBe(200);
  }
  await page.goto(ideaUrl);
  if (today) {
    await expect(page.getByText(/Entry: close of \d{1,2} \w{3} 20\d\d\. The first result appears after the next close\./).first()).toBeVisible();
    await expect(page.getByText("Entry", { exact: true })).toBeVisible();
    // The entry and the mark are the same close on the first day, so both rows show it.
    await expect(page.getByText(/close 100\.00, Nifty 50 20,000\.00/)).toHaveCount(2);
    await expect(page.getByText("NSE's official file, fetched by the desk")).toHaveCount(2);
  } else {
    await expect(page.getByText("Entry will be set at the next close.").first()).toBeVisible();
  }

  // Listed under Open ideas, with the direction in words.
  await page.goto("/desk/ledger");
  const open = page.locator("#open");
  await expect(open.getByRole("link", { name: company.name })).toBeVisible();
  await expect(open.locator(`[data-idea]:has(a:text-is("${company.name}"))`)).toContainText("Expects to do worse than the Nifty 50");
  await expectNoViolationsInBothThemes(page);

  // Close it. The exit is the next close; the form then offers only the lesson.
  await page.goto(ideaUrl);
  await hydrated(page);
  await page.getByLabel("What do you want to add?").selectOption({ label: "Close this idea" });
  await page.getByLabel("Reason").selectOption({ label: "Thesis broken" });
  await page.getByLabel("Why you are closing it").fill("Margins broke below 12%.");
  await send(page, "Close the idea");
  await expect(page.getByText("Entry added and sealed.")).toBeVisible();
  await expect(page.getByText(/Closed on \d{1,2} \w{3} 20\d\d: thesis broken/)).toBeVisible();
  await expect(page.getByLabel("What do you want to add?").locator("option")).toHaveText(["Write what I learned"]);
  await expect(page.locator("[data-event]")).toHaveCount(3);

  // Without a lesson it is a card under Needs you; after the lesson it is not.
  await page.goto("/desk/ledger");
  await expect(page.getByRole("heading", { name: /^Needs you/ })).toBeVisible();
  await expect(page.locator("article", { hasText: company.name }).filter({ hasText: "No lesson yet" })).toBeVisible();
  await page.goto(ideaUrl);
  await hydrated(page);
  await choose(page, "Process was flawed");
  await page.getByLabel("Timing").check();
  await page.getByLabel("Luck").check();
  await page.getByLabel("What you learned").fill("I sized it too big for how little I knew.");
  await send(page, "Save what I learned");
  await expect(page.getByText("Entry added and sealed.")).toBeVisible();
  await expect(page.locator("[data-event]")).toHaveCount(4);
  await expect(page.locator("[data-event]").last()).toContainText("Process was flawed");
  await expect(page.locator("[data-event]").last()).toContainText("Tags: Timing, Luck");
  await expectNoViolationsInBothThemes(page);

  // Now it sits in Closed ideas, with its lesson written, and no longer needs you.
  await page.goto("/desk/ledger");
  const closed = page.locator("#closed");
  await expect(closed.locator(`[data-idea]:has(a:text-is("${company.name}"))`)).toContainText("Lesson written");
  await expect(page.locator("article", { hasText: company.name }).filter({ hasText: "No lesson yet" })).toHaveCount(0);
  await expect(page.getByTestId("chain-ok")).toContainText("Consistent with itself");
});

test("the new-idea form is reachable by keyboard from the top of the page, and a company with no symbol is disabled", async ({ page }) => {
  const db = await adminDb();
  const stub = await db.from("companies").insert({ slug: `nosym-${Date.now().toString(36)}`, name: `No Symbol ${Date.now().toString(36)} Ltd` }).select("name").single();
  if (stub.error) throw stub.error;
  await page.goto("/desk/ledger/new");
  await hydrated(page);
  await expect(page.locator("#idea-company option", { hasText: `${stub.data.name}: no NSE symbol yet` })).toBeDisabled();
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Record the idea");
  }
  expect(reached).toBe(true);
});

for (const path of ["/desk/ledger", "/desk/ledger/new"]) {
  test(`${path} is usable at this width without sideways scrolling`, async ({ page }) => {
    await page.goto(path);
    await hydrated(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("an idea that does not exist is a not-found page, not an empty one", async ({ page }) => {
  const response = await page.goto("/desk/ledger/00000000-0000-4000-8000-000000000000");
  expect(response?.status()).toBe(404);
});
